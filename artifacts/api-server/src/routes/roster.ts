import { Router, type IRouter } from "express";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { db, officersTable, emsDutyLogsTable, dutyAdjustmentsTable, qualificationChartTable, exPdOfficersTable, studentProgressionsTable } from "@workspace/db";
import { syncVotersToQualChart } from "./qualification.js";
import { syncStudentProgressionsWithRoster } from "./student-progressions.js";
import { auditLog } from "../lib/audit.js";
import {
  ListOfficersQueryParams,
  ListOfficersResponse,
  CreateOfficerBody,
  GetRosterStatsQueryParams,
  GetRosterStatsResponse,
  GetFtoPairsQueryParams,
  GetFtoPairsResponse,
  ListWeekPeriodsResponse,
  GetOfficerParams,
  GetOfficerResponse,
  UpdateOfficerParams,
  UpdateOfficerBody,
  UpdateOfficerResponse,
  DeleteOfficerParams,
} from "@workspace/api-zod";

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

const router: IRouter = Router();

router.get("/roster", async (req, res): Promise<void> => {
  const parsed = ListOfficersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { department, status, weekPeriod, ftp, isManagement } = parsed.data;

  const conditions = [];
  if (department) conditions.push(eq(officersTable.department, department));
  if (status) conditions.push(eq(officersTable.status, status));
  if (weekPeriod) conditions.push(eq(officersTable.weekPeriod, weekPeriod));
  if (ftp === "true") conditions.push(eq(officersTable.ftp, true));
  if (ftp === "false") conditions.push(eq(officersTable.ftp, false));
  if (isManagement === "true") conditions.push(eq(officersTable.isManagement, true));
  if (isManagement === "false") conditions.push(eq(officersTable.isManagement, false));

  const officers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(officersTable.rank, officersTable.callSign);

  res.json(ListOfficersResponse.parse(officers));
});

router.post("/roster", async (req, res): Promise<void> => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [officer] = await db
    .insert(officersTable)
    .values(parsed.data)
    .returning();

  // Auto-add to qualification chart if not already present
  if (officer.name) {
    const existing = await db
      .select({ id: qualificationChartTable.id })
      .from(qualificationChartTable)
      .where(eq(qualificationChartTable.name, officer.name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(qualificationChartTable).values({
        name: officer.name,
        rank: officer.rank ?? null,
        department: officer.department ?? null,
        daysInRank: 0,
        hoursInRank: 0,
        citationCount: 0,
        firCount: 0,
        lastPromotion: todayMDY(),
        strikesMajor: "0/4",
        strikesMinor: "0/2",
        qualStatus: null,
      });
    }
  }

  // Auto-sync Student Progressions if new officer joins PTA
  if (officer.department === "PTA") {
    await syncStudentProgressionsWithRoster();
  }

  await auditLog(req, "CREATE", "officer", officer.id, officer.name ?? officer.callSign, null);
  res.status(201).json(GetOfficerResponse.parse(officer));
});

