import { Router } from "express";
import { db, discordChannelsTable, pdDutyLogsTable, officersTable, discordDutyEventsTable, emsDutyLogsTable, dutyAdjustmentsTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";

const MONTH_NAMES = ["","JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

function weekEndMonthNum(wp: string): number {
  const end = wp.split("-")[1] ?? "";
  return parseInt(end.split("/")[0] ?? "0", 10);
}

function parseHmsLocal(h: string | null | undefined): number {
  if (!h || h === "0" || h.trim() === "") return 0;
  const parts = h.trim().split(":").map(Number);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60;
  return 0;
}

function secsToHmsAdj(s: number): string {
  const abs = Math.abs(s);
  const h = Math.floor(abs / 3600), m = Math.floor((abs % 3600) / 60), sec = abs % 60;
  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return s < 0 ? `-${hms}` : `+${hms}`;
}

function secsToHms(s: number): string {
  if (s <= 0) return "00:00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function norm(s: string) { return s.toLowerCase().replace(/[-_.\s]/g, ""); }
function tokens(s: string) { return s.toLowerCase().split(/[\s\-_]+/).filter(Boolean); }
function leetNorm(s: string) {
  return norm(s).replace(/4/g, "a").replace(/3/g, "e").replace(/0/g, "o").replace(/1/g, "i").replace(/5/g, "s").replace(/7/g, "t");
}

const router = Router();

// ── Discord Channels ────────────────────────────────────────────────────────

router.get("/admin/channels", async (_req, res): Promise<void> => {
  const channels = await db.select().from(discordChannelsTable).orderBy(discordChannelsTable.createdAt);
  res.json(channels);
});

router.post("/admin/channels", async (req, res): Promise<void> => {
  const { channelId, channelName } = req.body as { channelId?: string; channelName?: string };
  if (!channelId?.trim() || !channelName?.trim()) {
    res.status(400).json({ error: "channelId and channelName are required" });
    return;
  }
  const trimId = channelId.trim();
  const trimName = channelName.trim();
  const existing = await db.select().from(discordChannelsTable).where(eq(discordChannelsTable.channelId, trimId));
  if (existing.length > 0) { res.status(409).json({ error: "Channel ID already exists" }); return; }
  const [created] = await db.insert(discordChannelsTable).values({ channelId: trimId, channelName: trimName }).returning();
  res.status(201).json(created);
});

router.patch("/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive boolean required" }); return; }
  const [updated] = await db.update(discordChannelsTable).set({ isActive }).where(eq(discordChannelsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(discordChannelsTable).where(eq(discordChannelsTable.id, id));
  res.status(204).end();
});

// ── PD Duty Logs ─────────────────────────────────────────────────────────────

router.get("/admin/duty-logs", async (req, res): Promise<void> => {
  const { search, dateFrom, dateTo, shiftType } = req.query as {
    search?: string; dateFrom?: string; dateTo?: string; shiftType?: string;
  };

  const conditions = [];
  if (shiftType && shiftType !== "All") conditions.push(eq(pdDutyLogsTable.shiftType, shiftType));
  if (dateFrom) conditions.push(gte(pdDutyLogsTable.logDate, dateFrom));
  if (dateTo) conditions.push(lte(pdDutyLogsTable.logDate, dateTo));
  if (search?.trim()) {
    const s = `%${search.trim()}%`;
    conditions.push(or(ilike(pdDutyLogsTable.officerName, s), ilike(pdDutyLogsTable.csNumber, s))!);
  }

  const [logs, allOfficers] = await Promise.all([
    db
      .select()
      .from(pdDutyLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(pdDutyLogsTable.logDate), desc(pdDutyLogsTable.createdAt)),
    db.select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank }).from(officersTable),
  ]);

  // Build a live callSign → {name, rank} lookup so displayed values always
  // reflect the current officer record, even after rank or name changes.
  const officerByCs = new Map(
    allOfficers.filter((o) => o.callSign).map((o) => [o.callSign!, o])
  );

  const enriched = logs.map((l) => {
    const officer = officerByCs.get(l.csNumber);
    if (!officer) return l;
    return { ...l, officerName: officer.name ?? l.officerName, rank: officer.rank ?? l.rank };
  });

  res.json(enriched);
});

router.post("/admin/duty-logs", async (req, res): Promise<void> => {
  const { logDate, csNumber, officerName, rank, shiftType, duration, notes } =
    req.body as Partial<{ logDate: string; csNumber: string; officerName: string; rank: string; shiftType: string; duration: string; notes: string }>;

  if (!logDate || !csNumber?.trim() || !officerName?.trim() || !duration?.trim()) {
    res.status(400).json({ error: "logDate, csNumber, officerName, duration are required" });
    return;
  }
  const [created] = await db.insert(pdDutyLogsTable).values({
    logDate,
    csNumber: csNumber.trim(),
    officerName: officerName.trim(),
    rank: rank?.trim() ?? "",
    shiftType: shiftType ?? "Full",
    duration: duration.trim(),
    notes: notes?.trim() || null,
  }).returning();
  res.status(201).json(created);
});

