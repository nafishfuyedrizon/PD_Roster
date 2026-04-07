import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, emsDutyLogsTable, officersTable, shiftConfigsTable, dutyAdjustmentsTable } from "@workspace/db";
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

const router: IRouter = Router();

// Parse "HH:MM:SS" or "H:MM:SS" or "0" to total seconds
function parseHms(h: string | null | undefined): number {
  if (!h || h === "0" || h.trim() === "") return 0;
  const parts = h.trim().split(":").map(Number);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60;
  return 0;
}

function secondsToHms(secs: number): string {
  if (secs === 0) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Returns the current Mon–Sun week period in UTC e.g. "04/06-04/12"
function getCurrentWeekPeriod(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  return `${fmt(mon)}-${fmt(sun)}`;
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

  const [logs, allOfficers] = await Promise.all([
    db.select().from(emsDutyLogsTable).where(and(...conditions)).orderBy(emsDutyLogsTable.csNumber, emsDutyLogsTable.weekPeriod),
    db.select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank, status: officersTable.status }).from(officersTable),
  ]);

  const officerByCs = new Map(allOfficers.filter((o) => o.callSign).map((o) => [o.callSign!, o]));

  const enriched = logs.map((l) => {
    const o = officerByCs.get(l.csNumber);
    if (!o) return l;
    return { ...l, name: o.name ?? l.name, rank: o.rank ?? l.rank, status: o.status ?? l.status };
  });

  res.json(ListEmsDutyLogsResponse.parse(enriched));
});

router.post("/ems/duty-logs", async (req, res): Promise<void> => {
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
  const allWeeks = await db
    .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
    .from(emsDutyLogsTable)
    .where(shiftCond)
    .orderBy(desc(emsDutyLogsTable.weekPeriod));

  const weekPeriods = allWeeks.map((w) => w.weekPeriod);
  // Always include the current week even if no logs exist yet
  const currentWeekPeriod = getCurrentWeekPeriod();
  if (!weekPeriods.includes(currentWeekPeriod)) weekPeriods.unshift(currentWeekPeriod);
  const latestWeek = weekPeriod ?? weekPeriods[0] ?? "";

  // All logs (for monthly stats)
  const allLogs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(shiftCond);

  // This week's logs
  const weekLogs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(and(eq(emsDutyLogsTable.weekPeriod, latestWeek), shiftCond));

  // Fetch ALL PD officers as the authority for names/ranks
  const allPdOfficersForStats = await db
    .select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank, status: officersTable.status })
    .from(officersTable);
  const pdMap: Record<string, { name: string; rank: string; status: string }> = {};
  for (const o of allPdOfficersForStats) pdMap[o.callSign] = { name: o.name ?? o.callSign, rank: o.rank, status: o.status };

  // Active personnel = PD officers that are Active and have at least one duty log
  const logCsSet = new Set(allLogs.map((l) => l.csNumber));
  const activePersonnel = allPdOfficersForStats.filter(
    (o) => o.status === "Active" && logCsSet.has(o.callSign)
  ).length;

  // Monthly total across all PD officer logs (aggregate across selected shifts)
  const pdLogSecs: Record<string, number> = {};
  for (const l of allLogs) {
    if (pdMap[l.csNumber]) {
      pdLogSecs[l.csNumber] = (pdLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }

  // Incorporate duty adjustments into monthly totals (aggregate across selected shifts)
  const adjCond = resolvedShifts.length === 1
    ? eq(dutyAdjustmentsTable.shiftType, resolvedShifts[0]!)
    : inArray(dutyAdjustmentsTable.shiftType, resolvedShifts);
  const allAdjustments = await db
    .select()
    .from(dutyAdjustmentsTable)
    .where(adjCond);
  for (const adj of allAdjustments) {
    if (pdMap[adj.officerCs]) {
      pdLogSecs[adj.officerCs] = (pdLogSecs[adj.officerCs] ?? 0) + adj.adjustmentSeconds;
    }
  }

  const monthlyTotalSecs = Object.values(pdLogSecs).reduce((a, b) => a + b, 0);

  // Top performers this week — PD officers only (aggregate across selected shifts)
  const weekLogSecs: Record<string, number> = {};
  for (const l of weekLogs) {
    if (pdMap[l.csNumber]) {
      weekLogSecs[l.csNumber] = (weekLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }
  const weeklyTopPerformers = Object.entries(weekLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: secs }))
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .map((p, i) => ({ ...p, totalHours: secondsToHms(p.totalSecs), position: i + 1 }));

  // Top performers monthly — PD officers only
  const monthlyTopPerformers = Object.entries(pdLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: secs }))
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

  const logs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(shiftCond)
    .orderBy(emsDutyLogsTable.weekPeriod);

  // Get distinct week periods sorted, always including the current week
  const allWeekPeriods = [...new Set(logs.map((l) => l.weekPeriod))].sort().reverse();
  const _cwp = getCurrentWeekPeriod();
  if (!allWeekPeriods.includes(_cwp)) allWeekPeriods.unshift(_cwp);

  // Fetch ALL PD officers as the source of truth
  const allPdOfficers = await db
    .select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank, status: officersTable.status, discordUsername: officersTable.discordUsername, discordUid: officersTable.discordUid })
    .from(officersTable)
    .orderBy(officersTable.rank, officersTable.callSign);

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
  // Convert seconds back to HH:MM:SS for the week map
  const logMap: Record<string, Record<string, string | null>> = {};
  for (const [cs, weekMap] of Object.entries(logWeekSecsMap)) {
    logMap[cs] = {};
    for (const [wp, secs] of Object.entries(weekMap)) {
      logMap[cs]![wp] = secondsToHms(secs);
    }
  }

  // Fetch duty adjustments and build per-officer, per-month maps
  const adjCond = resolvedShifts.length === 1
    ? eq(dutyAdjustmentsTable.shiftType, resolvedShifts[0]!)
    : inArray(dutyAdjustmentsTable.shiftType, resolvedShifts);
  const allAdjustments = await db
    .select()
    .from(dutyAdjustmentsTable)
    .where(adjCond);

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

  const [officer] = await db
    .select()
    .from(officersTable)
    .where(eq(officersTable.callSign, callSign))
    .limit(1);

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const logs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(eq(emsDutyLogsTable.csNumber, callSign))
    .orderBy(desc(emsDutyLogsTable.weekPeriod));

  const weekMap: Record<string, Record<string, string>> = {};
  for (const l of logs) {
    if (!weekMap[l.weekPeriod]) weekMap[l.weekPeriod] = {};
    weekMap[l.weekPeriod]![l.shiftType] = l.dutyHours ?? "00:00:00";
  }

  const weeks = Object.entries(weekMap)
    .sort(([a], [b]) => b.localeCompare(a))
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
  const rows = await db
    .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
    .from(emsDutyLogsTable)
    .orderBy(desc(emsDutyLogsTable.weekPeriod));

  res.json(ListEmsWeekPeriodsResponse.parse(rows.map((r) => r.weekPeriod)));
});

