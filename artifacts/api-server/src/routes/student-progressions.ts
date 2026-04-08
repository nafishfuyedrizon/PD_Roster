import { Router } from "express";
import { db, studentProgressionsTable, pdDutyLogsTable, officersTable, CHECKPOINT_FIELDS } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { guard } from "../lib/auth-guard.js";

const router = Router();

const OBS_FIELDS = ["obsH2", "obsH4", "obsH6", "obsH8", "obsH10", "obsH12", "obsH14"] as const;

function calcProgress(row: Record<string, unknown>, autoObsCount: number): number {
  let checked = 0;
  for (const f of CHECKPOINT_FIELDS) {
    if (OBS_FIELDS.includes(f as typeof OBS_FIELDS[number])) {
      // Obs hours: always use bot autoObsCount (never manual DB flags)
      const obsIdx = OBS_FIELDS.indexOf(f as typeof OBS_FIELDS[number]);
      if (obsIdx < autoObsCount) checked++;
    } else {
      if (row[f] === true) checked++;
    }
  }
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

// GET /public/student-progressions — public read-only (no auth required)
router.get("/public/student-progressions", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const rows = await db.select().from(studentProgressionsTable).orderBy(studentProgressionsTable.id);
  const names = rows.map((r) => r.name).filter(Boolean);
  const obsCountMap = await getObsSessionCounts(names);
  const enriched = rows.map((r) => {
    const autoObsCount = Math.min(7, obsCountMap.get(r.name) ?? 0);
    return { ...r, progressPct: calcProgress(r as Record<string, unknown>, autoObsCount), autoObsCount };
  });
  res.json(enriched);
});

// GET /student-progressions — list all
router.get("/student-progressions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(studentProgressionsTable).orderBy(studentProgressionsTable.id);
  const names = rows.map((r) => r.name).filter(Boolean);
  const obsCountMap = await getObsSessionCounts(names);
  const enriched = rows.map((r) => {
    const autoObsCount = Math.min(7, obsCountMap.get(r.name) ?? 0);
    return {
      ...r,
      progressPct: calcProgress(r as Record<string, unknown>, autoObsCount),
      autoObsCount,
    };
  });
  res.json(enriched);
});

// POST /student-progressions — create
router.post("/student-progressions", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const { name, badgeNumber, discordId, discordName, timezone, currentPhase, status, strikes, hireDate, loaEndDate, soloStartDate, eligibleTrooperDate } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(studentProgressionsTable).values({
    name, badgeNumber, discordId, discordName, timezone,
    currentPhase: currentPhase ?? "Phase 1", status: status ?? "Active",
    strikes: strikes ?? "0/4", hireDate, loaEndDate, soloStartDate, eligibleTrooperDate,
  }).returning();
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>, 0), autoObsCount: 0 });
});

// PUT /student-progressions/:id — full update
router.put("/student-progressions/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);
  const body = req.body;
  const [row] = await db.update(studentProgressionsTable).set({ ...body, updatedAt: new Date() }).where(eq(studentProgressionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  const obsMap = await getObsSessionCounts([row.name]);
  const autoObsCount = Math.min(7, obsMap.get(row.name) ?? 0);
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>, autoObsCount), autoObsCount });
});

// PATCH /student-progressions/:id/checkbox — toggle a single boolean checkpoint
router.patch("/student-progressions/:id/checkbox", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
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
  // Compute real obs session count so progressPct reflects actual obs hours
  const obsMap = await getObsSessionCounts([row.name]);
  const autoObsCount = Math.min(7, obsMap.get(row.name) ?? 0);
  res.json({ ...row, progressPct: calcProgress(row as Record<string, unknown>, autoObsCount), autoObsCount });
});

// DELETE /student-progressions/:id
router.delete("/student-progressions/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);
  await db.delete(studentProgressionsTable).where(eq(studentProgressionsTable.id, id));
  res.json({ ok: true });
});

// ── Roster sync helper ────────────────────────────────────────────────────────
export async function syncStudentProgressionsWithRoster(): Promise<{ added: string[]; terminated: string[] }> {
  // Get all PTA officers
  const ptaOfficers = await db
    .select({ callSign: officersTable.callSign, name: officersTable.name, dateOfJoining: officersTable.dateOfJoining, timezone: officersTable.timezone, discordUid: officersTable.discordUid, discordUsername: officersTable.discordUsername })
    .from(officersTable)
    .where(eq(officersTable.department, "PTA"));

  // Get all student progressions
  const cadets = await db.select({ id: studentProgressionsTable.id, badgeNumber: studentProgressionsTable.badgeNumber, name: studentProgressionsTable.name, status: studentProgressionsTable.status }).from(studentProgressionsTable);

  const ptaBadgeSet = new Set(ptaOfficers.map((o) => o.callSign));
  const cadetBadgeSet = new Set(cadets.map((c) => c.badgeNumber).filter(Boolean));

  const added: string[] = [];
  const terminated: string[] = [];

  // Add new PTA officers not yet in student_progressions
  for (const officer of ptaOfficers) {
    if (!cadetBadgeSet.has(officer.callSign)) {
      await db.insert(studentProgressionsTable).values({
        name: officer.name ?? officer.callSign,
        badgeNumber: officer.callSign,
        discordId: officer.discordUid ?? undefined,
        discordName: officer.discordUsername ?? undefined,
        timezone: officer.timezone ?? undefined,
        status: "Active",
        strikes: "0/4",
        hireDate: officer.dateOfJoining ?? undefined,
      });
      added.push(`${officer.callSign} ${officer.name ?? ""}`);
    }
  }

  // Terminate cadets no longer in PTA
  for (const cadet of cadets) {
    if (cadet.badgeNumber && !ptaBadgeSet.has(cadet.badgeNumber) && cadet.status !== "Terminated") {
      await db.update(studentProgressionsTable)
        .set({ status: "Terminated", updatedAt: new Date() })
        .where(eq(studentProgressionsTable.id, cadet.id));
      terminated.push(`${cadet.badgeNumber} ${cadet.name}`);
    }
  }

  return { added, terminated };
}

// POST /student-progressions/sync-roster — manual sync with PTA officers
router.post("/student-progressions/sync-roster", async (_req, res): Promise<void> => {
  const result = await syncStudentProgressionsWithRoster();
  res.json({ ok: true, ...result });
});

export default router;
