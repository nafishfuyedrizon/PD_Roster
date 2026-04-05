import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, officersTable } from "@workspace/db";
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

  const { weekPeriod } = parsed.data;

  const conditions = weekPeriod ? [eq(officersTable.weekPeriod, weekPeriod)] : [];

  const officers = await db
    .select()
    .from(officersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

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

  function parseDutyMinutes(dutyHours: string | null): number {
    if (!dutyHours || dutyHours.trim() === "0" || dutyHours.trim() === "") return 0;
    const hMatch = dutyHours.match(/(\d+)h/);
    const mMatch = dutyHours.match(/(\d+)m/);
    const hours = hMatch ? parseInt(hMatch[1]) : 0;
    const mins = mMatch ? parseInt(mMatch[1]) : 0;
    return hours * 60 + mins;
  }

  const topDutyHours = [...officers]
    .sort((a, b) => parseDutyMinutes(b.dutyHours) - parseDutyMinutes(a.dutyHours))
    .slice(0, 10);

  const effectiveWeekPeriod = weekPeriod ?? (officers[0]?.weekPeriod ?? "");

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

  const [officer] = await db
    .update(officersTable)
    .set(parsed.data)
    .where(eq(officersTable.id, params.data.id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
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
