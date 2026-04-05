import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, emsDutyLogsTable } from "@workspace/db";
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

  // Active personnel = distinct names with status Active
  const activeNames = new Set(allLogs.filter((l) => l.status === "Active").map((l) => l.csNumber));
  const activePersonnel = activeNames.size;

  // Monthly total across all weeks
  const monthlyTotalSecs = allLogs.reduce((acc, l) => acc + parseHms(l.dutyHours), 0);

  // Top performers this week
  const weekMap: Record<string, { csNumber: string; name: string; rank: string; totalSecs: number }> = {};
  for (const l of weekLogs) {
    if (!weekMap[l.csNumber]) weekMap[l.csNumber] = { csNumber: l.csNumber, name: l.name, rank: l.rank, totalSecs: 0 };
    weekMap[l.csNumber]!.totalSecs += parseHms(l.dutyHours);
  }
  const weeklyTopPerformers = Object.values(weekMap)
    .sort((a, b) => b.totalSecs - a.totalSecs)
    .slice(0, 5)
    .map((p, i) => ({ ...p, totalHours: secondsToHms(p.totalSecs), position: i + 1 }));

  // Top performers monthly (all weeks combined)
  const monthMap: Record<string, { csNumber: string; name: string; rank: string; totalSecs: number }> = {};
  for (const l of allLogs) {
    if (!monthMap[l.csNumber]) monthMap[l.csNumber] = { csNumber: l.csNumber, name: l.name, rank: l.rank, totalSecs: 0 };
    monthMap[l.csNumber]!.totalSecs += parseHms(l.dutyHours);
  }
  const monthlyTopPerformers = Object.values(monthMap)
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

  // Group by person
  const personMap: Record<string, {
    csNumber: string; name: string; status: string; rank: string;
    weekMap: Record<string, string | null>;
    totalSecs: number;
  }> = {};

  for (const l of logs) {
    if (!personMap[l.csNumber]) {
      personMap[l.csNumber] = {
        csNumber: l.csNumber,
        name: l.name,
        status: l.status,
        rank: l.rank,
        weekMap: {},
        totalSecs: 0,
      };
    }
    personMap[l.csNumber]!.weekMap[l.weekPeriod] = l.dutyHours ?? null;
    personMap[l.csNumber]!.totalSecs += parseHms(l.dutyHours);
    // Keep most recent status
    personMap[l.csNumber]!.status = l.status;
  }

  const breakdown = Object.values(personMap).map((p) => ({
    csNumber: p.csNumber,
    name: p.name,
    status: p.status,
    rank: p.rank,
    totalHours: secondsToHms(p.totalSecs),
    weeks: allWeekPeriods.map((wp) => ({
      weekPeriod: wp,
      dutyHours: p.weekMap[wp] ?? null,
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
