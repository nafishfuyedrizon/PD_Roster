import { Router, type IRouter } from "express";
import { db, pdCitationsTable, pdFirTable, emsDutyLogsTable, officersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  getMysqlDutyLogs,
  getMysqlOfficers,
  isMysqlDatabaseUrl,
  mysqlQuery,
} from "../lib/pd-mysql-read.js";

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

// Word-level edit distance (handles "Rahaman" vs "Rahman")
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  return dp[m]![n]!;
}

// Returns true if all words in `query` fuzzy-match corresponding words in `officer` (threshold 1 per word)
function fuzzyNameMatch(query: string, officer: string): boolean {
  const qa = query.split(/\s+/);
  const oa = officer.split(/\s+/);
  if (qa.length !== oa.length) return false;
  return qa.every((qw, i) => editDistance(qw, oa[i]!) <= 1);
}

// Build a reverse-lookup: given extracted citation name → officer dept using fuzzy match
function buildFuzzyLookup(nameToDept: Record<string, string>): (name: string) => string | undefined {
  const officerKeys = Object.keys(nameToDept);
  return (name: string) => {
    // 1. Exact match
    if (nameToDept[name]) return nameToDept[name];
    // 2. Fuzzy match (word-level edit distance ≤ 1)
    const match = officerKeys.find((k) => fuzzyNameMatch(name, k));
    return match ? nameToDept[match] : undefined;
  };
}

