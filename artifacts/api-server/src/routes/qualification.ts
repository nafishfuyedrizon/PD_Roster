import { Router, type IRouter } from "express";
import { db, qualificationChartTable, officersTable, studentProgressionsTable } from "@workspace/db";
import { eq, sql, notInArray, or, ilike, and } from "drizzle-orm";
import { auditLog } from "../lib/audit.js";

const router: IRouter = Router();

const HC_RANK_ORDER: Record<string, number> = {
  "CHIEF": 1, "ASSISTANT CHIEF": 2, "SHERIFF": 2, "COLONEL": 2,
  "SENIOR DEPUTY CHIEF": 3, "UNDERSHERIFF": 3, "ASSISTANT COLONEL": 3,
  "DEPUTY CHIEF": 4, "ASSISTANT SHERIFF": 4, "DEPUTY COLONEL": 4,
  "CAPTAIN": 5, "LIEUTENANT": 6, "SERGEANT FIRST CLASS": 7, "SERGEANT": 8,
  "CORPORAL": 9, "SENIOR TROOPER": 10, "SENIOR DEPUTY": 10, "SENIOR STATE TROOPER": 10,
  "TROOPER FIRST CLASS": 11, "DEPUTY FIRST CLASS": 11, "STATE TROOPER FIRST CLASS": 11,
  "TROOPER": 12, "DEPUTY": 12, "STATE TROOPER": 12,
  "PROBATIONARY OFFICER": 13, "CADET": 14, "TRAINEE": 15,
};

function rankOrder(rank: string): number {
  return HC_RANK_ORDER[rank.toUpperCase()] ?? 99;
}

/**
 * Syncs FTP members and Management Command members into qual chart vote columns.
 * - ftb_votes: FTP officers with rank > 3 (field trainers)
 * - hc_votes: FTP officers with rank ≤ 3 (command) + Management officers with rank ≤ 3
 * Adds missing voter keys (with "" default), removes departed voter keys,
 * and preserves existing vote values.
 */
export async function syncVotersToQualChart(): Promise<void> {
  const [ftpOfficers, mgmtOfficers, qualRows] = await Promise.all([
    db.select({ name: officersTable.name, rank: officersTable.rank })
      .from(officersTable).where(eq(officersTable.ftp, true)),
    db.select({ name: officersTable.name, rank: officersTable.rank })
      .from(officersTable).where(eq(officersTable.isManagement, true)),
    db.select({ id: qualificationChartTable.id, ftbVotes: qualificationChartTable.ftbVotes, hcVotes: qualificationChartTable.hcVotes })
      .from(qualificationChartTable),
  ]);

  const ftbVoters = ftpOfficers
    .filter(o => rankOrder(o.rank ?? "") > 3)
    .map(o => o.name ?? "").filter(Boolean);

  const hcFromFtp = ftpOfficers
    .filter(o => rankOrder(o.rank ?? "") <= 3)
    .map(o => o.name ?? "").filter(Boolean);
  const hcFromMgmt = mgmtOfficers
    .filter(o => rankOrder(o.rank ?? "") <= 3)
    .map(o => o.name ?? "").filter(Boolean);
  const hcVoters = [...new Set([...hcFromFtp, ...hcFromMgmt])];

  for (const row of qualRows) {
    const curFtb = (row.ftbVotes ?? {}) as Record<string, string>;
    const curHc = (row.hcVotes ?? {}) as Record<string, string>;

    const newFtb: Record<string, string> = {};
    for (const v of ftbVoters) newFtb[v] = curFtb[v] ?? "";

    const newHc: Record<string, string> = {};
    for (const v of hcVoters) newHc[v] = curHc[v] ?? "";

    const ftbChanged = JSON.stringify(newFtb) !== JSON.stringify(curFtb);
    const hcChanged = JSON.stringify(newHc) !== JSON.stringify(curHc);

    if (ftbChanged || hcChanged) {
      await db.update(qualificationChartTable)
        .set({
          ...(ftbChanged ? { ftbVotes: newFtb } : {}),
          ...(hcChanged ? { hcVotes: newHc } : {}),
          updatedAt: new Date(),
        })
        .where(eq(qualificationChartTable.id, row.id));
    }
  }
}

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Auto-insert any roster officers that are not yet in the qual chart.
 *  PTA officers are only included if they are confirmed Solo Cadets. */
