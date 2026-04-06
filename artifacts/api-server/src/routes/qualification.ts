import { Router, type IRouter } from "express";
import { db, qualificationChartTable, officersTable } from "@workspace/db";
import { eq, sql, notInArray } from "drizzle-orm";

const router: IRouter = Router();

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Auto-insert any roster officers that are not yet in the qual chart. */
async function syncRosterToQualChart(): Promise<void> {
  // Get all names already in qual chart (with their lastPromotion)
  const existing = await db
    .select({ name: qualificationChartTable.name, lastPromotion: qualificationChartTable.lastPromotion })
    .from(qualificationChartTable);
  const existingNames = existing.map((r) => r.name);

  // All roster officers (with lastPromotion from officers table)
  const allOfficers = await db
    .select({ name: officersTable.name, rank: officersTable.rank, department: officersTable.department, lastPromotion: officersTable.lastPromotion })
    .from(officersTable);

  // Insert any officers not yet in qual chart
  const missing = allOfficers.filter((o) => !existingNames.includes(o.name ?? ""));
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
  // Ensure all roster officers have a qual chart entry
  await syncRosterToQualChart();

  // Only show officers who are in the roster (officers table is primary)
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
      lastPromotion: qualificationChartTable.lastPromotion,
      joiningDate: officersTable.dateOfJoining,
      strikesMajor: qualificationChartTable.strikesMajor,
      strikesMinor: qualificationChartTable.strikesMinor,
      qualStatus: qualificationChartTable.qualStatus,
      notes: qualificationChartTable.notes,
      updatedAt: qualificationChartTable.updatedAt,
      rosterLinked: sql<boolean>`true`,
    })
    .from(officersTable)
    .leftJoin(qualificationChartTable, eq(officersTable.name, qualificationChartTable.name))
    .orderBy(qualificationChartTable.id);

  // Dynamically compute hoursInRank from duty logs since lastPromotion (or joiningDate)
  const hoursMap: Record<string, number> = {};

  // Duty log hours since lastPromotion / joiningDate
  const dutyResult = await db.execute(sql`
    WITH officer_dates AS (
      SELECT
        o.name,
        COALESCE(NULLIF(q.last_promotion, ''), o.date_of_joining) AS since_date
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
        COALESCE(NULLIF(q.last_promotion, ''), o.date_of_joining) AS since_date
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

  // Merge computed hoursInRank into rows
  const enrichedRows = rows.map((r) => ({
    ...r,
    hoursInRank: hoursMap[r.name ?? ""] != null
      ? Number(hoursMap[r.name ?? ""].toFixed(2))
      : r.hoursInRank,
  }));

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
  res.status(201).json(row);
});

router.put("/qualification-chart/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, discordUid, rank, department, hoursInRank,
    citationCount, firCount, lastPromotion, strikesMajor, strikesMinor,
    qualStatus, notes } = req.body;
  const [row] = await db.update(qualificationChartTable)
    .set({ name, discordUid, rank, department, hoursInRank,
      citationCount, firCount, lastPromotion, strikesMajor, strikesMinor,
      qualStatus, notes, updatedAt: new Date() })
    .where(eq(qualificationChartTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/qualification-chart/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(qualificationChartTable).where(eq(qualificationChartTable.id, id));
  res.status(204).end();
});

export default router;
