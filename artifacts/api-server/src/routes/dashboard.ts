import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, discordDutyEventsTable, emsDutyLogsTable, officersTable } from "@workspace/db";
import { getAllSettings } from "./settings";
import { findOfficerByDutyIdentity, getCurrentOpenDutySessions, normalizeLicenseId } from "../lib/duty-officer-match.js";
import { BOT_DUTY_HEARTBEAT_KEY, DUTY_SYNC_STALE_AFTER_MS } from "../lib/discord-bot.js";
import {
  getMysqlDutyEvents,
  getMysqlDutyLogs,
  getMysqlOfficers,
  isMysqlDatabaseUrl,
} from "../lib/pd-mysql-read.js";

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

function getPreviousWeekPeriod(date: Date): string {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return getWeekPeriod(prev);
}

function parseHeartbeat(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type OfficerRecord = {
  callSign: string;
  rockstarLicenseId?: string | null;
  fivemName?: string | null;
};

type DutyEventRecord = {
  licenseId: string;
  officerName: string;
};

type FivemDutyGate = {
  configured: boolean;
  online: boolean;
  onlineOfficerCallSigns: Set<string>;
};

function normalizePlayerName(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

async function getFivemDutyGate(
  serverUrl: unknown,
  officers: OfficerRecord[],
  dutyEvents: DutyEventRecord[],
): Promise<FivemDutyGate> {
  if (typeof serverUrl !== "string" || !serverUrl.trim()) {
    return { configured: false, online: false, onlineOfficerCallSigns: new Set() };
  }

  let fivemPlayers: unknown[] = [];
  let online = false;

  try {
    const base = serverUrl.trim().replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`${base}/players.json`, { signal: controller.signal }).finally(() =>
      clearTimeout(timeout),
    );

    if (resp.ok) {
      const body = await resp.json();
      fivemPlayers = Array.isArray(body) ? body : [];
      online = true;
    }
  } catch {
    online = false;
  }

  if (!online) {
    return { configured: true, online: false, onlineOfficerCallSigns: new Set() };
  }

  const licenseMap = new Map<string, OfficerRecord>();
  const fivemNameMap = new Map<string, OfficerRecord>();

  for (const officer of officers) {
    const license = normalizeLicenseId(officer.rockstarLicenseId);
    if (license) licenseMap.set(license, officer);

    const fivemName = normalizePlayerName(officer.fivemName);
    if (fivemName) fivemNameMap.set(fivemName, officer);
  }

  const dutyNameMap = new Map<string, OfficerRecord>();
  for (const event of dutyEvents) {
    const eventName = normalizePlayerName(event.officerName);
    if (!eventName || dutyNameMap.has(eventName)) continue;

    const officer = licenseMap.get(normalizeLicenseId(event.licenseId));
    if (officer) dutyNameMap.set(eventName, officer);
  }

  const onlineOfficerCallSigns = new Set<string>();
  for (const player of fivemPlayers) {
    const playerData = player as { identifiers?: unknown; name?: unknown };
    const identifiers = Array.isArray(playerData.identifiers) ? playerData.identifiers : [];
    const rawLicense =
      identifiers
        .find((id): id is string => typeof id === "string" && id.startsWith("license:"))
        ?.replace(/^license:/i, "")
        .toLowerCase() ?? "";
    const playerName = normalizePlayerName(playerData.name);

    const officer =
      licenseMap.get(rawLicense) ??
      fivemNameMap.get(playerName) ??
      dutyNameMap.get(playerName);

    if (officer?.callSign) onlineOfficerCallSigns.add(officer.callSign);
  }

  return { configured: true, online: true, onlineOfficerCallSigns };
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const now = new Date();
  const currentWeek = getWeekPeriod(now);
  const previousWeek = getPreviousWeekPeriod(now);
  const weekParam = req.query.week === "previous" ? "previous" : "current";
  const thresholdHours = Math.max(0.5, Math.min(24, Number(req.query.threshold) || 5));
  const thresholdSecs = thresholdHours * 3600;
  const selectedWeek = weekParam === "previous" ? previousWeek : currentWeek;

  const [officers, allEvents, allLogs, siteSettings] = await Promise.all([
    isMysqlDatabaseUrl ? getMysqlOfficers() : db.select().from(officersTable),
    isMysqlDatabaseUrl ? getMysqlDutyEvents() : db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt)),
    isMysqlDatabaseUrl ? getMysqlDutyLogs().then((rows) => rows.filter((row) => row.shiftType === "ALL")) : db.select().from(emsDutyLogsTable).where(eq(emsDutyLogsTable.shiftType, "ALL")),
    getAllSettings(),
  ]);

  // Build rank order map from DB settings (index = priority, lower = higher rank)
  const ranksFromSettings = (siteSettings.ranks as string[] | undefined) ?? [];
  const RANK_ORDER: Record<string, number> = {};
  ranksFromSettings.forEach((r, i) => { RANK_ORDER[r.toUpperCase()] = i + 1; });
  const lastDutySyncAt = parseHeartbeat(siteSettings[BOT_DUTY_HEARTBEAT_KEY]);
  const liveDutyFresh =
    !!lastDutySyncAt &&
    now.getTime() - lastDutySyncAt.getTime() <= DUTY_SYNC_STALE_AFTER_MS;

  // ── Live on duty ───────────────────────────────────────────────────────────
  const rawOpenSessions = liveDutyFresh
    ? getCurrentOpenDutySessions(allEvents, officers, now)
    : [];
  const fivemDutyGate = await getFivemDutyGate(siteSettings.fivem_server_url, officers, allEvents);
  const openSessions =
    fivemDutyGate.configured && fivemDutyGate.online
      ? rawOpenSessions.filter((session) =>
          fivemDutyGate.onlineOfficerCallSigns.has(session.officer.callSign),
        )
      : rawOpenSessions;
  const liveOpenDutySecsByCs = Object.fromEntries(
    openSessions.map((session) => [session.officer.callSign, session.elapsedSecs]),
  );

  const liveOnDuty = openSessions.map((session) => ({
    licenseId: session.event.licenseId,
    csNumber: session.officer.callSign ?? null,
    name: session.officer.name ?? session.event.officerName,
    rank: session.officer.rank ?? session.event.rank ?? "Unknown",
    onSince: session.event.eventAt.toISOString(),
    elapsedHms: secsToHms(session.elapsedSecs),
  }));

  // Rank priority: lower number = higher rank = appears first
  liveOnDuty.sort((a, b) => {
    const ra = RANK_ORDER[(a.rank ?? "").toUpperCase()] ?? 99;
    const rb = RANK_ORDER[(b.rank ?? "").toUpperCase()] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.onSince.localeCompare(b.onSince);
  });

  const recentDutyActivity = allEvents
    .slice(0, 20)
    .map((event) => {
      const officer = findOfficerByDutyIdentity(event.licenseId, event.officerName, officers);
      return {
        licenseId: event.licenseId,
        csNumber: officer?.callSign ?? null,
        name: officer?.name ?? event.officerName,
        rank: officer?.rank ?? event.rank ?? "Unknown",
        eventType: event.eventType,
        eventAt: event.eventAt.toISOString(),
      };
    });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalMembers = officers.length;
  const active = officers.filter((o) => o.status === "Active").length;
  const loa = officers.filter((o) => o.status === "LOA").length;
  const inactive = officers.filter((o) => o.status === "Inactive").length;

  const weekLogs = allLogs.filter((l) => l.weekPeriod === currentWeek);
  let thisWeekSecs = weekLogs.reduce((s, l) => s + parseHms(l.dutyHours), 0);
  const selectedWeekLogs = allLogs.filter((l) => l.weekPeriod === selectedWeek);
  let monthlySecs = allLogs.reduce((s, l) => s + parseHms(l.dutyHours), 0);

  // Peak week
  const weekSumMap: Record<string, number> = {};
  for (const l of allLogs) {
    weekSumMap[l.weekPeriod] = (weekSumMap[l.weekPeriod] ?? 0) + parseHms(l.dutyHours);
  }
  for (const secs of Object.values(liveOpenDutySecsByCs)) {
    weekSumMap[currentWeek] = (weekSumMap[currentWeek] ?? 0) + secs;
  }
  let peakWeek = currentWeek;
  let peakSecs = 0;
  for (const [wp, secs] of Object.entries(weekSumMap)) {
    if (secs > peakSecs) { peakSecs = secs; peakWeek = wp; }
  }

  // Top this week
  const weekPerOfficer: Record<string, number> = {};
  for (const l of weekLogs) weekPerOfficer[l.csNumber] = (weekPerOfficer[l.csNumber] ?? 0) + parseHms(l.dutyHours);
  for (const [callSign, liveSecs] of Object.entries(liveOpenDutySecsByCs)) {
    weekPerOfficer[callSign] = (weekPerOfficer[callSign] ?? 0) + liveSecs;
  }
  const topCs = Object.entries(weekPerOfficer).sort((a, b) => b[1] - a[1])[0];
  const topOfficer = topCs
    ? { csNumber: topCs[0], name: officers.find((o) => o.callSign === topCs[0])?.name ?? topCs[0], hours: secsToHms(topCs[1]) }
    : null;

  // Per-officer hours for the selected week (current or previous)
  const selectedWeekPerOfficer: Record<string, number> = {};
  for (const l of selectedWeekLogs) {
    selectedWeekPerOfficer[l.csNumber] = (selectedWeekPerOfficer[l.csNumber] ?? 0) + parseHms(l.dutyHours);
  }

  for (const [callSign, liveSecs] of Object.entries(liveOpenDutySecsByCs)) {
    thisWeekSecs += liveSecs;
    monthlySecs += liveSecs;
    if (selectedWeek === currentWeek) {
      selectedWeekPerOfficer[callSign] = (selectedWeekPerOfficer[callSign] ?? 0) + liveSecs;
    }
  }

  // All active officers with < threshold hours in selected week (excluding LOA), sorted lowest first
  const lowestWeekly = officers
    .filter((o) => o.status !== "LOA")
    .map((o) => ({
      csNumber: o.callSign ?? "",
      name: o.name ?? o.callSign ?? "",
      rank: o.rank ?? "",
      status: o.status ?? "",
      discordUsername: o.discordUsername ?? null,
      discordUid: o.discordUid ?? null,
      weekSecs: selectedWeekPerOfficer[o.callSign ?? ""] ?? 0,
    }))
    .filter((o) => o.weekSecs < thresholdSecs)
    .sort((a, b) => a.weekSecs - b.weekSecs)
    .map((o) => ({ ...o, weekHours: secsToHms(o.weekSecs) }));

  // ── Rank distribution ──────────────────────────────────────────────────────
  const rankMap: Record<string, number> = {};
  for (const o of officers) {
    const r = o.rank || "Unknown";
    rankMap[r] = (rankMap[r] ?? 0) + 1;
  }
  const rankDistribution = Object.entries(rankMap)
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => {
      const ra = RANK_ORDER[a.rank.toUpperCase()] ?? 99;
      const rb = RANK_ORDER[b.rank.toUpperCase()] ?? 99;
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });

  // ── Status overview (activity-based: Active / Semi-Active / Inactive / LOA) ─
  type WeekStatus = "active" | "semi" | "inactive";

  function getWeekStatus(secs: number): WeekStatus {
    if (secs >= 36000) return "active";  // ≥10h
    if (secs >= 18000) return "semi";    // ≥5h
    return "inactive";
  }

  function computeMonthlyStatus(statuses: WeekStatus[]): "Active" | "Semi-Active" | "Inactive" {
    if (statuses.length === 0) return "Inactive";
    const active   = statuses.filter((s) => s === "active").length;
    const semi     = statuses.filter((s) => s === "semi").length;
    const inactive = statuses.filter((s) => s === "inactive").length;
    if (semi >= 3) return "Inactive";
    if (semi === 2) return "Semi-Active";
    if (active > semi + inactive) return "Active";
    if (inactive > active) return "Inactive";
    if (semi > active) return "Semi-Active";
    return "Active";
  }

  // Determine weeks that belong to the current calendar month (by week-end date)
  const currentMonthNum = now.getUTCMonth() + 1;
  const allWeekPeriods = [...new Set(allLogs.map((l) => l.weekPeriod))];
  const currentMonthWeeks = allWeekPeriods.filter((wp) => {
    const endPart = wp.split("-")[1] ?? wp;
    const mNum = parseInt((endPart ?? "").split("/")[0] ?? "0");
    return mNum === currentMonthNum;
  });

  // Index logs by [csNumber][weekPeriod] → seconds
  const logsByCsWeek: Record<string, Record<string, number>> = {};
  for (const l of allLogs) {
    if (!logsByCsWeek[l.csNumber]) logsByCsWeek[l.csNumber] = {};
    logsByCsWeek[l.csNumber]![l.weekPeriod] =
      (logsByCsWeek[l.csNumber]![l.weekPeriod] ?? 0) + parseHms(l.dutyHours);
  }
  for (const [callSign, liveSecs] of Object.entries(liveOpenDutySecsByCs)) {
    if (!logsByCsWeek[callSign]) logsByCsWeek[callSign] = {};
    logsByCsWeek[callSign]![currentWeek] =
      (logsByCsWeek[callSign]![currentWeek] ?? 0) + liveSecs;
  }

  const ORDER = ["Active", "Semi-Active", "Inactive", "LOA"] as const;
  type ActivityGroup = { count: number; weekSecs: number; officers: { csNumber: string; name: string; rank: string }[] };
  const activityGroups: Record<string, ActivityGroup> = {
    "Active":      { count: 0, weekSecs: 0, officers: [] },
    "Semi-Active": { count: 0, weekSecs: 0, officers: [] },
    "Inactive":    { count: 0, weekSecs: 0, officers: [] },
    "LOA":         { count: 0, weekSecs: 0, officers: [] },
  };

  for (const o of officers) {
    const cs = o.callSign ?? "";
    const thisWeekSecs2 = (logsByCsWeek[cs] ?? {})[currentWeek] ?? 0;
    const entry = { csNumber: cs, name: o.name ?? cs, rank: o.rank ?? "" };

    if (o.status === "LOA") {
      activityGroups["LOA"]!.count++;
      activityGroups["LOA"]!.weekSecs += thisWeekSecs2;
      activityGroups["LOA"]!.officers.push(entry);
      continue;
    }

    const weekStatuses: WeekStatus[] = currentMonthWeeks.map((wp) =>
      getWeekStatus((logsByCsWeek[cs] ?? {})[wp] ?? 0)
    );
    const actStatus = computeMonthlyStatus(weekStatuses);
    activityGroups[actStatus]!.count++;
    activityGroups[actStatus]!.weekSecs += thisWeekSecs2;
    activityGroups[actStatus]!.officers.push(entry);
  }

  // Sort each group's officers by rank then call sign
  for (const grp of Object.values(activityGroups)) {
    grp.officers.sort((a, b) => {
      const ra = RANK_ORDER[a.rank.toUpperCase()] ?? 99;
      const rb = RANK_ORDER[b.rank.toUpperCase()] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.csNumber.localeCompare(b.csNumber);
    });
  }

  const statusOverview = ORDER.map((status) => ({
    status,
    count: activityGroups[status]!.count,
    weekHours: secsToHms(activityGroups[status]!.weekSecs),
    officers: activityGroups[status]!.officers,
  }));

  res.json({
    liveOnDuty,
    recentDutyActivity,
    liveDutyFresh,
    liveDutyGate: {
      fivemConfigured: fivemDutyGate.configured,
      fivemOnline: fivemDutyGate.online,
      onlinePdOfficers: fivemDutyGate.onlineOfficerCallSigns.size,
    },
    lastDutySyncAt: lastDutySyncAt?.toISOString() ?? null,
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
      previousWeek,
      selectedWeek,
    },
    rankDistribution,
    statusOverview,
    lowestWeekly,
  });
});

export default router;