async function syncRosterToQualChart(): Promise<void> {
  // Get all names already in qual chart (with their lastPromotion)
  const existing = await db
    .select({ name: qualificationChartTable.name, lastPromotion: qualificationChartTable.lastPromotion })
    .from(qualificationChartTable);
  const existingNames = existing.map((r) => r.name);

  // Solo Cadets from student_progressions (by badgeNumber which matches callSign)
  const soloCadets = await db
    .select({ badgeNumber: studentProgressionsTable.badgeNumber })
    .from(studentProgressionsTable)
    .where(eq(studentProgressionsTable.currentPhase, "Solo Cadet"));
  const soloBadges = new Set(soloCadets.map((s) => s.badgeNumber).filter(Boolean));

  // All roster officers (with lastPromotion from officers table)
  const allOfficers = await db
    .select({ name: officersTable.name, rank: officersTable.rank, department: officersTable.department, lastPromotion: officersTable.lastPromotion, callSign: officersTable.callSign })
    .from(officersTable);

  // Eligible: non-PTA officers, or PTA officers who are Solo Cadets
  const eligibleOfficers = allOfficers.filter((o) => {
    if (o.department !== "PTA") return true;
    return soloBadges.has(o.callSign ?? "");
  });

  // Insert any officers not yet in qual chart
  const missing = eligibleOfficers.filter((o) => !existingNames.includes(o.name ?? ""));
  if (missing.length > 0) {
    await db.insert(qualificationChartTable).values(
      missing.map((o) => ({
        name: o.name ?? "",
        rank: o.rank ?? null,
        department: o.department ?? null,
        daysInRank: 0,
        hoursInRank: 0,
        citationCount: 0,
        firCount: 0,
        lastPromotion: o.lastPromotion ?? null,
        strikesMajor: "0/4",
        strikesMinor: "0/2",
        qualStatus: null,
      }))
    );
  }

  // Backfill: if qual chart has null lastPromotion but officers table has one, sync it
  const needsBackfill = existing.filter((e) => !e.lastPromotion);
  for (const entry of needsBackfill) {
    const officer = allOfficers.find((o) => o.name === entry.name);
    if (officer?.lastPromotion) {
      await db
        .update(qualificationChartTable)
        .set({ lastPromotion: officer.lastPromotion })
        .where(eq(qualificationChartTable.name, entry.name ?? ""));
    }
  }
}