router.put("/admin/duty-logs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { logDate, csNumber, officerName, rank, shiftType, duration, notes } =
    req.body as Partial<{ logDate: string; csNumber: string; officerName: string; rank: string; shiftType: string; duration: string; notes: string }>;

  if (!logDate || !csNumber?.trim() || !officerName?.trim() || !duration?.trim()) {
    res.status(400).json({ error: "logDate, csNumber, officerName, duration are required" });
    return;
  }
  const [updated] = await db.update(pdDutyLogsTable).set({
    logDate,
    csNumber: csNumber.trim(),
    officerName: officerName.trim(),
    rank: rank?.trim() ?? "",
    shiftType: shiftType ?? "Full",
    duration: duration.trim(),
    notes: notes?.trim() || null,
  }).where(eq(pdDutyLogsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/duty-logs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(pdDutyLogsTable).where(eq(pdDutyLogsTable.id, id));
  res.status(204).end();
});

// Officers list for dropdown
router.get("/admin/officers-list", async (_req, res): Promise<void> => {
  const officers = await db
    .select({ id: officersTable.id, callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank })
    .from(officersTable)
    .orderBy(asc(officersTable.callSign));
  res.json(officers);
});

// ── Import Discord Events → Duty Logs ───────────────────────────────────────

router.post("/admin/duty-logs/import-discord", async (req, res): Promise<void> => {
  // 1. Fetch all events ordered by license + time
  const events = await db
    .select()
    .from(discordDutyEventsTable)
    .orderBy(asc(discordDutyEventsTable.licenseId), asc(discordDutyEventsTable.eventAt));

  // 2. Fetch officers for matching
  const officers = await db.select().from(officersTable);

  // Build licenseId → officer map (for those with rockstar_license_id)
  const licenseMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) {
      // Strip optional "license:" prefix so raw hashes from Discord events match
      const rawId = o.rockstarLicenseId.replace(/^license:/, "");
      licenseMap.set(rawId, o);
    }
  }

  // Fuzzy name matcher (same strategy as dashboard)
  function findByName(evName: string): typeof officers[0] | null {
    const evNorm = norm(evName);
    const evLeet = leetNorm(evName);
    const evTokens = tokens(evName);
    const evLeetTokens = evLeet.split(/[^a-z]+/).filter(Boolean);
    const candidates: typeof officers[0][] = [];
    for (const o of officers) {
      const rosterNorm = norm(o.name ?? "");
      const discordNorm = norm(o.discordUsername ?? "");
      const discordLeet = leetNorm(o.discordUsername ?? "");
      const rosterTokens = tokens(o.name ?? "");
      if (rosterNorm === evNorm) return o;
      if (evLeet.length >= 3 && (discordNorm.includes(evLeet) || discordLeet.includes(evLeet) || evLeet.includes(discordNorm))) { candidates.push(o); continue; }
      if (evNorm.length >= 3 && (discordNorm.includes(evNorm) || evNorm.includes(discordNorm))) { candidates.push(o); continue; }
      const matched = [...evTokens, ...evLeetTokens].some((t) => {
        if (t.length < 3) return false;
        return discordNorm.includes(t) || discordLeet.includes(t) || rosterTokens[0] === t;
      });
      if (matched) { candidates.push(o); continue; }
    }
    return candidates.length === 1 ? candidates[0]! : null;
  }

  // 3. Group events by licenseId
  const byLicense = new Map<string, typeof events>();
  for (const ev of events) {
    const list = byLicense.get(ev.licenseId) ?? [];
    list.push(ev);
    byLicense.set(ev.licenseId, list);
  }

  // 4. Pair on→off and build log entries
  type NewLog = typeof pdDutyLogsTable.$inferInsert;
  const newLogs: NewLog[] = [];

  for (const [licenseId, evList] of byLicense) {
    const officer = licenseMap.get(licenseId) ?? findByName(evList[0]?.officerName ?? "");
    let pendingOn: typeof evList[0] | null = null;

    for (const ev of evList) {
      if (ev.eventType === "on") {
        pendingOn = ev;
      } else if (ev.eventType === "off" && pendingOn) {
        const durationSecs = Math.floor((ev.eventAt.getTime() - pendingOn.eventAt.getTime()) / 1000);
        if (durationSecs > 30) {  // skip spurious sub-30s sessions
          const logDate = pendingOn.eventAt.toISOString().split("T")[0]!;
          const startTime = pendingOn.eventAt.toISOString().substring(11, 16); // "HH:MM" UTC
          const endTime = ev.eventAt.toISOString().substring(11, 16);
          newLogs.push({
            logDate,
            startTime,
            endTime,
            csNumber: officer?.callSign ?? "",
            officerName: officer?.name ?? pendingOn.officerName,
            rank: officer?.rank ?? pendingOn.rank ?? "",
            shiftType: "Full",
            duration: secsToHms(durationSecs),
            notes: "discord",
          });
        }
        pendingOn = null;
      }
    }
  }

  // 5. Clear previous discord-imported logs, then bulk insert
  await db.delete(pdDutyLogsTable).where(eq(pdDutyLogsTable.notes, "discord"));

  if (newLogs.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < newLogs.length; i += CHUNK) {
      await db.insert(pdDutyLogsTable).values(newLogs.slice(i, i + CHUNK));
    }
  }

  res.json({ imported: newLogs.length });
});

