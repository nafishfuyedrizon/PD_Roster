import { Router } from "express";
import { db, studentProgressionsTable, officersTable, CHECKPOINT_FIELDS } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { guard } from "../lib/auth-guard.js";
import {
  getMysqlOfficers,
  getMysqlStudentProgressions,
  isMysqlDatabaseUrl,
  mysqlExecute,
  mysqlQuery,
} from "../lib/pd-mysql-read.js";

const router = Router();

const OBS_FIELDS = ["obsH2", "obsH4", "obsH6", "obsH8", "obsH10", "obsH12", "obsH14"] as const;
const MYSQL_STUDENT_FIELD_MAP: Record<string, string> = {
  badgeNumber: "badge_number",
  discordId: "discord_id",
  discordName: "discord_name",
  name: "name",
  timezone: "timezone",
  currentPhase: "current_phase",
  status: "status",
  strikes: "strikes",
  hireDate: "hire_date",
  loaEndDate: "loa_end_date",
  discordInterview: "discord_interview",
  inCityInterview: "in_city_interview",
  basicTraining: "basic_training",
  obsH2: "obs_h2",
  obsH4: "obs_h4",
  obsH6: "obs_h6",
  obsH8: "obs_h8",
  obsH10: "obs_h10",
  obsH12: "obs_h12",
  obsH14: "obs_h14",
  mdt: "mdt",
  advanceTraining: "advance_training",
  negPri: "neg_pri",
  negSec: "neg_sec",
  negTer: "neg_ter",
  negPar: "neg_par",
  incPri: "inc_pri",
  incSec: "inc_sec",
  incTer: "inc_ter",
  incPar: "inc_par",
  eviPri: "evi_pri",
  eviSec: "evi_sec",
  eviTer: "evi_ter",
  eviPar: "evi_par",
  susPri: "sus_pri",
  susSec: "sus_sec",
  susTer: "sus_ter",
  susPar: "sus_par",
  drvPri: "drv_pri",
  drvSec: "drv_sec",
  drvTer: "drv_ter",
  drvPar: "drv_par",
  t11Pri: "t11_pri",
  t11Sec: "t11_sec",
  t11Ter: "t11_ter",
  t11Par: "t11_par",
  pit: "pit",
  pitSec: "pit_sec",
  pitTer: "pit_ter",
  calls911: "calls_911",
  drvSolo: "drv_solo",
  t11Solo: "t11_solo",
  pitPar: "pit_par",
  soloReady: "solo_ready",
  soloStartDate: "solo_start_date",
  eligibleTrooperDate: "eligible_trooper_date",
  clearedTrooper: "cleared_trooper",
};

function normalizeMysqlValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

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

async function getMysqlObsSessionCounts(names: string[]): Promise<Map<string, number>> {
  if (names.length === 0) return new Map();
  const placeholders = names.map(() => "?").join(", ");
  const rows = await mysqlQuery<{ officer_name: string; session_count: number | string }>(
    `SELECT officer_name, COUNT(*) AS session_count
     FROM pd_duty_logs
     WHERE officer_name IN (${placeholders})
       AND TIME_TO_SEC(duration) >= 7200
     GROUP BY officer_name`,
    names,
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.officer_name, Number(row.session_count ?? 0));
  }
  return map;
}

async function enrichMysqlStudentProgressions() {
  const rows = await getMysqlStudentProgressions();
  const names = rows.map((row) => row.name).filter(Boolean);
  const obsCountMap = await getMysqlObsSessionCounts(names);
  return rows.map((row) => {
    const autoObsCount = Math.min(7, obsCountMap.get(row.name) ?? 0);
    return {
      ...row,
      progressPct: calcProgress(row as Record<string, unknown>, autoObsCount),
      autoObsCount,
    };
  });
}

async function getMysqlStudentProgressionById(id: number) {
  const rows = await enrichMysqlStudentProgressions();
  return rows.find((row) => row.id === id) ?? null;
}