router.get("/qualification-chart", async (_req, res): Promise<void> => {
  // Ensure all roster officers have a qual chart entry, and voter columns are in sync
  await Promise.all([syncRosterToQualChart(), syncVotersToQualChart()]);

  // Only show officers who are in the roster (officers table is primary).
  // PTA officers are only shown if they are confirmed Solo Cadets in student_progressions.
  const rows = await db
    .select({
      id: qualificationChartTable.id,
      name: officersTable.name,
      discordUid: qualificationChartTable.discordUid,
      // Always live from roster
      rank: officersTable.rank,
      department: officersTable.department,
      daysInRank: qualificationChartTable.daysInRank,
      hoursInRank: qualificationChartTable.hoursInRank,
      citationCount: sql<number>`COALESCE(${qualificationChartTable.citationCount}, 0)`,
      firCount: sql<number>`COALESCE(${qualificationChartTable.firCount}, 0)`,
      // Always live from roster — if roster has a date, prefer it over qual chart's stored copy
      lastPromotion: sql<string | null>`COALESCE(NULLIF(${officersTable.lastPromotion}, ''), NULLIF(${qualificationChartTable.lastPromotion}, ''))`,
      joiningDate: officersTable.dateOfJoining,
      strikesMajor: qualificationChartTable.strikesMajor,
      strikesMinor: qualificationChartTable.strikesMinor,
      qualStatus: qualificationChartTable.qualStatus,
      notes: qualificationChartTable.notes,
      ftbVotes: qualificationChartTable.ftbVotes,
      hcVotes: qualificationChartTable.hcVotes,
      updatedAt: qualificationChartTable.updatedAt,
      rosterLinked: sql<boolean>`true`,
    })
    .from(officersTable)
    .leftJoin(qualificationChartTable, eq(officersTable.name, qualificationChartTable.name))
    .where(
      or(
        sql`${officersTable.department} != 'PTA'`,
        sql`EXISTS (
          SELECT 1 FROM student_progressions sp
          WHERE sp.badge_number = ${officersTable.callSign}
            AND sp.current_phase = 'Solo Cadet'
        )`,
      )!,
    )
    .orderBy(qualificationChartTable.id);

  // Dynamically compute hoursInRank from duty logs since lastPromotion (or joiningDate)
  const hoursMap: Record<string, number> = {};

  // Duty log hours since lastPromotion / joiningDate
  // Prefer roster's last_promotion (source of truth), fall back to qual chart's, then joining date
  const dutyResult = await db.execute(sql`
    WITH officer_dates AS (
      SELECT
        o.name,
        COALESCE(NULLIF(o.last_promotion, ''), NULLIF(q.last_promotion, ''), o.date_of_joining) AS since_date
      FROM officers o
      LEFT JOIN qualification_chart q ON o.name = q.name
    )
    SELECT
      d.officer_name,
      COALESCE(SUM(EXTRACT(EPOCH FROM d.duration::interval)), 0) AS total_seconds
    FROM pd_duty_logs d
    JOIN officer_dates od ON d.officer_name = od.name
    WHERE od.since_date IS NULL
       OR d.log_date >= MAKE_DATE(
            SPLIT_PART(od.since_date, '/', 3)::int,
            SPLIT_PART(od.since_date, '/', 1)::int,
            SPLIT_PART(od.since_date, '/', 2)::int
          )
    GROUP BY d.officer_name
  `);
  for (const r of dutyResult.rows as any[]) {
    hoursMap[r.officer_name] = Number(r.total_seconds) / 3600;
  }

  // Duty adjustments (seconds) since lastPromotion / joiningDate
  const adjResult = await db.execute(sql`
    WITH officer_dates AS (
      SELECT
        o.name,
        COALESCE(NULLIF(o.last_promotion, ''), NULLIF(q.last_promotion, ''), o.date_of_joining) AS since_date
      FROM officers o
      LEFT JOIN qualification_chart q ON o.name = q.name
    )
    SELECT
      a.officer_name,
      COALESCE(SUM(a.adjustment_seconds), 0) AS total_adj_seconds
    FROM duty_adjustments a
    JOIN officer_dates od ON a.officer_name = od.name
    WHERE od.since_date IS NULL
       OR (
         a.duty_year ~ '^[0-9]+$'
         AND MAKE_DATE(
               a.duty_year::int,
               CASE UPPER(a.duty_month)
                 WHEN 'JANUARY' THEN 1 WHEN 'FEBRUARY' THEN 2 WHEN 'MARCH' THEN 3
                 WHEN 'APRIL' THEN 4 WHEN 'MAY' THEN 5 WHEN 'JUNE' THEN 6
                 WHEN 'JULY' THEN 7 WHEN 'AUGUST' THEN 8 WHEN 'SEPTEMBER' THEN 9
                 WHEN 'OCTOBER' THEN 10 WHEN 'NOVEMBER' THEN 11 WHEN 'DECEMBER' THEN 12
                 ELSE 1
               END, 1
             ) >= MAKE_DATE(
               SPLIT_PART(od.since_date, '/', 3)::int,
               SPLIT_PART(od.since_date, '/', 1)::int,
               SPLIT_PART(od.since_date, '/', 2)::int
             )
       )
    GROUP BY a.officer_name
  `);
  for (const r of adjResult.rows as any[]) {
    hoursMap[r.officer_name] = (hoursMap[r.officer_name] ?? 0) + Number(r.total_adj_seconds) / 3600;
  }

  // Dynamically compute citations since lastPromotion (or joiningDate if no promo date)
  const citationResult = await db.execute(sql`
    WITH officer_dates AS (
      SELECT
        o.name,
        o.citizen_id,
        COALESCE(
          NULLIF(o.last_promotion, ''),
          NULLIF(q.last_promotion, ''),
          NULLIF(o.date_of_joining, '')
        ) AS since_date
      FROM officers o
      LEFT JOIN qualification_chart q ON o.name = q.name
    )
    SELECT
      od.name AS officer_name,
      COUNT(c.id)::int AS citation_count
    FROM officer_dates od
    LEFT JOIN pd_citations c
      ON (
        (
          od.citizen_id IS NOT NULL
          AND c.officer_name ~ '\\[\\d+\\]'
          AND REGEXP_REPLACE(c.officer_name, '^.*\\[(\\d+)\\].*$', '\\1') = od.citizen_id
        )
        OR (
          NOT (od.citizen_id IS NOT NULL AND c.officer_name ~ '\\[\\d+\\]')
          AND TRIM(REGEXP_REPLACE(c.officer_name, '\\s*\\[\\d+\\]\\s*$', '')) = od.name
        )
      )
      AND (
        od.since_date IS NULL
        OR c.posted_at >= MAKE_DATE(
          SPLIT_PART(od.since_date, '/', 3)::int,
          SPLIT_PART(od.since_date, '/', 1)::int,
          SPLIT_PART(od.since_date, '/', 2)::int
        )
      )
    GROUP BY od.name
  `);
  const citationMap = new Map<string, number>();
  for (const r of citationResult.rows as any[]) {
    citationMap.set(r.officer_name, Number(r.citation_count));
  }

  // Count FIRs filed AGAINST each officer (officer_name field) SINCE their promotion date
  const acceptedFirResult = await db.execute(sql`
    WITH officer_dates AS (
      SELECT
        o.name,
        COALESCE(NULLIF(o.last_promotion, ''), NULLIF(q.last_promotion, ''), NULLIF(o.date_of_joining, '')) AS since_date
      FROM officers o
      LEFT JOIN qualification_chart q ON o.name = q.name
    )
    SELECT
      f.officer_name,
      COUNT(*)::int AS accepted_count
    FROM pd_fir f
    JOIN officer_dates od ON f.officer_name = od.name
    WHERE f.status = 'accepted'
      AND f.officer_name IS NOT NULL
      AND f.officer_name <> ''
      AND (
        od.since_date IS NULL
        OR f.accepted_at >= MAKE_DATE(
          SPLIT_PART(od.since_date, '/', 3)::int,
          SPLIT_PART(od.since_date, '/', 1)::int,
          SPLIT_PART(od.since_date, '/', 2)::int
        )
      )
    GROUP BY f.officer_name
  `);
  const acceptedFirMap = new Map<string, number>();
  for (const r of acceptedFirResult.rows as any[]) {
    acceptedFirMap.set(r.officer_name, Number(r.accepted_count));
  }

  // Merge computed hoursInRank and citationCount into rows
  const enrichedRows = rows.map((r) => {
    const autoCount = citationMap.get(r.name ?? "") ?? 0;
    const adjustment = r.citationCount ?? 0;
    return {
      ...r,
      citationAutoCount: autoCount,
      citationCount: autoCount + adjustment,
      acceptedFirCount: acceptedFirMap.get(r.name ?? "") ?? 0,
    };
  });

  res.json(enrichedRows);
});