router.put("/ems/duty-logs/:id", async (req, res): Promise<void> => {
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
  let rows = await db.select().from(shiftConfigsTable).orderBy(shiftConfigsTable.sortOrder);
  if (rows.length === 0) {
    await db.insert(shiftConfigsTable).values(DEFAULT_SHIFTS).onConflictDoNothing();
    rows = await db.select().from(shiftConfigsTable).orderBy(shiftConfigsTable.sortOrder);
  }
  res.json(rows);
});

router.post("/ems/shift-configs", async (req, res): Promise<void> => {
  const { key, label, sub, icon, startHour, endHour, sortOrder } = req.body as {
    key: string; label: string; sub?: string; icon?: string; startHour: number; endHour: number; sortOrder?: number;
  };
  if (!key || !label || startHour == null || endHour == null) {
    res.status(400).json({ error: "key, label, startHour, endHour required" });
    return;
  }
  const [row] = await db.insert(shiftConfigsTable).values({
    key: key.toUpperCase().replace(/\s+/g, "_"),
    label, sub: sub ?? "", icon: icon ?? "●",
    startHour, endHour, sortOrder: sortOrder ?? 99,
  }).returning();
  res.status(201).json(row);
});

router.put("/ems/shift-configs/:key", async (req, res): Promise<void> => {
  const { key } = req.params;
  const { newKey, label, sub, icon, startHour, endHour, sortOrder } = req.body as {
    newKey?: string; label?: string; sub?: string; icon?: string; startHour?: number; endHour?: number; sortOrder?: number;
  };

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
  const { key } = req.params;
  const [row] = await db.delete(shiftConfigsTable).where(eq(shiftConfigsTable.key, key)).returning();
  if (!row) { res.status(404).json({ error: "Shift not found" }); return; }
  res.sendStatus(204);
});

export default router;
