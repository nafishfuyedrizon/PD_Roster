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
  // Get all names already in qual chart
  const existing = await db
    .select({ name: qualificationChartTable.name })
    .from(qualificationChartTable);
  const existingNames = existing.map((r) => r.name);

  // Find roster officers whose names are not in qual chart
  let missing;
  if (existingNames.length > 0) {
    missing = await db
      .select({ name: officersTable.name, rank: officersTable.rank, department: officersTable.department })
      .from(officersTable)
      .where(notInArray(officersTable.name, existingNames));
  } else {
    missing = await db
      .select({ name: officersTable.name, rank: officersTable.rank, department: officersTable.department })
      .from(officersTable);
  }

  if (missing.length === 0) return;

  await db.insert(qualificationChartTable).values(
    missing.map((o) => ({
      name: o.name ?? "",
      rank: o.rank ?? null,
      department: o.department ?? null,
      daysInRank: 0,
      hoursInRank: 0,
      citationCount: 0,
      firCount: 0,
      lastPromotion: todayMDY(),
      strikesMajor: "0/4",
      strikesMinor: "0/2",
      qualStatus: null,
    }))
  );
}

router.get("/qualification-chart", async (_req, res): Promise<void> => {
  // Always ensure all roster officers appear in the qual chart
  await syncRosterToQualChart();

  const rows = await db
    .select({
      id: qualificationChartTable.id,
      name: qualificationChartTable.name,
      discordUid: qualificationChartTable.discordUid,
      // Live from roster; fall back to qual chart's own stored value
      rank: sql<string | null>`COALESCE(${officersTable.rank}, ${qualificationChartTable.rank})`,
      department: sql<string | null>`COALESCE(${officersTable.department}, ${qualificationChartTable.department})`,
      daysInRank: qualificationChartTable.daysInRank,
      hoursInRank: qualificationChartTable.hoursInRank,
      citationCount: qualificationChartTable.citationCount,
      firCount: qualificationChartTable.firCount,
      lastPromotion: qualificationChartTable.lastPromotion,
      strikesMajor: qualificationChartTable.strikesMajor,
      strikesMinor: qualificationChartTable.strikesMinor,
      qualStatus: qualificationChartTable.qualStatus,
      notes: qualificationChartTable.notes,
      updatedAt: qualificationChartTable.updatedAt,
      // Flag: true when officer exists in the roster
      rosterLinked: sql<boolean>`(${officersTable.id} IS NOT NULL)`,
    })
    .from(qualificationChartTable)
    .leftJoin(officersTable, eq(qualificationChartTable.name, officersTable.name))
    .orderBy(qualificationChartTable.id);
  res.json(rows);
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