router.get("/roster/stats", async (req, res): Promise<void> => {
  const parsed = GetRosterStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod, month, year } = parsed.data;

  // Convert 2-digit month number → full uppercase month name used in duty_adjustments
  const MONTH_NAMES = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  function monthNumToName(m: string): string {
    const idx = parseInt(m, 10) - 1;
    return idx >= 0 && idx < 12 ? MONTH_NAMES[idx] : m.toUpperCase();
  }

  function parseDutyMinutes(dutyHours: string | null): number {
    if (!dutyHours || dutyHours.trim() === "0" || dutyHours.trim() === "") return 0;
    // "HH:MM:SS" format (e.g. "25:56:18") — primary format in ems_duty_logs
    const colonMatch = dutyHours.match(/^(\d+):(\d{2}):(\d{2})$/);
    if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    // "Xh Ym" fallback (e.g. "2h 30m")
    const hMatch = dutyHours.match(/(\d+)h/);
    const mMatch = dutyHours.match(/(\d+)m/);
    return (hMatch ? parseInt(hMatch[1]) : 0) * 60 + (mMatch ? parseInt(mMatch[1]) : 0);
  }

  // Officer counts & breakdowns always from current officers table (no period filter needed)
  const allOfficers = await db.select().from(officersTable);

  const totalOfficers = allOfficers.length;
  const activeOfficers = allOfficers.filter((o) => o.status === "Active").length;
  const loaOfficers = allOfficers.filter((o) => o.status === "LOA").length;

  const deptMap: Record<string, number> = {};
  const rankMap: Record<string, number> = {};
  for (const o of allOfficers) {
    deptMap[o.department] = (deptMap[o.department] ?? 0) + 1;
    rankMap[o.rank] = (rankMap[o.rank] ?? 0) + 1;
  }

  const departmentBreakdown = Object.entries(deptMap).map(([department, count]) => ({ department, count }));
  const rankBreakdown = Object.entries(rankMap).map(([rank, count]) => ({ rank, count }));

  // Top performers come from ems_duty_logs, filtered by period when specified
  // weekPeriod format: "MM/DD-MM/DD" — end-month at chars 7-8 (SQL 1-indexed)
  // dutyYear column stores the 4-digit year for cross-year correctness
  // Always filter by shift_type = 'ALL' to avoid double-counting per-shift rows
  const logConditions: ReturnType<typeof eq>[] = [eq(emsDutyLogsTable.shiftType, "ALL")];
  if (weekPeriod) {
    logConditions.push(eq(emsDutyLogsTable.weekPeriod, weekPeriod));
  } else {
    if (month) logConditions.push(sql`SUBSTRING(${emsDutyLogsTable.weekPeriod}, 7, 2) = ${month}` as ReturnType<typeof eq>);
    if (year)  logConditions.push(eq(emsDutyLogsTable.dutyYear, year));
  }

  // Build adjustment conditions matching the same period
  const adjConditions: ReturnType<typeof eq>[] = [eq(dutyAdjustmentsTable.shiftType, "ALL")];
  if (month) {
    adjConditions.push(eq(dutyAdjustmentsTable.dutyMonth, monthNumToName(month)));
    if (year) adjConditions.push(eq(dutyAdjustmentsTable.dutyYear, year));
  } else if (year) {
    adjConditions.push(eq(dutyAdjustmentsTable.dutyYear, year));
  }
  // For weekPeriod, extract end-month from "MM/DD-MM/DD" and use it
  if (weekPeriod) {
    const endMonthNum = weekPeriod.slice(6, 8);
    adjConditions.push(eq(dutyAdjustmentsTable.dutyMonth, monthNumToName(endMonthNum)));
  }

  const [dutyLogs, adjustments] = await Promise.all([
    db.select().from(emsDutyLogsTable).where(and(...logConditions)),
    db.select().from(dutyAdjustmentsTable).where(and(...adjConditions)),
  ]);

  // Group adjustments by officerCs → net seconds
  const adjSecsByCs = new Map<string, number>();
  for (const a of adjustments) {
    adjSecsByCs.set(a.officerCs, (adjSecsByCs.get(a.officerCs) ?? 0) + a.adjustmentSeconds);
  }

  // Group by csNumber, sum duty hours, use latest name/rank per officer
  const byCs = new Map<string, { name: string; rank: string; department: string; id: number; totalMins: number }>();
  // Build officer map for quick department lookup
  const officerByCs = new Map(allOfficers.filter((o) => o.callSign).map((o) => [o.callSign!, o]));

  // Pre-seed all active (non-LOA) roster officers with 0 hours so newly
  // added officers always appear in the list even with no duty logs yet
  for (const [cs, officer] of officerByCs.entries()) {
    if (officer.status === "LOA") continue;
    byCs.set(cs, {
      name: officer.name ?? cs,
      rank: officer.rank ?? "",
      department: officer.department,
      id: officer.id,
      totalMins: 0,
    });
  }

  for (const log of dutyLogs) {
    const key = log.csNumber;
    // Only include PD officers — skip any call signs not in the roster
    const officer = officerByCs.get(key);
    if (!officer) continue;
    const existing = byCs.get(key);
    const mins = parseDutyMinutes(log.dutyHours);
    if (!existing) {
      byCs.set(key, {
        name: officer.name ?? log.name,
        rank: officer.rank ?? log.rank,
        department: officer.department,
        id: log.id,
        totalMins: mins,
      });
    } else {
      existing.totalMins += mins;
    }
  }

  // Apply manual adjustments (stored as seconds → convert to minutes)
  for (const [cs, adjSecs] of adjSecsByCs.entries()) {
    const entry = byCs.get(cs);
    if (entry) {
      entry.totalMins = Math.max(0, entry.totalMins + Math.round(adjSecs / 60));
    }
  }

  const topDutyHours = Array.from(byCs.entries())
    .sort(([, a], [, b]) => b.totalMins - a.totalMins)
    .map(([callSign, e]) => {
      const h = Math.floor(e.totalMins / 60);
      const m = e.totalMins % 60;
      return {
        id: e.id,
        callSign,
        name: e.name,
        rank: e.rank,
        department: e.department,
        dutyHours: e.totalMins > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : "0h 00m",
      };
    });

  const stats = {
    totalOfficers,
    activeOfficers,
    loaOfficers,
    departmentBreakdown,
    rankBreakdown,
    topDutyHours,
    weekPeriod: weekPeriod ?? "",
  };

  res.json(GetRosterStatsResponse.parse(stats));
});