router.post("/qualification-chart", async (req, res): Promise<void> => {
  const { name, discordUid, rank, department, daysInRank, hoursInRank,
    citationCount, firCount, lastPromotion, strikesMajor, strikesMinor,
    qualStatus, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(qualificationChartTable).values({
    name, discordUid, rank, department, daysInRank, hoursInRank,
    citationCount: citationCount ?? 0, firCount: firCount ?? 0,
    lastPromotion, strikesMajor: strikesMajor ?? "0/4",
    strikesMinor: strikesMinor ?? "0/2", qualStatus, notes,
  }).returning();
  await auditLog(req, "CREATE", "qual-entry", row.id, name, { rank, department, qualStatus });
  res.status(201).json(row);
});

router.put("/qualification-chart/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, discordUid, rank, department, hoursInRank,
    citationCount, firCount, lastPromotion, strikesMajor, strikesMinor,
    qualStatus, notes } = req.body;
  const [before] = await db.select().from(qualificationChartTable).where(eq(qualificationChartTable.id, id)).limit(1);
  const [row] = await db.update(qualificationChartTable)
    .set({ name, discordUid, rank, department, hoursInRank,
      citationCount, firCount, lastPromotion, strikesMajor, strikesMinor,
      qualStatus, notes, updatedAt: new Date() })
    .where(eq(qualificationChartTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const diff: Record<string, unknown> = {};
  for (const k of ["name","rank","department","qualStatus","strikesMajor","strikesMinor","hoursInRank","citationCount","firCount","lastPromotion","notes"] as const) {
    if ((before as any)?.[k] !== (row as any)[k]) diff[k] = { old: (before as any)?.[k], new: (row as any)[k] };
  }
  await auditLog(req, "UPDATE", "qual-entry", id, name ?? before?.name ?? null, Object.keys(diff).length ? diff : null);

  // Sync lastPromotion, strikesMajor, strikesMinor back to officers (roster) by name
  const officerName = row.name;
  if (officerName) {
    const syncFields: Partial<{ lastPromotion: string | null; strikesMajor: string | null; strikesMinor: string | null }> = {};
    if (lastPromotion !== undefined) syncFields.lastPromotion = lastPromotion ?? null;
    if (strikesMajor !== undefined) syncFields.strikesMajor = strikesMajor ?? null;
    if (strikesMinor !== undefined) syncFields.strikesMinor = strikesMinor ?? null;
    if (Object.keys(syncFields).length > 0) {
      await db.update(officersTable)
        .set(syncFields)
        .where(eq(officersTable.name, officerName));
    }
  }

  res.json(row);
});

router.delete("/qualification-chart/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [entry] = await db.select({ name: qualificationChartTable.name }).from(qualificationChartTable).where(eq(qualificationChartTable.id, id)).limit(1);
  await db.delete(qualificationChartTable).where(eq(qualificationChartTable.id, id));
  await auditLog(req, "DELETE", "qual-entry", id, entry?.name ?? null, null);
  res.status(204).end();
});