// GET /public/student-progressions — public read-only (no auth required)
router.get("/public/student-progressions", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (isMysqlDatabaseUrl) {
    res.json(await enrichMysqlStudentProgressions());
    return;
  }
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
  if (isMysqlDatabaseUrl) {
    res.json(await enrichMysqlStudentProgressions());
    return;
  }
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
  if (isMysqlDatabaseUrl) {
    const result = await mysqlExecute(
      `INSERT INTO pd_student_progressions (
        name, badge_number, discord_id, discord_name, timezone,
        current_phase, status, strikes, hire_date, loa_end_date, solo_start_date, eligible_trooper_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name,
        badgeNumber ?? null,
        discordId ?? null,
        discordName ?? null,
        timezone ?? null,
        currentPhase ?? "Phase 1",
        status ?? "Active",
        strikes ?? "0/4",
        hireDate ?? null,
        loaEndDate ?? null,
        soloStartDate ?? null,
        eligibleTrooperDate ?? null,
      ],
    );
    const row = await getMysqlStudentProgressionById(Number(result.insertId));
    res.json(row);
    return;
  }
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
  if (isMysqlDatabaseUrl) {
    const updates = Object.entries(body)
      .filter(([key]) => key in MYSQL_STUDENT_FIELD_MAP)
      .map(([key, value]) => ({
        column: MYSQL_STUDENT_FIELD_MAP[key]!,
        value: normalizeMysqlValue(value),
      }));
    if (updates.length === 0) {
      res.status(400).json({ error: "nothing to update" });
      return;
    }
    const setClause = `${updates.map((entry) => `${entry.column} = ?`).join(", ")}, updated_at = NOW()`;
    await mysqlExecute(
      `UPDATE pd_student_progressions SET ${setClause} WHERE id = ?`,
      [...updates.map((entry) => entry.value), id],
    );
    const row = await getMysqlStudentProgressionById(id);
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    res.json(row);
    return;
  }
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
  if (isMysqlDatabaseUrl) {
    await mysqlExecute(
      `UPDATE pd_student_progressions SET ${MYSQL_STUDENT_FIELD_MAP[field]} = ?, updated_at = NOW() WHERE id = ?`,
      [value ? 1 : 0, id],
    );
    const row = await getMysqlStudentProgressionById(id);
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    res.json(row);
    return;
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
  if (isMysqlDatabaseUrl) {
    await mysqlExecute(`DELETE FROM pd_student_progressions WHERE id = ?`, [id]);
    res.json({ ok: true });
    return;
  }
  await db.delete(studentProgressionsTable).where(eq(studentProgressionsTable.id, id));
  res.json({ ok: true });
});

// ── Roster sync helper ────────────────────────────────────────────────────────
export async function syncStudentProgressionsWithRoster(): Promise<{ added: string[]; terminated: string[] }> {
  if (isMysqlDatabaseUrl) {
    const ptaOfficers = (await getMysqlOfficers()).filter((officer) => officer.department === "PTA");
    const cadets = await getMysqlStudentProgressions();

    const ptaBadgeSet = new Set(ptaOfficers.map((officer) => officer.callSign).filter(Boolean));
    const cadetBadgeSet = new Set(cadets.map((cadet) => cadet.badgeNumber).filter(Boolean));
    const added: string[] = [];
    const terminated: string[] = [];

    for (const officer of ptaOfficers) {
      if (!officer.callSign || cadetBadgeSet.has(officer.callSign)) continue;
      await mysqlExecute(
        `INSERT INTO pd_student_progressions (
          name, badge_number, discord_id, discord_name, timezone, current_phase, status, strikes, hire_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          officer.name ?? officer.callSign,
          officer.callSign,
          officer.discordUid ?? null,
          officer.discordUsername ?? null,
          officer.timezone ?? null,
          "Phase 1",
          "Active",
          "0/4",
          officer.dateOfJoining ?? null,
        ],
      );
      added.push(`${officer.callSign} ${officer.name ?? ""}`.trim());
    }

    for (const cadet of cadets) {
      if (!cadet.badgeNumber || ptaBadgeSet.has(cadet.badgeNumber) || cadet.status === "Terminated") continue;
      await mysqlExecute(
        `UPDATE pd_student_progressions SET status = 'Terminated', updated_at = NOW() WHERE id = ?`,
        [cadet.id],
      );
      terminated.push(`${cadet.badgeNumber} ${cadet.name}`.trim());
    }

    return { added, terminated };
  }
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
