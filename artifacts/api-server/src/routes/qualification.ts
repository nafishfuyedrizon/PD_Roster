import { Router, type IRouter } from "express";
import { db, qualificationChartTable, officersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/qualification-chart", async (_req, res): Promise<void> => {
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