router.get("/roster/fto-pairs", async (req, res): Promise<void> => {
  const parsed = GetFtoPairsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod } = parsed.data;
  const conditions = weekPeriod ? [eq(officersTable.weekPeriod, weekPeriod)] : [];

  const officers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(officersTable.appointedFto, officersTable.callSign);

  const ftoMap: Record<string, typeof officers> = {};
  for (const o of officers) {
    if (o.appointedFto) {
      if (!ftoMap[o.appointedFto]) ftoMap[o.appointedFto] = [];
      ftoMap[o.appointedFto].push(o);
    }
  }

  const pairs = Object.entries(ftoMap).map(([ftoName, trainees]) => ({
    ftoName,
    trainees,
  }));

  res.json(GetFtoPairsResponse.parse(pairs));
});

router.get("/roster/week-periods", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
    .from(emsDutyLogsTable)
    .orderBy(desc(emsDutyLogsTable.weekPeriod));

  const periods = rows.map((r) => r.weekPeriod).filter((p) => p && p.trim() !== "");
  res.json(ListWeekPeriodsResponse.parse(periods));
});

router.get("/roster/:id", async (req, res): Promise<void> => {
  const params = GetOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [officer] = await db
    .select()
    .from(officersTable)
    .where(eq(officersTable.id, params.data.id));

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  res.json(GetOfficerResponse.parse(officer));
});

