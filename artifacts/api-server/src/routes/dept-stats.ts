import { Router, type IRouter } from "express";
import { db, pdCitationsTable, pdFirTable, emsDutyLogsTable, officersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function parseHms(h: string | null | undefined): number {
  if (!h || h === "0" || h.trim() === "") return 0;
  const parts = h.trim().split(":").map(Number);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60;
  return 0;
}

function secsToHms(secs: number): string {
  if (secs === 0) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Extract base name from "Name [XX]" citation format
function extractName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s*\[.*?\]\s*$/, "").trim().toLowerCase();
}

// GET /api/dept-stats?month=2026-04
router.get("/dept-stats", async (req, res): Promise<void> => {
  const month = (req.query.month as string) || getCurrentMonth();
  const [yearStr, mmStr] = month.split("-");
  const year = yearStr ?? String(new Date().getUTCFullYear());
  const mm = mmStr ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");

  const DEPTS = ["BCSO", "SASP", "SAHP", "PTA"];

  // ── Officers lookup ───────────────────────────────────────────────────────
  const officers = await db.select({
    callSign: officersTable.callSign,
    name: officersTable.name,
    department: officersTable.department,
    status: officersTable.status,
  }).from(officersTable);

  const csToDept: Record<string, string> = {};
  const nameToDept: Record<string, string> = {};
  const deptOfficerCount: Record<string, number> = {};
  const deptActiveCount: Record<string, number> = {};

  for (const o of officers) {
    const dept = o.department;
    if (!dept || !DEPTS.includes(dept)) continue;
    deptOfficerCount[dept] = (deptOfficerCount[dept] ?? 0) + 1;
    if (o.status === "Active") deptActiveCount[dept] = (deptActiveCount[dept] ?? 0) + 1;
    if (o.callSign) csToDept[o.callSign] = dept;
    if (o.name) nameToDept[o.name.toLowerCase()] = dept;
  }

  // ── Citations ─────────────────────────────────────────────────────────────
  const citationRows = await db.select({
    officerName: pdCitationsTable.officerName,
    cnt: sql<number>`cast(count(*) as int)`,
  }).from(pdCitationsTable)
    .where(sql`to_char(${pdCitationsTable.postedAt}, 'YYYY-MM') = ${month}`)
    .groupBy(pdCitationsTable.officerName);

  const deptCitations: Record<string, number> = {};
  const deptCitationTopOfficers: Record<string, { name: string; count: number }[]> = {};

  for (const c of citationRows) {
    const key = extractName(c.officerName);
    const dept = nameToDept[key];
    if (!dept) continue;
    deptCitations[dept] = (deptCitations[dept] ?? 0) + c.cnt;
    if (!deptCitationTopOfficers[dept]) deptCitationTopOfficers[dept] = [];
    const displayName = c.officerName?.replace(/\s*\[.*?\]\s*$/, "").trim() ?? "";
    deptCitationTopOfficers[dept].push({ name: displayName, count: c.cnt });
  }
  // Sort top officers per dept
  for (const dept of DEPTS) {
    deptCitationTopOfficers[dept] = (deptCitationTopOfficers[dept] ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // ── FIR ───────────────────────────────────────────────────────────────────
  const firRows = await db.select({
    officerName: pdFirTable.officerName,
    cnt: sql<number>`cast(count(*) as int)`,
  }).from(pdFirTable)
    .where(sql`to_char(${pdFirTable.postedAt}, 'YYYY-MM') = ${month}`)
    .groupBy(pdFirTable.officerName);

  const deptFir: Record<string, number> = {};
  const deptFirTopOfficers: Record<string, { name: string; count: number }[]> = {};

  for (const f of firRows) {
    const key = extractName(f.officerName);
    const dept = nameToDept[key];
    if (!dept) continue;
    deptFir[dept] = (deptFir[dept] ?? 0) + f.cnt;
    if (!deptFirTopOfficers[dept]) deptFirTopOfficers[dept] = [];
    deptFirTopOfficers[dept].push({ name: f.officerName?.trim() ?? "", count: f.cnt });
  }
  for (const dept of DEPTS) {
    deptFirTopOfficers[dept] = (deptFirTopOfficers[dept] ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // ── Duty Hours ────────────────────────────────────────────────────────────
  // Filter by duty_year and start-month of week_period (LEFT 2 chars = MM)
  const dutyRows = await db.select({
    csNumber: emsDutyLogsTable.csNumber,
    weekPeriod: emsDutyLogsTable.weekPeriod,
    dutyHours: emsDutyLogsTable.dutyHours,
  }).from(emsDutyLogsTable)
    .where(and(
      eq(emsDutyLogsTable.shiftType, "ALL"),
      sql`left(${emsDutyLogsTable.weekPeriod}, 2) = ${mm}`,
      sql`coalesce(${emsDutyLogsTable.dutyYear}, ${year}) = ${year}`,
    ));

  const deptDutySecsByWeek: Record<string, Record<string, number>> = {};
  const allWeekPeriods = new Set<string>();

  for (const d of dutyRows) {
    const dept = csToDept[d.csNumber];
    if (!dept || !DEPTS.includes(dept)) continue;
    if (!deptDutySecsByWeek[dept]) deptDutySecsByWeek[dept] = {};
    deptDutySecsByWeek[dept][d.weekPeriod] =
      (deptDutySecsByWeek[dept][d.weekPeriod] ?? 0) + parseHms(d.dutyHours);
    allWeekPeriods.add(d.weekPeriod);
  }

  const sortedWeeks = [...allWeekPeriods].sort();

  // Build result per department
  const deptData: Record<string, {
    officerCount: number;
    activeCount: number;
    citations: number;
    fir: number;
    totalDutyHours: string;
    totalDutySecs: number;
    weeklyHours: { weekPeriod: string; hours: string; secs: number }[];
    citationTopOfficers: { name: string; count: number }[];
    firTopOfficers: { name: string; count: number }[];
  }> = {};

  for (const dept of DEPTS) {
    const weeklyHours = sortedWeeks.map((wp) => {
      const secs = deptDutySecsByWeek[dept]?.[wp] ?? 0;
      return { weekPeriod: wp, hours: secsToHms(secs), secs };
    });
    const totalDutySecs = weeklyHours.reduce((a, b) => a + b.secs, 0);
    deptData[dept] = {
      officerCount: deptOfficerCount[dept] ?? 0,
      activeCount: deptActiveCount[dept] ?? 0,
      citations: deptCitations[dept] ?? 0,
      fir: deptFir[dept] ?? 0,
      totalDutyHours: secsToHms(totalDutySecs),
      totalDutySecs,
      weeklyHours,
      citationTopOfficers: deptCitationTopOfficers[dept] ?? [],
      firTopOfficers: deptFirTopOfficers[dept] ?? [],
    };
  }

  // ── Available months (from ems_duty_logs) ─────────────────────────────────
  const monthRows = await db.selectDistinct({
    dutyYear: emsDutyLogsTable.dutyYear,
    wp: emsDutyLogsTable.weekPeriod,
  }).from(emsDutyLogsTable)
    .where(eq(emsDutyLogsTable.shiftType, "ALL"));

  const monthSet = new Set<string>();
  for (const r of monthRows) {
    const m = (r.wp ?? "").substring(0, 2);
    const y = r.dutyYear ?? String(new Date().getUTCFullYear());
    if (m && y) monthSet.add(`${y}-${m}`);
  }
  const availableMonths = [...monthSet].sort().reverse().slice(0, 6);

  res.json({
    month,
    departments: DEPTS,
    weekPeriods: sortedWeeks,
    availableMonths,
    data: deptData,
  });
});

export default router;