// GET /api/dept-stats?month=2026-04
router.get("/dept-stats", async (req, res): Promise<void> => {
  const month = (req.query.month as string) || getCurrentMonth();
  const [yearStr, mmStr] = month.split("-");
  const year = yearStr ?? String(new Date().getUTCFullYear());
  const mm = mmStr ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");

  const DEPTS = ["BCSO", "SASP", "SAHP", "PTA"];

  if (isMysqlDatabaseUrl) {
    const officers = await getMysqlOfficers();

    const csToDept: Record<string, string> = {};
    const nameToDept: Record<string, string> = {};
    const deptOfficerCount: Record<string, number> = {};
    const deptActiveCount: Record<string, number> = {};

    for (const officer of officers) {
      const dept = officer.department;
      if (!dept || !DEPTS.includes(dept)) continue;
      deptOfficerCount[dept] = (deptOfficerCount[dept] ?? 0) + 1;
      if (officer.status === "Active") deptActiveCount[dept] = (deptActiveCount[dept] ?? 0) + 1;
      if (officer.callSign) csToDept[officer.callSign] = dept;
      if (officer.name) nameToDept[officer.name.toLowerCase()] = dept;
    }

    const lookupDeptByName = buildFuzzyLookup(nameToDept);

    const citationRows = await mysqlQuery<{ officer_name: string | null; cnt: number | string }>(
      `SELECT officer_name, COUNT(*) AS cnt
       FROM pd_citations
       WHERE DATE_FORMAT(posted_at, '%Y-%m') = ?
       GROUP BY officer_name`,
      [month],
    );

    const deptCitations: Record<string, number> = {};
    const deptCitationTopOfficers: Record<string, { name: string; count: number }[]> = {};

    for (const citation of citationRows) {
      const key = extractName(citation.officer_name);
      const dept = lookupDeptByName(key);
      if (!dept) continue;
      const count = Number(citation.cnt ?? 0);
      deptCitations[dept] = (deptCitations[dept] ?? 0) + count;
      if (!deptCitationTopOfficers[dept]) deptCitationTopOfficers[dept] = [];
      const displayName = citation.officer_name?.replace(/\s*\[.*?\]\s*$/, "").trim() ?? "";
      deptCitationTopOfficers[dept].push({ name: displayName, count });
    }

    const firRows = await mysqlQuery<{ officer_name: string | null; cnt: number | string }>(
      `SELECT officer_name, COUNT(*) AS cnt
       FROM pd_fir
       WHERE DATE_FORMAT(posted_at, '%Y-%m') = ?
       GROUP BY officer_name`,
      [month],
    );

    const deptFir: Record<string, number> = {};
    const deptFirTopOfficers: Record<string, { name: string; count: number }[]> = {};

    for (const fir of firRows) {
      const key = extractName(fir.officer_name);
      const dept = lookupDeptByName(key);
      if (!dept) continue;
      const count = Number(fir.cnt ?? 0);
      deptFir[dept] = (deptFir[dept] ?? 0) + count;
      if (!deptFirTopOfficers[dept]) deptFirTopOfficers[dept] = [];
      deptFirTopOfficers[dept].push({ name: fir.officer_name?.trim() ?? "", count });
    }

    const allDutyRows = await getMysqlDutyLogs();
    const dutyRows = allDutyRows.filter((row) =>
      row.weekPeriod?.slice(0, 2) === mm &&
      String(row.dutyYear ?? year) === year,
    );

    const deptDutySecsByWeek: Record<string, Record<string, number>> = {};
    const allWeekPeriods = new Set<string>();
    const weeklyOfficerBuckets = new Map<string, { dept: string; weekPeriod: string; hasAll: boolean; secs: number }>();

    for (const row of dutyRows) {
      const dept = csToDept[row.csNumber];
      if (!dept || !DEPTS.includes(dept) || !row.weekPeriod) continue;
      const bucketKey = `${dept}::${row.weekPeriod}::${row.csNumber}`;
      const rowSecs = parseHms(row.dutyHours);
      const existing = weeklyOfficerBuckets.get(bucketKey);
      if (row.shiftType === "ALL") {
        weeklyOfficerBuckets.set(bucketKey, {
          dept,
          weekPeriod: row.weekPeriod,
          hasAll: true,
          secs: rowSecs,
        });
        continue;
      }
      if (existing?.hasAll) continue;
      weeklyOfficerBuckets.set(bucketKey, {
        dept,
        weekPeriod: row.weekPeriod,
        hasAll: false,
        secs: (existing?.secs ?? 0) + rowSecs,
      });
    }

    for (const bucket of weeklyOfficerBuckets.values()) {
      if (!deptDutySecsByWeek[bucket.dept]) deptDutySecsByWeek[bucket.dept] = {};
      deptDutySecsByWeek[bucket.dept][bucket.weekPeriod] =
        (deptDutySecsByWeek[bucket.dept][bucket.weekPeriod] ?? 0) + bucket.secs;
      allWeekPeriods.add(bucket.weekPeriod);
    }

    const sortedWeeks = [...allWeekPeriods].sort();
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
      const weeklyHours = sortedWeeks.map((weekPeriod) => {
        const secs = deptDutySecsByWeek[dept]?.[weekPeriod] ?? 0;
        return { weekPeriod, hours: secsToHms(secs), secs };
      });
      const totalDutySecs = weeklyHours.reduce((sum, item) => sum + item.secs, 0);
      deptData[dept] = {
        officerCount: deptOfficerCount[dept] ?? 0,
        activeCount: deptActiveCount[dept] ?? 0,
        citations: deptCitations[dept] ?? 0,
        fir: deptFir[dept] ?? 0,
        totalDutyHours: secsToHms(totalDutySecs),
        totalDutySecs,
        weeklyHours,
        citationTopOfficers: (deptCitationTopOfficers[dept] ?? []).sort((a, b) => b.count - a.count).slice(0, 5),
        firTopOfficers: (deptFirTopOfficers[dept] ?? []).sort((a, b) => b.count - a.count).slice(0, 5),
      };
    }

    const monthSet = new Set<string>();
    for (const row of allDutyRows) {
      const monthPrefix = (row.weekPeriod ?? "").slice(0, 2);
      const dutyYear = row.dutyYear ?? String(new Date().getUTCFullYear());
      if (monthPrefix && dutyYear) monthSet.add(`${dutyYear}-${monthPrefix}`);
    }
    for (const row of firRows) {
      if (month) monthSet.add(month);
      if (row.cnt) break;
    }
    for (const row of citationRows) {
      if (month) monthSet.add(month);
      if (row.cnt) break;
    }

    res.json({
      month,
      departments: DEPTS,
      weekPeriods: sortedWeeks,
      availableMonths: [...monthSet].sort().reverse().slice(0, 6),
      data: deptData,
    });
    return;
  }

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

  // Fuzzy lookup — handles single-letter typos/spelling variants like "Rahaman" vs "Rahman"
  const lookupDeptByName = buildFuzzyLookup(nameToDept);

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
    const dept = lookupDeptByName(key);
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
    const dept = lookupDeptByName(key);
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
