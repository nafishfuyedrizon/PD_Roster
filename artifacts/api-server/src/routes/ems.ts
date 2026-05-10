import { Router, type IRouter } from "express";
import { guard } from "../lib/auth-guard.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, emsDutyLogsTable, officersTable, shiftConfigsTable, dutyAdjustmentsTable, discordDutyEventsTable } from "@workspace/db";
import { getCurrentOpenDutyWeekSecsByCallSign, getCurrentWeekPeriod } from "../lib/duty-officer-match.js";
import {
  ListEmsDutyLogsQueryParams,
  ListEmsDutyLogsResponse,
  CreateEmsDutyLogBody,
  GetEmsStatsQueryParams,
  GetEmsStatsResponse,
  GetEmsBreakdownQueryParams,
  GetEmsBreakdownResponse,
  ListEmsWeekPeriodsResponse,
  UpdateEmsDutyLogParams,
  UpdateEmsDutyLogBody,
  UpdateEmsDutyLogResponse,
  DeleteEmsDutyLogParams,
} from "@workspace/api-zod";
import {
  getMysqlDutyAdjustments,
  getMysqlDutyEvents,
  getMysqlDutyLogs,
  getMysqlOfficers,
  getMysqlShiftConfigs,
  isMysqlDatabaseUrl,
  mysqlExecute,
} from "../lib/pd-mysql-read.js";
import { recomputeAllDutyHours } from "../lib/discord-bot.js";

const router: IRouter = Router();

// Parse "HH:MM:SS" or "H:MM:SS" or "0" to total seconds
function parseHms(h: string | null | undefined): number {
  if (!h || h === "0" || h.trim() === "") return 0;
  const parts = h.trim().split(":").map(Number);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60;
  return 0;
}

function hasPositiveDuty(h: string | null | undefined): boolean {
  return parseHms(h) > 0;
}

