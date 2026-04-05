import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, discordDutyEventsTable, emsDutyLogsTable, officersTable } from "@workspace/db";

const router: IRouter = Router();

function secsToHms(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseHms(h: string | null | undefined): number {
  if (!h || h === "0") return 0;
  const p = h.split(":").map(Number);
  return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}

function getWeekPeriod(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  return `${fmt(mon)}-${fmt(sun)}`;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const now = new Date();
  const currentWeek = getWeekPeriod(now);

  const [officers, allEvents, allLogs] = await Promise.all([
    db.select().from(officersTable),
    db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt)),
    db.select().from(emsDutyLogsTable).where(eq(emsDutyLogsTable.shiftType, "ALL")),
  ]);

  // ── Live on duty ───────────────────────────────────────────────────────────
  const latestByLicense = new Map<string, typeof allEvents[0]>();
  for (const ev of allEvents) {
    if (!latestByLicense.has(ev.licenseId)) latestByLicense.set(ev.licenseId, ev);
  }
  const licenseToOfficer = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) licenseToOfficer.set(o.rockstarLicenseId, o);
  }
  const liveOnDuty = [...latestByLicense.values()]
    .filter((ev) => ev.eventType === "on")
    .map((ev) => {
      const o = licenseToOfficer.get(ev.licenseId);
      const elapsedSecs = Math.max(0, Math.floor((now.getTime() - ev.eventAt.getTime()) / 1000));
      return {
        licenseId: ev.licenseId,
        csNumber: o?.callSign ?? null,
        name: o?.name ?? ev.officerName,
        rank: o?.rank ?? ev.rank ?? "Unknown",
        onSince: ev.eventAt.toISOString(),
        elapsedHms: secsToHms(elapsedSecs),
      };
    })
    .sort((a, b) => a.onSince.localeCompare(b.onSince));

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalMembers = officers.length;
  const active = officers.filter((o) => o.status === "Active").length;
  const loa = officers.filter((o) => o.status === "LOA").length;
  const inactive = officers.filter((o) => o.status === "Inactive").length;

  const weekLogs = allLogs.filter((l) => l.weekPeriod === currentWeek);
  const thisWeekSecs = weekLogs.reduce((s, l) => s + parseHms(l.dutyHours), 0);

  const monthlySecs = allLogs.reduce((s, l) => s + parseHms(l.dutyHours), 0);

  // Peak week
  const weekSumMap: Record<string, number> = {};
  for (const l of allLogs) {
    weekSumMap[l.weekPeriod] = (weekSumMap[l.weekPeriod] ?? 0) + parseHms(l.dutyHours);
  }
  let peakWeek = currentWeek;
  let peakSecs = 0;
  for (const [wp, secs] of Object.entries(weekSumMap)) {
    if (secs > peakSecs) { peakSecs = secs; peakWeek = wp; }
  }

  // Top this week
  const weekPerOfficer: Record<string, number> = {};
  for (const l of weekLogs) weekPerOfficer[l.csNumber] = (weekPerOfficer[l.csNumber] ?? 0) + parseHms(l.dutyHours);
  const topCs = Object.entries(weekPerOfficer).sort((a, b) => b[1] - a[1])[0];
  const topOfficer = topCs
    ? { csNumber: topCs[0], name: officers.find((o) => o.callSign === topCs[0])?.name ?? topCs[0], hours: secsToHms(topCs[1]) }
    : null;

  // ── Rank distribution ──────────────────────────────────────────────────────
  const rankMap: Record<string, number> = {};
  for (const o of officers) {
    const r = o.rank || "Unknown";
    rankMap[r] = (rankMap[r] ?? 0) + 1;
  }
  const rankDistribution = Object.entries(rankMap)
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count);

  // ── Status overview ────────────────────────────────────────────────────────
  const statusGroups: Record<string, { count: number; weekSecs: number }> = {};
  for (const o of officers) {
    const s = o.status || "Unknown";
    if (!statusGroups[s]) statusGroups[s] = { count: 0, weekSecs: 0 };
    statusGroups[s]!.count++;
  }
  for (const l of weekLogs) {
    const o = officers.find((off) => off.callSign === l.csNumber);
    const s = o?.status ?? "Unknown";
    if (!statusGroups[s]) statusGroups[s] = { count: 0, weekSecs: 0 };
    statusGroups[s]!.weekSecs += parseHms(l.dutyHours);
  }
  const statusOverview = Object.entries(statusGroups).map(([status, { count, weekSecs }]) => ({
    status,
    count,
    weekHours: secsToHms(weekSecs),
  }));

  res.json({
    liveOnDuty,
    stats: {
      totalMembers,
      active,
      loa,
      inactive,
      thisWeekHours: secsToHms(thisWeekSecs),
      monthlyHours: secsToHms(monthlySecs),
      peakWeek: `${peakWeek.replace("-", " – ")} · ${secsToHms(peakSecs)}`,
      topOfficer,
      currentWeek,
    },
    rankDistribution,
    statusOverview,
  });
});

export default router;
