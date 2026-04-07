import { Router } from "express";
import { db, studentProgressionsTable, CHECKPOINT_FIELDS } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function calcProgress(row: Record<string, unknown>): number {
  const checked = CHECKPOINT_FIELDS.filter((f) => row[f] === true).length;
  return Math.round((checked / CHECKPOINT_FIELDS.length) * 10000) / 100;
}

// GET /student-progressions — list all
router.get("/student-progressions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(studentProgressionsTable).orderBy(studentProgressionsTable.id);
  const enriched = rows.map((r) => ({ ...r, progressPct: calcProgress(r as Record<string, unknown>) }));
  res.json(enriched);
});

// POST /student-progressions — create
router.post("/student-progressions", async (req, res): Promise<void> => {
  const { name, badgeNumber, discordId, discordName, timezone, currentPhase, status, strikes, hireDate, loaEndDate, soloStartDate, eligibleTrooperDate } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(studentProgressionsTable).values({
    name, badgeNumber, discordId, discordName, timezone,
    currentPhase: currentPhase ?? "Phase 1", status: status ?? "Active",
    strikes: strikes ?? "0/4", hireDate, loaEndDate, soloStartDate, eligibleTrooperDate,
  }).returning();
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>) });
});

// PUT /student-progressions/:id — full update
router.put("/student-progressions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body;
  const [row] = await db.update(studentProgressionsTable).set({ ...body, updatedAt: new Date() }).where(eq(studentProgressionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>) });
});

// PATCH /student-progressions/:id/checkbox — toggle a single boolean checkpoint
router.patch("/student-progressions/:id/checkbox", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { field, value } = req.body as { field: string; value: boolean };
  if (!CHECKPOINT_FIELDS.includes(field as typeof CHECKPOINT_FIELDS[number])) {
    res.status(400).json({ error: "invalid field" }); return;
  }
  const [row] = await db.update(studentProgressionsTable)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(studentProgressionsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>) });
});

// DELETE /student-progressions/:id
router.delete("/student-progressions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(studentProgressionsTable).where(eq(studentProgressionsTable.id, id));
  res.json({ ok: true });
});

export default router;