function secondsToHms(secs: number): string {
  if (secs < 0) secs = 0;
  if (secs === 0) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function ensureMysqlLegacyShiftConfigTable(): Promise<void> {
  await mysqlExecute(
    `CREATE TABLE IF NOT EXISTS shift_config (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      shift_name VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(255) NULL,
      start_hour INT NOT NULL,
      end_hour INT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function upsertMysqlLegacyShiftConfig(params: {
  shiftName: string;
  displayName: string;
  startHour: number;
  endHour: number;
  previousShiftName?: string | null;
}): Promise<void> {
  await ensureMysqlLegacyShiftConfigTable();
  const previous = params.previousShiftName?.trim();
  if (previous && previous !== params.shiftName) {
    await mysqlExecute(`DELETE FROM shift_config WHERE shift_name = ?`, [previous]);
  }
  await mysqlExecute(
    `INSERT INTO shift_config (shift_name, display_name, start_hour, end_hour, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       start_hour = VALUES(start_hour),
       end_hour = VALUES(end_hour),
       updated_at = NOW()`,
    [params.shiftName, params.displayName, params.startHour, params.endHour],
  );
}

async function deleteMysqlLegacyShiftConfig(params: {
  shiftName?: string | null;
  displayName?: string | null;
}): Promise<void> {
  await ensureMysqlLegacyShiftConfigTable();
  const clauses: string[] = [];
  const values: string[] = [];
  if (params.shiftName) {
    clauses.push(`shift_name = ?`);
    values.push(params.shiftName);
  }
  if (params.displayName) {
    clauses.push(`display_name = ?`);
    values.push(params.displayName);
  }
  if (clauses.length === 0) return;
  await mysqlExecute(`DELETE FROM shift_config WHERE ${clauses.join(" OR ")}`, values);
}

// Sort key for week periods that handles year boundaries correctly.
// Week periods are "MM/DD-MM/DD". String sort is wrong when data spans year
// boundaries (e.g. "12/30-01/05" sorts AFTER "04/06-04/12" alphabetically but
// is actually older). Use the end-date + estimated year as a numeric key.
function weekPeriodSortKey(wp: string): number {
  const now = new Date();
  const curMonth = now.getUTCMonth() + 1;
  const curYear = now.getUTCFullYear();
  const endMm = parseInt(wp.slice(6, 8), 10) || 0;
  const endDd = parseInt(wp.slice(9, 11), 10) || 0;
  // If the end-month is more than 1 month ahead of today, the week belongs to
  // the previous calendar year (handles December data while in April, etc.)
  const year = endMm > curMonth + 1 ? curYear - 1 : curYear;
  return year * 10000 + endMm * 100 + endDd;
}

router.get("/ems/duty-logs", async (req, res): Promise<void> => {
  const parsed = ListEmsDutyLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod, shiftType } = parsed.data;
  const resolvedShift = shiftType && shiftType !== "ALL" ? shiftType : "ALL";
  const conditions = [eq(emsDutyLogsTable.shiftType, resolvedShift)];
  if (weekPeriod) conditions.push(eq(emsDutyLogsTable.weekPeriod, weekPeriod));

  const [logs, allOfficers] = await Promise.all(
    isMysqlDatabaseUrl
      ? [
          getMysqlDutyLogs().then((rows) =>
            rows
              .filter((row) => row.shiftType === resolvedShift && (!weekPeriod || row.weekPeriod === weekPeriod))
              .sort((a, b) => a.csNumber.localeCompare(b.csNumber) || a.weekPeriod.localeCompare(b.weekPeriod)),
          ),
          getMysqlOfficers().then((rows) =>
            rows.map((row) => ({
              callSign: row.callSign,
              name: row.name,
              rank: row.rank,
              status: row.status,
            })),
          ),
        ]
      : [
          db.select().from(emsDutyLogsTable).where(and(...conditions)).orderBy(emsDutyLogsTable.csNumber, emsDutyLogsTable.weekPeriod),
          db.select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank, status: officersTable.status }).from(officersTable),
        ],
  );

  const officerByCs = new Map(allOfficers.filter((o) => o.callSign).map((o) => [o.callSign!, o]));

  const enriched = logs.map((l) => {
    const o = officerByCs.get(l.csNumber);
    if (!o) return l;
    return { ...l, name: o.name ?? l.name, rank: o.rank ?? l.rank, status: o.status ?? l.status };
  });

  res.json(ListEmsDutyLogsResponse.parse(enriched));
});

router.post("/ems/duty-logs", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const parsed = CreateEmsDutyLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [log] = await db.insert(emsDutyLogsTable).values(parsed.data).returning();
  res.status(201).json(UpdateEmsDutyLogResponse.parse(log));
});

router.get("/ems/stats", async (req, res): Promise<void> => {
  const parsed = GetEmsStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod, shiftType } = parsed.data;
  // Support comma-separated multi-shift: "SHIFT1,SHIFT2"
  const rawShifts = shiftType ? shiftType.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const resolvedShifts = rawShifts.length === 0 || rawShifts.includes("ALL") ? ["ALL"] : rawShifts;
  const shiftCond = resolvedShifts.length === 1
    ? eq(emsDutyLogsTable.shiftType, resolvedShifts[0]!)
    : inArray(emsDutyLogsTable.shiftType, resolvedShifts);

  // Get all weeks to determine current week and monthly window
  const allWeeks = isMysqlDatabaseUrl
    ? (await getMysqlDutyLogs())
        .filter((row) =>
          resolvedShifts.length === 1
            ? row.shiftType === resolvedShifts[0]
            : resolvedShifts.includes(row.shiftType),
        )
        .map((row) => ({ weekPeriod: row.weekPeriod }))
    : await db
        .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
        .from(emsDutyLogsTable)
        .where(shiftCond);

  const currentWeekPeriod = getCurrentWeekPeriod();
  // Sort chronologically (most-recent first) using year-aware sort key so that
  // December weeks don't falsely appear "later" than April weeks.
  const weekPeriods = [...new Set(allWeeks.map((w) => w.weekPeriod))]
    .sort((a, b) => weekPeriodSortKey(b) - weekPeriodSortKey(a));
  // Always include the current week even if no logs exist yet
  if (!weekPeriods.includes(currentWeekPeriod)) weekPeriods.unshift(currentWeekPeriod);
  // Always default to the actual current week — never rely on weekPeriods[0]
  // which could be an old December week due to sort order ambiguity.
  const latestWeek = weekPeriod ?? currentWeekPeriod;

  const [allLogs, weekLogs, allPdOfficersForStats, allAdjustments, allDutyEvents] = await Promise.all(
    isMysqlDatabaseUrl
      ? [
          getMysqlDutyLogs().then((rows) =>
            rows.filter((row) =>
              resolvedShifts.length === 1
                ? row.shiftType === resolvedShifts[0]
                : resolvedShifts.includes(row.shiftType),
            ),
          ),
          getMysqlDutyLogs().then((rows) =>
            rows.filter((row) =>
              row.weekPeriod === latestWeek &&
              (resolvedShifts.length === 1
                ? row.shiftType === resolvedShifts[0]
                : resolvedShifts.includes(row.shiftType)),
            ),
          ),
          getMysqlOfficers().then((rows) =>
            rows.map((row) => ({
              id: row.id,
              callSign: row.callSign,
              name: row.name,
              rank: row.rank,
              status: row.status,
              discordUsername: row.discordUsername,
              rockstarLicenseId: row.rockstarLicenseId,
            })),
          ),
          getMysqlDutyAdjustments(),
          resolvedShifts.length === 1 && resolvedShifts[0] === "ALL"
            ? getMysqlDutyEvents()
            : Promise.resolve([]),
        ]
      : [
          db.select().from(emsDutyLogsTable).where(shiftCond),
          db.select().from(emsDutyLogsTable).where(and(eq(emsDutyLogsTable.weekPeriod, latestWeek), shiftCond)),
          db
            .select({
              id: officersTable.id,
              callSign: officersTable.callSign,
              name: officersTable.name,
              rank: officersTable.rank,
              status: officersTable.status,
              discordUsername: officersTable.discordUsername,
              rockstarLicenseId: officersTable.rockstarLicenseId,
            })
            .from(officersTable),
          db.select().from(dutyAdjustmentsTable),
          resolvedShifts.length === 1 && resolvedShifts[0] === "ALL"
            ? db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt))
            : Promise.resolve([]),
        ],
  );
  const pdMap: Record<string, { name: string; rank: string; status: string }> = {};
  for (const o of allPdOfficersForStats) pdMap[o.callSign] = { name: o.name ?? o.callSign, rank: o.rank, status: o.status };
  const liveWeekSecsByCs =
    resolvedShifts.length === 1 && resolvedShifts[0] === "ALL"
      ? getCurrentOpenDutyWeekSecsByCallSign(allDutyEvents, allPdOfficersForStats)
      : {};

  // Active personnel is the roster status count. Officers with zero logged duty
  // still belong in this summary card and are shown in the under-hours table.
  const activePersonnel = allPdOfficersForStats.filter((o) => o.status === "Active").length;

  // Monthly total across all PD officer logs (aggregate across selected shifts)
  const pdLogSecs: Record<string, number> = {};
  for (const l of allLogs) {
    if (pdMap[l.csNumber]) {
      pdLogSecs[l.csNumber] = (pdLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }

  for (const adj of allAdjustments) {
    if (pdMap[adj.officerCs]) {
      pdLogSecs[adj.officerCs] = (pdLogSecs[adj.officerCs] ?? 0) + adj.adjustmentSeconds;
    }
  }
  for (const [cs, secs] of Object.entries(liveWeekSecsByCs)) {
    if (pdMap[cs]) {
      pdLogSecs[cs] = (pdLogSecs[cs] ?? 0) + secs;
    }
  }

  const monthlyTotalSecs = Math.max(0, Object.values(pdLogSecs).reduce((a, b) => a + b, 0));

  // Top performers this week — PD officers only (aggregate across selected shifts)
  const weekLogSecs: Record<string, number> = {};
  for (const l of weekLogs) {
    if (pdMap[l.csNumber]) {
      weekLogSecs[l.csNumber] = (weekLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }
  if (latestWeek === currentWeekPeriod) {
    for (const [cs, secs] of Object.entries(liveWeekSecsByCs)) {
      if (pdMap[cs]) {
        weekLogSecs[cs] = (weekLogSecs[cs] ?? 0) + secs;
      }
    }
  }
  const weeklyTopPerformers = Object.entries(weekLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: Math.max(0, secs) }))
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .map((p, i) => ({ ...p, totalHours: secondsToHms(p.totalSecs), position: i + 1 }));

  // Top performers monthly — PD officers only
  const monthlyTopPerformers = Object.entries(pdLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: Math.max(0, secs) }))
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .map((p, i) => ({ ...p, totalHours: secondsToHms(p.totalSecs), position: i + 1 }));

  const stats = {
    activePersonnel,
    monthlyTotal: secondsToHms(monthlyTotalSecs),
    weeklyTopPerformers,
    monthlyTopPerformers,
    weekPeriods,
  };

  res.json(GetEmsStatsResponse.parse(stats));
});

router.get("/ems/breakdown", async (req, res): Promise<void> => {
  const parsed = GetEmsBreakdownQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { shiftType } = parsed.data;
  // Support comma-separated multi-shift: "SHIFT1,SHIFT2"
  const rawShifts = shiftType ? shiftType.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const resolvedShifts = rawShifts.length === 0 || rawShifts.includes("ALL") ? ["ALL"] : rawShifts;
  const shiftCond = resolvedShifts.length === 1
    ? eq(emsDutyLogsTable.shiftType, resolvedShifts[0]!)
    : inArray(emsDutyLogsTable.shiftType, resolvedShifts);

  const [logs, rawPdOfficers, allAdjustments, allDutyEvents] = await Promise.all(
    isMysqlDatabaseUrl
      ? [
          getMysqlDutyLogs().then((rows) =>
            rows
              .filter((row) =>
                resolvedShifts.length === 1
                  ? row.shiftType === resolvedShifts[0]
                  : resolvedShifts.includes(row.shiftType),
              )
              .sort((a, b) => a.weekPeriod.localeCompare(b.weekPeriod)),
          ),
          getMysqlOfficers().then((rows) =>
            rows
              .map((row) => ({
                id: row.id,
                callSign: row.callSign,
                name: row.name,
                rank: row.rank,
                status: row.status,
                discordUsername: row.discordUsername,
                discordUid: row.discordUid,
                rockstarLicenseId: row.rockstarLicenseId,
              }))
              .sort((a, b) => a.rank.localeCompare(b.rank) || a.callSign.localeCompare(b.callSign)),
          ),
          getMysqlDutyAdjustments(),
          resolvedShifts.length === 1 && resolvedShifts[0] === "ALL"
            ? getMysqlDutyEvents()
            : Promise.resolve([]),
        ]
      : [
          db.select().from(emsDutyLogsTable).where(shiftCond).orderBy(emsDutyLogsTable.weekPeriod),
          db
            .select({
              id: officersTable.id,
              callSign: officersTable.callSign,
              name: officersTable.name,
              rank: officersTable.rank,
              status: officersTable.status,
              discordUsername: officersTable.discordUsername,
              discordUid: officersTable.discordUid,
              rockstarLicenseId: officersTable.rockstarLicenseId,
            })
            .from(officersTable)
            .orderBy(officersTable.rank, officersTable.callSign),
          db.select().from(dutyAdjustmentsTable),
          resolvedShifts.length === 1 && resolvedShifts[0] === "ALL"
            ? db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt))
            : Promise.resolve([]),
        ],
  );

  // Get distinct week periods sorted chronologically (most-recent first).
  // Use year-aware sort key so December weeks don't sort after April weeks.
  const _cwp = getCurrentWeekPeriod();
  const allWeekPeriods = [...new Set(logs.map((l) => l.weekPeriod))]
    .sort((a, b) => weekPeriodSortKey(b) - weekPeriodSortKey(a));
  if (!allWeekPeriods.includes(_cwp)) allWeekPeriods.unshift(_cwp);
  const _seenCs = new Set<string>();
  const allPdOfficers = rawPdOfficers.filter((o) => {
    if (_seenCs.has(o.callSign)) return false;
    _seenCs.add(o.callSign);
    return true;
  });

  // Build a map of duty log data keyed by csNumber + weekPeriod
  // When multiple shifts selected, SUM hours per officer per weekPeriod
  const logWeekSecsMap: Record<string, Record<string, number>> = {};
  const logSecsMap: Record<string, number> = {};
  for (const l of logs) {
    if (!logWeekSecsMap[l.csNumber]) logWeekSecsMap[l.csNumber] = {};
    logWeekSecsMap[l.csNumber]![l.weekPeriod] =
      (logWeekSecsMap[l.csNumber]![l.weekPeriod] ?? 0) + parseHms(l.dutyHours);
    logSecsMap[l.csNumber] = (logSecsMap[l.csNumber] ?? 0) + parseHms(l.dutyHours);
  }
  if (resolvedShifts.length === 1 && resolvedShifts[0] === "ALL") {
    const liveWeekSecsByCs = getCurrentOpenDutyWeekSecsByCallSign(allDutyEvents, allPdOfficers);
    for (const [cs, secs] of Object.entries(liveWeekSecsByCs)) {
      if (!logWeekSecsMap[cs]) logWeekSecsMap[cs] = {};
      logWeekSecsMap[cs]![_cwp] = (logWeekSecsMap[cs]![_cwp] ?? 0) + secs;
      logSecsMap[cs] = (logSecsMap[cs] ?? 0) + secs;
    }
  }
  // Convert seconds back to HH:MM:SS for the week map
  const logMap: Record<string, Record<string, string | null>> = {};
  for (const [cs, weekMap] of Object.entries(logWeekSecsMap)) {
    logMap[cs] = {};
    for (const [wp, secs] of Object.entries(weekMap)) {
      logMap[cs]![wp] = secondsToHms(secs);
    }
  }

  // adjMonthMap[csNumber][MONTH] = total adjustment seconds for that month
  const adjMonthMap: Record<string, Record<string, number>> = {};
  for (const adj of allAdjustments) {
    if (!adjMonthMap[adj.officerCs]) adjMonthMap[adj.officerCs] = {};
    adjMonthMap[adj.officerCs]![adj.dutyMonth] =
      (adjMonthMap[adj.officerCs]![adj.dutyMonth] ?? 0) + adj.adjustmentSeconds;
    // Also add to officer's total seconds
    logSecsMap[adj.officerCs] = (logSecsMap[adj.officerCs] ?? 0) + adj.adjustmentSeconds;
  }

  const breakdown = allPdOfficers.map((o) => ({
    csNumber: o.callSign,
    name: o.name ?? o.callSign,
    status: o.status,
    rank: o.rank,
    discordUsername: o.discordUsername ?? null,
    discordUid: o.discordUid ?? null,
    totalHours: secondsToHms(Math.max(0, logSecsMap[o.callSign] ?? 0)),
    monthAdjustments: adjMonthMap[o.callSign] ?? {},
    weeks: allWeekPeriods.map((wp) => ({
      weekPeriod: wp,
      dutyHours: logMap[o.callSign]?.[wp] ?? null,
    })),
  }));

  // Sort by total hours desc
  breakdown.sort((a, b) => parseHms(b.totalHours) - parseHms(a.totalHours));

  res.json(GetEmsBreakdownResponse.parse(breakdown));
});

router.get("/ems/officer-duty/:callSign", async (req, res): Promise<void> => {
  const callSign = req.params.callSign as string;

  const officer = isMysqlDatabaseUrl
    ? (await getMysqlOfficers()).find((row) => row.callSign === callSign)
    : (await db
        .select()
        .from(officersTable)
        .where(eq(officersTable.callSign, callSign))
        .limit(1))[0];

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [logs, allDutyEvents] = await Promise.all(
    isMysqlDatabaseUrl
      ? [
          getMysqlDutyLogs().then((rows) =>
            rows
              .filter((row) => row.csNumber === callSign)
              .sort((a, b) => b.weekPeriod.localeCompare(a.weekPeriod)),
          ),
          getMysqlDutyEvents(),
        ]
      : [
          db
            .select()
            .from(emsDutyLogsTable)
            .where(eq(emsDutyLogsTable.csNumber, callSign))
            .orderBy(desc(emsDutyLogsTable.weekPeriod)),
          db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt)),
        ],
  );

  const weekMap: Record<string, Record<string, string>> = {};
  for (const l of logs) {
    if (!weekMap[l.weekPeriod]) weekMap[l.weekPeriod] = {};
    weekMap[l.weekPeriod]![l.shiftType] = l.dutyHours ?? "00:00:00";
  }

  const currentWeekPeriod = getCurrentWeekPeriod();
  const liveWeekSecsByCs = getCurrentOpenDutyWeekSecsByCallSign(allDutyEvents, [officer]);
  const liveSecs = liveWeekSecsByCs[callSign] ?? 0;
  if (liveSecs > 0) {
    if (!weekMap[currentWeekPeriod]) weekMap[currentWeekPeriod] = {};
    const currentAllSecs = parseHms(weekMap[currentWeekPeriod]!.ALL);
    weekMap[currentWeekPeriod]!.ALL = secondsToHms(currentAllSecs + liveSecs);
  }

  const weeks = Object.entries(weekMap)
    .sort(([a], [b]) => weekPeriodSortKey(b) - weekPeriodSortKey(a))
    .map(([weekPeriod, shifts]) => ({ weekPeriod, shifts }));

  res.json({
    csNumber: officer.callSign,
    name: officer.name ?? officer.callSign,
    rank: officer.rank,
    status: officer.status,
    citizenId: officer.citizenId,
    dateOfJoining: officer.dateOfJoining,
    pilot: officer.pilot,
    ftp: officer.ftp,
    appointedFto: officer.appointedFto,
    mdt: officer.mdt,
    seu: officer.seu,
    smg: officer.smg,
    rifle: officer.rifle,
    shotgun: officer.shotgun,
    rifleTierII: officer.rifleTierII,
    discordUsername: officer.discordUsername,
    isManagement: officer.isManagement,
    weeks,
  });
});

router.get("/ems/week-periods", async (_req, res): Promise<void> => {
  const rows = isMysqlDatabaseUrl
    ? [...new Set((await getMysqlDutyLogs()).map((row) => row.weekPeriod))].map((weekPeriod) => ({ weekPeriod }))
    : await db
        .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
        .from(emsDutyLogsTable);

  // Use year-aware sort so December weeks sort before April weeks correctly
  const sorted = rows.map((r) => r.weekPeriod)
    .sort((a, b) => weekPeriodSortKey(b) - weekPeriodSortKey(a));
  res.json(ListEmsWeekPeriodsResponse.parse(sorted));
});

router.put("/ems/duty-logs/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const params = UpdateEmsDutyLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateEmsDutyLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [log] = await db
    .update(emsDutyLogsTable)
    .set(parsed.data)
    .where(eq(emsDutyLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Duty log not found" });
    return;
  }

  res.json(UpdateEmsDutyLogResponse.parse(log));
});

router.delete("/ems/duty-logs/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 3)) return;
  const params = DeleteEmsDutyLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [log] = await db
    .delete(emsDutyLogsTable)
    .where(eq(emsDutyLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Duty log not found" });
    return;
  }

  res.sendStatus(204);
});

// ── Shift Configs ───────────────────────────────────────────────────────────

const DEFAULT_SHIFTS = [
  { key: "EVENING",  label: "Evening",    sub: "8PM – 10PM", icon: "☽", startHour: 20, endHour: 22, sortOrder: 1 },
  { key: "NIGHT",    label: "Night",      sub: "10PM – 2AM", icon: "✦", startHour: 22, endHour: 2,  sortOrder: 2 },
  { key: "MIDNIGHT", label: "Midnight",   sub: "12AM – 6AM", icon: "◎", startHour: 0,  endHour: 6,  sortOrder: 3 },
  { key: "FULL",     label: "Full Shift", sub: "8PM – 2AM",  icon: "⊙", startHour: 20, endHour: 2,  sortOrder: 4 },
];

router.get("/ems/shift-configs", async (_req, res): Promise<void> => {
  let rows = isMysqlDatabaseUrl
    ? await getMysqlShiftConfigs()
    : await db.select().from(shiftConfigsTable).orderBy(shiftConfigsTable.sortOrder);
  if (rows.length === 0) {
    if (!isMysqlDatabaseUrl) {
      await db.insert(shiftConfigsTable).values(DEFAULT_SHIFTS).onConflictDoNothing();
      rows = await db.select().from(shiftConfigsTable).orderBy(shiftConfigsTable.sortOrder);
    }
  }
  res.json(rows);
});

router.post("/ems/shift-configs", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const { key, label, sub, icon, startHour, endHour, sortOrder } = req.body as {
    key: string; label: string; sub?: string; icon?: string; startHour: number; endHour: number; sortOrder?: number;
  };
  if (!key || !label || startHour == null || endHour == null) {
    res.status(400).json({ error: "key, label, startHour, endHour required" });
    return;
  }
  const cleanKey = key.toUpperCase().replace(/\s+/g, "_");
  if (isMysqlDatabaseUrl) {
    try {
      await mysqlExecute(
        `INSERT INTO pd_shift_configs
          (\`key\`, label, sub, icon, start_hour, end_hour, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cleanKey, label, sub ?? "", icon ?? "●", startHour, endHour, sortOrder ?? 99],
      );
      await upsertMysqlLegacyShiftConfig({
        shiftName: label,
        displayName: cleanKey,
        startHour,
        endHour,
      });
      await recomputeAllDutyHours();
      const row = (await getMysqlShiftConfigs()).find((item) => item.key === cleanKey) ?? null;
      res.status(201).json(row);
      return;
    } catch (err: any) {
      const message = String(err?.message ?? "");
      if (message.toLowerCase().includes("duplicate")) {
        res.status(409).json({ error: "Shift key already exists" });
        return;
      }
      throw err;
    }
  }
  const [row] = await db.insert(shiftConfigsTable).values({
    key: cleanKey,
    label, sub: sub ?? "", icon: icon ?? "●",
    startHour, endHour, sortOrder: sortOrder ?? 99,
  }).returning();
  res.status(201).json(row);
});

router.put("/ems/shift-configs/:key", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const { key } = req.params;
  const { newKey, label, sub, icon, startHour, endHour, sortOrder } = req.body as {
    newKey?: string; label?: string; sub?: string; icon?: string; startHour?: number; endHour?: number; sortOrder?: number;
  };

  if (isMysqlDatabaseUrl) {
    const rows = await getMysqlShiftConfigs();
    const base = rows.find((row) => row.key === key);
    if (!base) {
      res.status(404).json({ error: "Shift not found" });
      return;
    }

    const finalKey = (newKey ?? key).toUpperCase().replace(/\s+/g, "_");
    const finalLabel = label ?? base.label;
    const finalSub = sub ?? base.sub;
    const finalIcon = icon ?? base.icon;
    const finalStartHour = startHour ?? base.startHour;
    const finalEndHour = endHour ?? base.endHour;
    const finalSortOrder = sortOrder ?? base.sortOrder;

    if (finalKey !== key) {
      const duplicate = rows.find((row) => row.key === finalKey);
      if (duplicate) {
        res.status(409).json({ error: "Shift key already exists" });
        return;
      }
    }

    await mysqlExecute(
      `UPDATE pd_shift_configs
       SET \`key\` = ?, label = ?, sub = ?, icon = ?, start_hour = ?, end_hour = ?, sort_order = ?
       WHERE \`key\` = ?`,
      [finalKey, finalLabel, finalSub, finalIcon, finalStartHour, finalEndHour, finalSortOrder, key],
    );
    await upsertMysqlLegacyShiftConfig({
      shiftName: finalLabel,
      displayName: finalKey,
      startHour: finalStartHour,
      endHour: finalEndHour,
      previousShiftName: base.label,
    });
    await recomputeAllDutyHours();

    const row = (await getMysqlShiftConfigs()).find((item) => item.key === finalKey) ?? null;
    res.json(row);
    return;
  }

  // Fetch current row first
  const existing = await db.select().from(shiftConfigsTable).where(eq(shiftConfigsTable.key, key));
  if (!existing[0]) { res.status(404).json({ error: "Shift not found" }); return; }

  const base = existing[0];
  const finalLabel     = label     ?? base.label;
  const finalSub       = sub       ?? base.sub;
  const finalIcon      = icon      ?? base.icon;
  const finalStartHour = startHour ?? base.startHour;
  const finalEndHour   = endHour   ?? base.endHour;
  const finalSortOrder = sortOrder ?? base.sortOrder;

  // Key rename: delete old, insert new
  if (newKey && newKey !== key) {
    const cleanKey = newKey.toUpperCase().replace(/\s+/g, "_");
    await db.delete(shiftConfigsTable).where(eq(shiftConfigsTable.key, key));
    const [row] = await db.insert(shiftConfigsTable).values({
      key: cleanKey, label: finalLabel, sub: finalSub, icon: finalIcon,
      startHour: finalStartHour, endHour: finalEndHour, sortOrder: finalSortOrder,
    }).returning();
    res.json(row);
    return;
  }

  // Normal update (key unchanged)
  const updates: Partial<typeof shiftConfigsTable.$inferInsert> = {};
  if (label     != null) updates.label     = label;
  if (sub       != null) updates.sub       = sub;
  if (icon      != null) updates.icon      = icon;
  if (startHour != null) updates.startHour = startHour;
  if (endHour   != null) updates.endHour   = endHour;
  if (sortOrder != null) updates.sortOrder = sortOrder;
  const [row] = await db.update(shiftConfigsTable).set(updates).where(eq(shiftConfigsTable.key, key)).returning();
  res.json(row);
});

router.delete("/ems/shift-configs/:key", async (req, res): Promise<void> => {
  if (guard(req, res, 3)) return;
  const { key } = req.params;
  if (isMysqlDatabaseUrl) {
    const base = (await getMysqlShiftConfigs()).find((row) => row.key === key) ?? null;
    const result = await mysqlExecute(`DELETE FROM pd_shift_configs WHERE \`key\` = ?`, [key]);
    if ((result.affectedRows ?? 0) === 0) {
      res.status(404).json({ error: "Shift not found" });
      return;
    }
    await deleteMysqlLegacyShiftConfig({
      shiftName: base?.label ?? null,
      displayName: key,
    });
    await recomputeAllDutyHours();
    res.sendStatus(204);
    return;
  }
  const [row] = await db.delete(shiftConfigsTable).where(eq(shiftConfigsTable.key, key)).returning();
  if (!row) { res.status(404).json({ error: "Shift not found" }); return; }
  res.sendStatus(204);
});

export default router;
