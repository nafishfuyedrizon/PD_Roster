import { Router } from "express";
import { db, studentProgressionsTable, pdDutyLogsTable, CHECKPOINT_FIELDS } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

function calcProgress(row: Record<string, unknown>): number {
  const checked = CHECKPOINT_FIELDS.filter((f) => row[f] === true).length;
  return Math.round((checked / CHECKPOINT_FIELDS.length) * 10000) / 100;
}

async function getObsSessionCounts(names: string[]): Promise<Map<string, number>> {
  if (names.length === 0) return new Map();
  const rawRows = await db.execute(sql`
    SELECT officer_name, COUNT(*)::int AS session_count
    FROM pd_duty_logs
    WHERE officer_name = ANY(ARRAY[${sql.join(names.map((n) => sql`${n}`), sql`, `)}])
      AND (
        CAST(SPLIT_PART(duration, ':', 1) AS INT) * 3600 +
        CAST(SPLIT_PART(duration, ':', 2) AS INT) * 60 +
        CAST(SPLIT_PART(duration, ':', 3) AS INT)
      ) >= 7200
    GROUP BY officer_name
  `);
  const map = new Map<string, number>();
  for (const row of rawRows.rows as { officer_name: string; session_count: number }[]) {
    map.set(row.officer_name, row.session_count);
  }
  return map;
}

// GET /student-progressions — list all
router.get("/student-progressions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(studentProgressionsTable).orderBy(studentProgressionsTable.id);
  const names = rows.map((r) => r.name).filter(Boolean);
  const obsCountMap = await getObsSessionCounts(names);
  const enriched = rows.map((r) => ({
    ...r,
    progressPct: calcProgress(r as Record<string, unknown>),
    autoObsCount: Math.min(7, obsCountMap.get(r.name) ?? 0),
  }));
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
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>), autoObsCount: 0 });
});

// PUT /student-progressions/:id — full update
router.put("/student-progressions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body;
  const [row] = await db.update(studentProgressionsTable).set({ ...body, updatedAt: new Date() }).where(eq(studentProgressionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>), autoObsCount: 0 });
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
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>), autoObsCount: 0 });
});

// DELETE /student-progressions/:id
router.delete("/student-progressions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(studentProgressionsTable).where(eq(studentProgressionsTable.id, id));
  res.json({ ok: true });
});

export default router;
