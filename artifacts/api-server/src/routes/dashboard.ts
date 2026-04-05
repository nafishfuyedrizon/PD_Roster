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
    if (o.rockstarLicenseId) {
      // Strip optional "license:" prefix so raw hashes from Discord events match
      const rawId = o.rockstarLicenseId.replace(/^license:/, "");
      licenseToOfficer.set(rawId, o);
    }
  }

  // Multi-strategy fuzzy matching for officers without a stored license ID
  function norm(s: string) { return s.toLowerCase().replace(/[-_.\s]/g, ""); }
  function tokens(s: string) { return s.toLowerCase().split(/[\s\-_]+/).filter(Boolean); }

  // Leet-speak normalisation: 4→a, 3→e, 0→o, 1→i, 5→s, 7→t
  function leetNorm(s: string) {
    return norm(s).replace(/4/g, "a").replace(/3/g, "e").replace(/0/g, "o").replace(/1/g, "i").replace(/5/g, "s").replace(/7/g, "t");
  }

  function findOfficerByName(evName: string, excludeIds: Set<number>): typeof officers[0] | null {
    const evNorm = norm(evName);
    const evLeet = leetNorm(evName);
    const evTokens = tokens(evName);
    const evLeetTokens = evLeet.split(/[^a-z]+/).filter(Boolean);

    const pool = officers.filter((o) => !excludeIds.has(o.id));
    const candidates: typeof officers[0][] = [];

    for (const o of pool) {
      const rosterNorm = norm(o.name ?? "");
      const discordNorm = norm(o.discordUsername ?? "");
      const discordLeet = leetNorm(o.discordUsername ?? "");
      const rosterTokens = tokens(o.name ?? "");

      // Exact full name
      if (rosterNorm === evNorm) return o;

      // Leet-normalised event name found in discord username (or vice-versa)
      if (evLeet.length >= 3 && (discordNorm.includes(evLeet) || discordLeet.includes(evLeet) || evLeet.includes(discordNorm))) {
        candidates.push(o);
        continue;
      }

      // Event name substring in discord_username or vice-versa
      if (evNorm.length >= 3 && (discordNorm.includes(evNorm) || evNorm.includes(discordNorm))) {
        candidates.push(o);
        continue;
      }

      // Any event token (or leet variant, len≥3) appears in discord_username OR matches roster first-name token
      const matched = [...evTokens, ...evLeetTokens].some((t) => {
        if (t.length < 3) return false;
        return discordNorm.includes(t) || discordLeet.includes(t) || rosterTokens[0] === t;
      });
      if (matched) { candidates.push(o); continue; }
    }

    if (candidates.length === 1) return candidates[0]!;
    return null;
  }

  // Build live-on-duty list in two passes so rank-unique fallback can use
  // already-claimed officers to avoid double-assignments
  const onDutyEvents = [...latestByLicense.values()].filter((ev) => ev.eventType === "on");

  // Pass 1: license ID + fuzzy name matching
  const claimedOfficerIds = new Set<number>();
  const pass1 = onDutyEvents.map((ev) => {
    const byLicense = licenseToOfficer.get(ev.licenseId);
    if (byLicense) { claimedOfficerIds.add(byLicense.id); return { ev, o: byLicense }; }
    const byName = findOfficerByName(ev.officerName, claimedOfficerIds);
    if (byName) { claimedOfficerIds.add(byName.id); return { ev, o: byName }; }
    return { ev, o: null };
  });

  // Pass 2: rank-unique fallback for still-unmatched events
  const liveOnDuty = pass1.map(({ ev, o: matched }) => {
    let o = matched;
    if (!o) {
      // Normalise the event rank and find all unclaimed officers with that exact rank
      const evRankNorm = (ev.rank ?? "").toLowerCase().trim();
      const rankPool = officers.filter(
        (r) => !claimedOfficerIds.has(r.id) && r.rank?.toLowerCase().trim() === evRankNorm
      );
      if (rankPool.length === 1) {
        o = rankPool[0]!;
        claimedOfficerIds.add(o.id);
      }
    }
    const elapsedSecs = Math.max(0, Math.floor((now.getTime() - ev.eventAt.getTime()) / 1000));
    return {
      licenseId: ev.licenseId,
      csNumber: o?.callSign ?? null,
      name: o?.name ?? ev.officerName,
      rank: o?.rank ?? ev.rank ?? "Unknown",
      onSince: ev.eventAt.toISOString(),
      elapsedHms: secsToHms(elapsedSecs),
    };
  });

  // Rank priority: lower number = higher rank = appears first
  const RANK_ORDER: Record<string, number> = {
    "CHIEF": 1,
    "ASSISTANT CHIEF": 2,
    "UNDERSHERIFF": 3,
    "CAPTAIN": 4,
    "LIEUTENANT": 5,
    "SERGEANT FIRST CLASS": 6,
    "SENIOR STATE TROOPER": 7,
    "STATE TROOPER FIRST CLASS": 8,
    "TROOPER FIRST CLASS": 9,
    "CORPORAL": 10,
    "DEPUTY FIRST CLASS": 11,
    "SENIOR DEPUTY": 12,
    "SENIOR TROOPER": 13,
    "STATE TROOPER": 14,
    "DEPUTY": 15,
    "CADET": 16,
  };

  liveOnDuty.sort((a, b) => {
    const ra = RANK_ORDER[(a.rank ?? "").toUpperCase()] ?? 99;
    const rb = RANK_ORDER[(b.rank ?? "").toUpperCase()] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.onSince.localeCompare(b.onSince);
  });

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
