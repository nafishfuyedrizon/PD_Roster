import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, emsDutyLogsTable, officersTable } from "@workspace/db";
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

router.get("/ems/duty-logs", async (req, res): Promise<void> => {
  const parsed = ListEmsDutyLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod, shiftType } = parsed.data;
  const conditions = [];
  if (weekPeriod) conditions.push(eq(emsDutyLogsTable.weekPeriod, weekPeriod));
  if (shiftType && shiftType !== "ALL") conditions.push(eq(emsDutyLogsTable.shiftType, shiftType));

  const logs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(emsDutyLogsTable.csNumber, emsDutyLogsTable.weekPeriod);

  res.json(ListEmsDutyLogsResponse.parse(logs));
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

  // Get all weeks to determine current week and monthly window
  const allWeeks = await db
    .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
    .from(emsDutyLogsTable)
    .orderBy(desc(emsDutyLogsTable.weekPeriod));

  const weekPeriods = allWeeks.map((w) => w.weekPeriod);
  const latestWeek = weekPeriod ?? weekPeriods[0] ?? "";

  const shiftCond = shiftType && shiftType !== "ALL"
    ? [eq(emsDutyLogsTable.shiftType, shiftType)]
    : [];

  // All logs (for monthly stats)
  const allLogs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(shiftCond.length > 0 ? and(...shiftCond) : undefined);

  // This week's logs
  const weekLogs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(
      shiftCond.length > 0
        ? and(eq(emsDutyLogsTable.weekPeriod, latestWeek), ...shiftCond)
        : eq(emsDutyLogsTable.weekPeriod, latestWeek)
    );

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

  // Monthly total across all PD officer logs
  const pdLogSecs: Record<string, number> = {};
  for (const l of allLogs) {
    if (pdMap[l.csNumber]) {
      pdLogSecs[l.csNumber] = (pdLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }
  const monthlyTotalSecs = Object.values(pdLogSecs).reduce((a, b) => a + b, 0);

  // Top performers this week — PD officers only
  const weekLogSecs: Record<string, number> = {};
  for (const l of weekLogs) {
    if (pdMap[l.csNumber]) {
      weekLogSecs[l.csNumber] = (weekLogSecs[l.csNumber] ?? 0) + parseHms(l.dutyHours);
    }
  }
  const weeklyTopPerformers = Object.entries(weekLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: secs }))
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .slice(0, 5)
    .map((p, i) => ({ ...p, totalHours: secondsToHms(p.totalSecs), position: i + 1 }));

  // Top performers monthly — PD officers only
  const monthlyTopPerformers = Object.entries(pdLogSecs)
    .map(([cs, secs]) => ({ csNumber: cs, name: pdMap[cs]!.name, rank: pdMap[cs]!.rank, totalSecs: secs }))
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .slice(0, 5)
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
  const shiftCond = shiftType && shiftType !== "ALL"
    ? [eq(emsDutyLogsTable.shiftType, shiftType)]
    : [];

  const logs = await db
    .select()
    .from(emsDutyLogsTable)
    .where(shiftCond.length > 0 ? and(...shiftCond) : undefined)
    .orderBy(emsDutyLogsTable.weekPeriod);

  // Get distinct week periods sorted
  const allWeekPeriods = [...new Set(logs.map((l) => l.weekPeriod))].sort().reverse();

  // Fetch ALL PD officers as the source of truth
  const allPdOfficers = await db
    .select({ callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank, status: officersTable.status })
    .from(officersTable)
    .orderBy(officersTable.rank, officersTable.callSign);

  // Build a map of duty log data keyed by csNumber + weekPeriod
  const logMap: Record<string, Record<string, string | null>> = {};
  const logSecsMap: Record<string, number> = {};
  for (const l of logs) {
    if (!logMap[l.csNumber]) logMap[l.csNumber] = {};
    logMap[l.csNumber]![l.weekPeriod] = l.dutyHours ?? null;
    logSecsMap[l.csNumber] = (logSecsMap[l.csNumber] ?? 0) + parseHms(l.dutyHours);
  }

  const breakdown = allPdOfficers.map((o) => ({
    csNumber: o.callSign,
    name: o.name ?? o.callSign,
    status: o.status,
    rank: o.rank,
    totalHours: secondsToHms(logSecsMap[o.callSign] ?? 0),
    weeks: allWeekPeriods.map((wp) => ({
      weekPeriod: wp,
      dutyHours: logMap[o.callSign]?.[wp] ?? null,
    })),
  }));

  // Sort by total hours desc
  breakdown.sort((a, b) => parseHms(b.totalHours) - parseHms(a.totalHours));

  res.json(GetEmsBreakdownResponse.parse(breakdown));
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

export default router;