// ── Duty Adjustments ─────────────────────────────────────────────────────────

router.get("/admin/duty-adjustments", async (req, res): Promise<void> => {
  const { month, year, shiftType } = req.query as { month?: string; year?: string; shiftType?: string };
  if (!month || !year) { res.status(400).json({ error: "month and year required" }); return; }

  const monthNum = MONTH_NAMES.indexOf(month.toUpperCase());
  if (monthNum < 1) { res.status(400).json({ error: "Invalid month" }); return; }

  const resolvedShift = shiftType && shiftType !== "ALL" ? shiftType : "ALL";

  const logConds = [
    eq(emsDutyLogsTable.dutyYear, year),
    eq(emsDutyLogsTable.shiftType, resolvedShift),
  ];

  const adjConds = [
    eq(dutyAdjustmentsTable.dutyMonth, month.toUpperCase()),
    eq(dutyAdjustmentsTable.dutyYear, year),
    eq(dutyAdjustmentsTable.shiftType, resolvedShift),
  ];

  const [allOfficers, allLogs, adjustments] = await Promise.all([
    db.select({
      callSign: officersTable.callSign,
      name: officersTable.name,
      rank: officersTable.rank,
      status: officersTable.status,
    }).from(officersTable).orderBy(asc(officersTable.callSign)),
    db.select().from(emsDutyLogsTable).where(and(...logConds)),
    db.select().from(dutyAdjustmentsTable)
      .where(and(...adjConds))
      .orderBy(desc(dutyAdjustmentsTable.createdAt)),
  ]);

  const officerMap = new Map(allOfficers.filter((o) => o.callSign).map((o) => [o.callSign!, o]));

  const baseSecs: Record<string, number> = {};
  for (const l of allLogs) {
    if (!officerMap.has(l.csNumber)) continue;
    if (weekEndMonthNum(l.weekPeriod) !== monthNum) continue;
    baseSecs[l.csNumber] = (baseSecs[l.csNumber] ?? 0) + parseHmsLocal(l.dutyHours);
  }

  const adjSecs: Record<string, number> = {};
  for (const a of adjustments) {
    adjSecs[a.officerCs] = (adjSecs[a.officerCs] ?? 0) + a.adjustmentSeconds;
  }

  const officers = allOfficers.map((o) => {
    const cs = o.callSign!;
    const base = baseSecs[cs] ?? 0;
    const adj = adjSecs[cs] ?? 0;
    const total = Math.max(0, base + adj);
    return {
      cs,
      name: o.name ?? cs,
      rank: o.rank,
      status: o.status,
      baseSecs: base,
      adjustSecs: adj,
      totalSecs: total,
      baseTotal: secsToHms(base),
      adjustTotal: adj === 0 ? "+00:00:00" : secsToHmsAdj(adj),
      grandTotal: secsToHms(total),
    };
  });

  res.json({
    month: month.toUpperCase(),
    year,
    officers,
    adjustments: adjustments.map((a) => ({
      id: a.id,
      officerCs: a.officerCs,
      officerName: a.officerName,
      adjustmentSeconds: a.adjustmentSeconds,
      adjustDisplay: secsToHmsAdj(a.adjustmentSeconds),
      note: a.note,
      createdAt: a.createdAt,
    })),
  });
});

router.post("/admin/duty-adjustments", async (req, res): Promise<void> => {
  const { officerCs, officerName, dutyMonth, dutyYear, shiftType, adjustmentSeconds, note } = req.body as {
    officerCs?: string; officerName?: string; dutyMonth?: string; dutyYear?: string;
    shiftType?: string; adjustmentSeconds?: number; note?: string;
  };
  if (!officerCs?.trim() || !dutyMonth?.trim() || !dutyYear?.trim() || typeof adjustmentSeconds !== "number" || adjustmentSeconds === 0) {
    res.status(400).json({ error: "officerCs, dutyMonth, dutyYear, adjustmentSeconds (non-zero) required" }); return;
  }
  const [created] = await db.insert(dutyAdjustmentsTable).values({
    officerCs: officerCs.trim(),
    officerName: officerName?.trim() || null,
    dutyMonth: dutyMonth.trim().toUpperCase(),
    dutyYear: dutyYear.trim(),
    shiftType: shiftType?.trim() || "ALL",
    adjustmentSeconds,
    note: note?.trim() || null,
  }).returning();
  res.status(201).json(created);
});

router.delete("/admin/duty-adjustments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(dutyAdjustmentsTable).where(eq(dutyAdjustmentsTable.id, id));
  res.status(204).end();
});

export default router;