router.put("/roster/:id", async (req, res): Promise<void> => {
  const params = UpdateOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Read extra fields not in the Zod schema (e.g. exitDate from Make Ex PD dialog)
  const exitDate: string | undefined = typeof req.body.exitDate === "string" ? req.body.exitDate : undefined;

  // Fetch current record so we know the old callSign before any update
  const [existing] = await db.select().from(officersTable).where(eq(officersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [officer] = await db
    .update(officersTable)
    .set(parsed.data)
    .where(eq(officersTable.id, params.data.id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  // Cascade name/rank/status changes to ems_duty_logs.
  // If call sign changed, also move the stored csNumber to keep rows linked.
  const oldCs = existing.callSign ?? "";
  const newCs = officer.callSign ?? oldCs;
  if (oldCs) {
    await db.update(emsDutyLogsTable).set({
      ...(newCs !== oldCs ? { csNumber: newCs } : {}),
      name: officer.name ?? "",
      rank: officer.rank ?? "",
      status: officer.status ?? "Active",
    }).where(eq(emsDutyLogsTable.csNumber, oldCs));
  }

  // Sync changes to qualification chart
  const rankChanged = existing.rank !== officer.rank && !!officer.rank;
  const nameChanged = existing.name !== officer.name && !!officer.name;
  const promotionDateChanged = !rankChanged && existing.lastPromotion !== officer.lastPromotion && officer.lastPromotion !== undefined;
  const deptChanged = existing.department !== officer.department && !!officer.department;
  const strikesMajorChanged = existing.strikesMajor !== officer.strikesMajor && officer.strikesMajor !== undefined;
  const strikesMinorChanged = existing.strikesMinor !== officer.strikesMinor && officer.strikesMinor !== undefined;
  const discordUidChanged = existing.discordUid !== officer.discordUid && officer.discordUid !== undefined;

  const needsQualSync = rankChanged || nameChanged || promotionDateChanged || deptChanged
    || strikesMajorChanged || strikesMinorChanged || discordUidChanged;

  if (officer.name && needsQualSync) {
    const searchName = nameChanged ? existing.name : officer.name;
    if (searchName) {
      const qualRows = await db
        .select({ id: qualificationChartTable.id })
        .from(qualificationChartTable)
        .where(eq(qualificationChartTable.name, searchName))
        .limit(1);

      const qualUpdate: Record<string, any> = { updatedAt: new Date() };
      if (nameChanged) qualUpdate.name = officer.name!;
      if (deptChanged) qualUpdate.department = officer.department!;
      if (strikesMajorChanged) qualUpdate.strikesMajor = officer.strikesMajor;
      if (strikesMinorChanged) qualUpdate.strikesMinor = officer.strikesMinor;
      if (discordUidChanged) qualUpdate.discordUid = officer.discordUid;
      if (rankChanged) {
        qualUpdate.rank = officer.rank!;
        qualUpdate.lastPromotion = todayMDY();
        qualUpdate.daysInRank = 0;
        // Reset voting system and status for new rank cycle
        qualUpdate.ftbVotes = {};
        qualUpdate.hcVotes = {};
        qualUpdate.qualStatus = null;
      } else if (promotionDateChanged) {
        // Manual promotion date edit — sync it to qual chart and reset daysInRank
        qualUpdate.lastPromotion = officer.lastPromotion;
        qualUpdate.daysInRank = 0;
      }

      if (qualRows.length > 0) {
        await db.update(qualificationChartTable)
          .set(qualUpdate)
          .where(eq(qualificationChartTable.id, qualRows[0].id));
      } else if (rankChanged || promotionDateChanged) {
        // Officer not in qual chart yet — create entry
        await db.insert(qualificationChartTable).values({
          name: officer.name!,
          rank: officer.rank ?? null,
          department: officer.department ?? null,
          daysInRank: 0,
          hoursInRank: 0,
          citationCount: 0,
          firCount: 0,
          lastPromotion: rankChanged ? todayMDY() : (officer.lastPromotion ?? null),
          strikesMajor: officer.strikesMajor ?? "0/4",
          strikesMinor: officer.strikesMinor ?? "0/2",
          discordUid: officer.discordUid ?? null,
          qualStatus: null,
        });
      }
    }
  }

  // Auto-sync FTP/Management voters to qual chart vote columns whenever those flags change
  if ("ftp" in parsed.data || "isManagement" in parsed.data) {
    await syncVotersToQualChart();
  }

  // Auto-sync Student Progressions when officer department changes involving PTA
  if (deptChanged && (existing.department === "PTA" || officer.department === "PTA")) {
    await syncStudentProgressionsWithRoster();
  }

  // Build a diff of what changed
  const TRACKED = ["name","rank","status","callSign","division","department","dateOfJoining","lastPromotion","strikesMajor","strikesMinor","discordUsername","discordUid"] as const;
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of TRACKED) {
    const oldVal = (existing as any)[key];
    const newVal = (officer as any)[key];
    if (oldVal !== newVal) diff[key] = { old: oldVal, new: newVal };
  }
  if (Object.keys(diff).length > 0) {
    await auditLog(req, "UPDATE", "officer", officer.id, officer.name ?? officer.callSign, diff);
  }

  // Auto-add to Ex-PD list + remove from Roster & QC when exit status is applied
  const EXIT_STATUSES = ["DISCHARGED", "FIRED", "REMOVED", "TERMINATED", "RESIGNED"];
  const statusChanged = existing.status !== officer.status;
  const isExitStatus = !!(officer.status && EXIT_STATUSES.includes(officer.status));

  if (statusChanged && isExitStatus) {
    // 0) Fetch student_progressions record (for FTP phase note)
    let ftpNotes: string | null = null;
    let studentRow: { id: number; currentPhase: string | null } | null = null;
    if (officer.name) {
      const spConditions = [];
      if (officer.callSign) spConditions.push(eq(studentProgressionsTable.badgeNumber, officer.callSign));
      spConditions.push(eq(studentProgressionsTable.name, officer.name));
      const [spRow] = await db
        .select({ id: studentProgressionsTable.id, currentPhase: studentProgressionsTable.currentPhase })
        .from(studentProgressionsTable)
        .where(or(...spConditions))
        .limit(1);
      if (spRow) {
        studentRow = spRow;
        const phase = spRow.currentPhase?.trim() || "Phase 1";
        const rank = officer.rank ?? "CADET";
        ftpNotes = `FTP: ${rank} (${phase})`;
      }
    }

    // Build auto notes: FTP status + FTO assignment; PTA cadets also get phase
    const ftpPart = officer.ftp ? "FTP: Yes" : "FTP: No";
    const ftoPart = officer.appointedFto ? `FTO: ${officer.appointedFto}` : null;
    const baseParts = [ftpPart, ftoPart].filter(Boolean) as string[];

    let notesValue: string | null;
    if (ftpNotes) {
      notesValue = [...baseParts, ftpNotes].join(" | ");
    } else {
      notesValue = baseParts.join(" | ");
    }

    // 1) Insert into ex_pd_officers if name is available
    if (officer.name) {
      await db.insert(exPdOfficersTable).values({
        callSign: officer.callSign ?? null,
        characterId: officer.citizenId ?? null,
        name: officer.name,
        phoneNo: officer.phoneNumber ?? null,
        division: officer.department ?? null,
        rank: officer.rank ?? null,
        discordUsername: officer.discordUsername ?? null,
        discordUid: officer.discordUid ?? officer.discordId ?? null,
        rockstarLicenseId: officer.rockstarLicenseId ?? null,
        status: officer.status,
        exitDate: exitDate ?? null,
        dateOfJoining: officer.dateOfJoining ?? null,
        lastPromotion: officer.lastPromotion ?? null,
        air1: officer.pilot ?? false,
        speed: officer.seu ?? false,
        notes: notesValue,
      });
    }

    // 2) Remove from Qualification Chart by name
    if (officer.name) {
      await db.delete(qualificationChartTable)
        .where(eq(qualificationChartTable.name, officer.name));
    }

    // 3) Remove from Student Progressions (PTA cadets) by callSign or name
    if (studentRow) {
      await db.delete(studentProgressionsTable)
        .where(eq(studentProgressionsTable.id, studentRow.id));
    }

    // 4) Remove from Roster
    await db.delete(officersTable)
      .where(eq(officersTable.id, officer.id));

    // Return the officer data before deletion so the frontend can update its cache
    res.json(UpdateOfficerResponse.parse({ ...officer, _removed: true }));
    return;
  }

  res.json(UpdateOfficerResponse.parse(officer));
});

router.delete("/roster/:id", async (req, res): Promise<void> => {
  const params = DeleteOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [officer] = await db
    .delete(officersTable)
    .where(eq(officersTable.id, params.data.id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  await auditLog(req, "DELETE", "officer", officer.id, officer.name ?? officer.callSign, null);
  res.sendStatus(204);
});

// Officer lookup by citation name string e.g. "Tasin Rahaman [76]"
// The number in brackets is the officer's CID (citizen_id), not callsign
// Accepts both GET (?name=...) and POST (body: {name: ...})
router.post("/roster/officer-lookup", async (req, res): Promise<void> => {
  console.log("[officer-lookup POST] body:", req.body);
  const raw = String(req.body?.name ?? "").trim();
  if (!raw) { res.status(400).json({ error: "name required" }); return; }

  const cidMatch = /\[(\d+)\]/.exec(raw);
  const cid = cidMatch ? cidMatch[1] : null;
  const namePart = raw.replace(/\s*\[.*?\]\s*$/, "").trim();

  const sel = { id: officersTable.id, name: officersTable.name, callSign: officersTable.callSign, discordUid: officersTable.discordUid };
  let officer: typeof sel | null = null;

  if (!officer && cid) {
    const rows = await db.select(sel).from(officersTable).where(eq(officersTable.citizenId, cid)).limit(1);
    if (rows[0]) officer = rows[0];
  }
  if (!officer && namePart) {
    const rows = await db.select(sel).from(officersTable).where(sql`${officersTable.name} ILIKE ${"%" + namePart + "%"}`).limit(1);
    if (rows[0]) officer = rows[0];
  }
  if (!officer && namePart) {
    const firstName = namePart.split(/\s+/)[0];
    if (firstName && firstName.length >= 3) {
      const rows = await db.select(sel).from(officersTable).where(sql`${officersTable.name} ILIKE ${firstName + " %"}`).limit(1);
      if (rows[0]) officer = rows[0];
    }
  }
  if (!officer && namePart) {
    const words = namePart.split(/\s+/).filter((w: string) => w.length >= 4);
    for (const word of words) {
      const rows = await db.select(sel).from(officersTable).where(sql`${officersTable.name} ILIKE ${"%" + word + "%"}`).limit(1);
      if (rows[0]) { officer = rows[0]; break; }
    }
  }

  if (!officer) { res.status(404).json({ error: "Officer not found", searched: raw }); return; }
  res.json(officer);
});

router.get("/roster/officer-lookup", async (req, res): Promise<void> => {
  console.log("[officer-lookup] query:", req.query, "url:", req.url);
  const raw = String(req.query.name ?? "").trim();
  if (!raw) { res.status(400).json({ error: "name required" }); return; }

  // Extract CID from "[76]" pattern
  const cidMatch = /\[(\d+)\]/.exec(raw);
  const cid = cidMatch ? cidMatch[1] : null;
  // Name part without the bracket
  const namePart = raw.replace(/\s*\[.*?\]\s*$/, "").trim();

  const sel = { id: officersTable.id, name: officersTable.name, callSign: officersTable.callSign, discordUid: officersTable.discordUid };

  let officer: typeof sel | null = null;

  // 1) Match by citizen_id — most reliable
  if (!officer && cid) {
    const rows = await db.select(sel).from(officersTable)
      .where(eq(officersTable.citizenId, cid))
      .limit(1);
    if (rows[0]) officer = rows[0];
  }

  // 2) Full name contain search
  if (!officer && namePart) {
    const rows = await db.select(sel).from(officersTable)
      .where(sql`${officersTable.name} ILIKE ${"%" + namePart + "%"}`)
      .limit(1);
    if (rows[0]) officer = rows[0];
  }

  // 3) First name only search
  if (!officer && namePart) {
    const firstName = namePart.split(/\s+/)[0];
    if (firstName && firstName.length >= 3) {
      const rows = await db.select(sel).from(officersTable)
        .where(sql`${officersTable.name} ILIKE ${firstName + " %"}`)
        .limit(1);
      if (rows[0]) officer = rows[0];
    }
  }

  // 4) Any word from the name
  if (!officer && namePart) {
    const words = namePart.split(/\s+/).filter(w => w.length >= 4);
    for (const word of words) {
      const rows = await db.select(sel).from(officersTable)
        .where(sql`${officersTable.name} ILIKE ${"%" + word + "%"}`)
        .limit(1);
      if (rows[0]) { officer = rows[0]; break; }
    }
  }

  if (!officer) { res.status(404).json({ error: "Officer not found", searched: namePart }); return; }
  res.json(officer);
});

export default router;
