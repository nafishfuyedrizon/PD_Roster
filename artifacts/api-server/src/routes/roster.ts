import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, officersTable, emsDutyLogsTable } from "@workspace/db";
import {
  ListOfficersQueryParams,
  ListOfficersResponse,
  CreateOfficerBody,
  GetRosterStatsQueryParams,
  GetRosterStatsResponse,
  GetFtoPairsQueryParams,
  GetFtoPairsResponse,
  ListWeekPeriodsResponse,
  GetOfficerParams,
  GetOfficerResponse,
  UpdateOfficerParams,
  UpdateOfficerBody,
  UpdateOfficerResponse,
  DeleteOfficerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/roster", async (req, res): Promise<void> => {
  const parsed = ListOfficersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { department, status, weekPeriod } = parsed.data;

  const conditions = [];
  if (department) conditions.push(eq(officersTable.department, department));
  if (status) conditions.push(eq(officersTable.status, status));
  if (weekPeriod) conditions.push(eq(officersTable.weekPeriod, weekPeriod));

  const officers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(officersTable.rank, officersTable.callSign);

  res.json(ListOfficersResponse.parse(officers));
});

router.post("/roster", async (req, res): Promise<void> => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [officer] = await db
    .insert(officersTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(GetOfficerResponse.parse(officer));
});

router.get("/roster/stats", async (req, res): Promise<void> => {
  const parsed = GetRosterStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod, month } = parsed.data;

  function parseDutyMinutes(dutyHours: string | null): number {
    if (!dutyHours || dutyHours.trim() === "0" || dutyHours.trim() === "") return 0;
    const hMatch = dutyHours.match(/(\d+)h/);
    const mMatch = dutyHours.match(/(\d+)m/);
    const hours = hMatch ? parseInt(hMatch[1]) : 0;
    const mins = mMatch ? parseInt(mMatch[1]) : 0;
    return hours * 60 + mins;
  }

  // Build base conditions
  const conditions = weekPeriod
    ? [eq(officersTable.weekPeriod, weekPeriod)]
    : month
      ? [sql`SUBSTRING(${officersTable.weekPeriod}, 7, 2) = ${month}`]
      : [];

  const rawOfficers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // For monthly mode: aggregate multiple weekly snapshots per officer into one merged row
  // (sum duty hours across all weeks, use latest week's status/rank/dept for breakdowns)
  type OfficerRow = typeof rawOfficers[0];
  let officers: OfficerRow[];
  if (month) {
    const byCallSign = new Map<string, OfficerRow[]>();
    for (const o of rawOfficers) {
      const key = o.callSign ?? `id-${o.id}`;
      if (!byCallSign.has(key)) byCallSign.set(key, []);
      byCallSign.get(key)!.push(o);
    }
    officers = Array.from(byCallSign.values()).map((rows) => {
      // Sort desc by weekPeriod so rows[0] is the latest snapshot
      rows.sort((a, b) => (b.weekPeriod ?? "").localeCompare(a.weekPeriod ?? ""));
      const latest = rows[0];
      const totalMins = rows.reduce((sum, r) => sum + parseDutyMinutes(r.dutyHours), 0);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return {
        ...latest,
        dutyHours: totalMins > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : latest.dutyHours,
      };
    });
  } else {
    officers = rawOfficers;
  }

  const totalOfficers = officers.length;
  const activeOfficers = officers.filter((o) => o.status === "Active").length;
  const loaOfficers = officers.filter((o) => o.status === "LOA").length;

  const deptMap: Record<string, number> = {};
  const rankMap: Record<string, number> = {};
  for (const o of officers) {
    deptMap[o.department] = (deptMap[o.department] ?? 0) + 1;
    rankMap[o.rank] = (rankMap[o.rank] ?? 0) + 1;
  }

  const departmentBreakdown = Object.entries(deptMap).map(([department, count]) => ({ department, count }));
  const rankBreakdown = Object.entries(rankMap).map(([rank, count]) => ({ rank, count }));

  const topDutyHours = [...officers]
    .sort((a, b) => parseDutyMinutes(b.dutyHours) - parseDutyMinutes(a.dutyHours))
    .slice(0, 10);

  const effectiveWeekPeriod = weekPeriod ?? (rawOfficers[0]?.weekPeriod ?? "");

  const stats = {
    totalOfficers,
    activeOfficers,
    loaOfficers,
    departmentBreakdown,
    rankBreakdown,
    topDutyHours,
    weekPeriod: effectiveWeekPeriod,
  };

  res.json(GetRosterStatsResponse.parse(stats));
});

router.get("/roster/fto-pairs", async (req, res): Promise<void> => {
  const parsed = GetFtoPairsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekPeriod } = parsed.data;
  const conditions = weekPeriod ? [eq(officersTable.weekPeriod, weekPeriod)] : [];

  const officers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(officersTable.appointedFto, officersTable.callSign);

  const ftoMap: Record<string, typeof officers> = {};
  for (const o of officers) {
    if (o.appointedFto) {
      if (!ftoMap[o.appointedFto]) ftoMap[o.appointedFto] = [];
      ftoMap[o.appointedFto].push(o);
    }
  }

  const pairs = Object.entries(ftoMap).map(([ftoName, trainees]) => ({
    ftoName,
    trainees,
  }));

  res.json(GetFtoPairsResponse.parse(pairs));
});

router.get("/roster/week-periods", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ weekPeriod: officersTable.weekPeriod })
    .from(officersTable)
    .orderBy(desc(officersTable.weekPeriod));

  const periods = rows.map((r) => r.weekPeriod).filter((p) => p && p.trim() !== "");
  res.json(ListWeekPeriodsResponse.parse(periods));
});

router.get("/roster/:id", async (req, res): Promise<void> => {
  const params = GetOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [officer] = await db
    .select()
    .from(officersTable)
    .where(eq(officersTable.id, params.data.id));

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  res.json(GetOfficerResponse.parse(officer));
});

router.put("/roster/:id", async (req, res): Promise<void> => {
  const params = UpdateOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch current record so we know the old callSign before any update
  const [existing] = await db.select().from(officersTable).where(eq(officersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [officer] = await db
    .update(officersTable)
    .set(parsed.data)
    .where(eq(officersTable.id, params.data.id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  // Cascade name/rank/status changes to ems_duty_logs.
  // If call sign changed, also move the stored csNumber to keep rows linked.
  const oldCs = existing.callSign ?? "";
  const newCs = officer.callSign ?? oldCs;
  if (oldCs) {
    await db.update(emsDutyLogsTable).set({
      ...(newCs !== oldCs ? { csNumber: newCs } : {}),
      name: officer.name ?? "",
      rank: officer.rank ?? "",
      status: officer.status ?? "Active",
    }).where(eq(emsDutyLogsTable.csNumber, oldCs));
  }

  res.json(UpdateOfficerResponse.parse(officer));
});

router.delete("/roster/:id", async (req, res): Promise<void> => {
  const params = DeleteOfficerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [officer] = await db
    .delete(officersTable)
    .where(eq(officersTable.id, params.data.id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