// GET /api/ftp-members — returns FTO and HC members (officers with ftp=true flag)
router.get("/ftp-members", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ name: officersTable.name, rank: officersTable.rank, callSign: officersTable.callSign })
    .from(officersTable)
    .where(eq(officersTable.ftp, true));

  // Return all FTP officers with their rank so frontend can categorize FTO vs HC
  res.json({
    members: rows.map((r) => ({ name: r.name ?? r.callSign ?? "", rank: r.rank ?? "" })),
  });
});

// PATCH /api/qualification-chart/:id/votes — update a single vote
router.patch("/qualification-chart/:id/votes", async (req, res): Promise<void> => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = Number(req.params.id);
  const { voteType, voterName, value } = req.body;
  // voteType: "ftb" | "hc", voterName: string, value: "✓" | "✗" | "N/A" | ""
  if (!voteType || !voterName) { res.status(400).json({ error: "voteType and voterName required" }); return; }

  // Owners can vote on behalf of anyone; others can only submit their own vote
  if (!sessionUser.isOwner) {
    const officers = await db
      .select({ name: officersTable.name })
      .from(officersTable)
      .where(or(
        eq(officersTable.discordUid, sessionUser.id ?? ""),
        eq(officersTable.discordUsername, sessionUser.username ?? ""),
      ))
      .limit(1);
    const officerName = officers[0]?.name ?? null;
    if (!officerName || officerName !== voterName) {
      res.status(403).json({ error: "You can only submit your own vote" });
      return;
    }
  }

  const [current] = await db.select({
    name: qualificationChartTable.name,
    ftbVotes: qualificationChartTable.ftbVotes,
    hcVotes: qualificationChartTable.hcVotes,
  }).from(qualificationChartTable).where(eq(qualificationChartTable.id, id)).limit(1);

  if (!current) { res.status(404).json({ error: "Not found" }); return; }

  if (voteType === "ftb") {
    const oldVal = (current.ftbVotes ?? {})[voterName] ?? "";
    const updated = { ...(current.ftbVotes ?? {}), [voterName]: value ?? "" };
    const [row] = await db.update(qualificationChartTable)
      .set({ ftbVotes: updated, updatedAt: new Date() })
      .where(eq(qualificationChartTable.id, id))
      .returning();
    await auditLog(req, "VOTE", "qual-entry", id, current.name ?? null, { voter: voterName, column: "FTB", old: oldVal, new: value ?? "" });
    res.json(row);
  } else {
    const oldVal = (current.hcVotes ?? {})[voterName] ?? "";
    const updated = { ...(current.hcVotes ?? {}), [voterName]: value ?? "" };
    const [row] = await db.update(qualificationChartTable)
      .set({ hcVotes: updated, updatedAt: new Date() })
      .where(eq(qualificationChartTable.id, id))
      .returning();
    await auditLog(req, "VOTE", "qual-entry", id, current.name ?? null, { voter: voterName, column: "HC", old: oldVal, new: value ?? "" });
    res.json(row);
  }
});

export default router;
