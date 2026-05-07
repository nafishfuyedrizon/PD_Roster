type OfficerLike = {
  id: number;
  callSign: string;
  name: string | null;
  rank: string;
  status: string;
  discordUsername?: string | null;
  rockstarLicenseId?: string | null;
};

type DutyEventLike = {
  licenseId: string;
  officerName: string;
  rank?: string | null;
  eventType: string;
  eventAt: Date;
};

export type OpenDutySession = {
  officer: OfficerLike;
  event: DutyEventLike;
  elapsedSecs: number;
  overlapStart: Date;
};

const DEFAULT_MAX_OPEN_DUTY_HOURS = Math.max(
  1,
  Number.parseInt(process.env.PD_MAX_OPEN_DUTY_HOURS ?? "18", 10) || 18,
);

export function normalizeLicenseId(value: string | null | undefined): string {
  return (value ?? "").replace(/^license:/i, "").trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[-_.\s]/g, "");
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[\s\-_]+/).filter(Boolean);
}

function normalizeLeet(value: string): string {
  return normalizeText(value)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

export function getCurrentWeekPeriod(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  return `${fmt(mon)}-${fmt(sun)}`;
}

function getCurrentWeekStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

export function findOfficerByDutyIdentity(
  licenseId: string,
  officerName: string,
  officers: OfficerLike[],
  excludeIds = new Set<number>(),
): OfficerLike | null {
  const rawLicenseId = normalizeLicenseId(licenseId);
  if (rawLicenseId) {
    const byLicense = officers.find((officer) => {
      if (excludeIds.has(officer.id)) return false;
      return normalizeLicenseId(officer.rockstarLicenseId) === rawLicenseId;
    });
    if (byLicense) return byLicense;
  }

  const eventNorm = normalizeText(officerName);
  const eventLeet = normalizeLeet(officerName);
  const eventTokens = tokenize(officerName);
  const eventLeetTokens = eventLeet.split(/[^a-z]+/).filter(Boolean);
  const candidates: OfficerLike[] = [];

  for (const officer of officers) {
    if (excludeIds.has(officer.id)) continue;

    const rosterNorm = normalizeText(officer.name ?? "");
    const discordNorm = normalizeText(officer.discordUsername ?? "");
    const discordLeet = normalizeLeet(officer.discordUsername ?? "");
    const rosterTokens = tokenize(officer.name ?? "");

    if (rosterNorm && rosterNorm === eventNorm) return officer;

    if (
      eventLeet.length >= 3 &&
      (discordNorm.includes(eventLeet) ||
        discordLeet.includes(eventLeet) ||
        eventLeet.includes(discordNorm))
    ) {
      candidates.push(officer);
      continue;
    }

    if (
      eventNorm.length >= 3 &&
      (discordNorm.includes(eventNorm) || eventNorm.includes(discordNorm))
    ) {
      candidates.push(officer);
      continue;
    }

    const matchedToken = [...eventTokens, ...eventLeetTokens].some((token) => {
      if (token.length < 3) return false;
      return (
        discordNorm.includes(token) ||
        discordLeet.includes(token) ||
        rosterTokens[0] === token
      );
    });

    if (matchedToken) {
      candidates.push(officer);
    }
  }

  return candidates.length === 1 ? candidates[0]! : null;
}

export function getCurrentOpenDutyWeekSecsByCallSign(
  events: DutyEventLike[],
  officers: OfficerLike[],
  now = new Date(),
): Record<string, number> {
  const sessions = getCurrentOpenDutySessions(events, officers, now);
  const secondsByCallSign: Record<string, number> = {};

  for (const session of sessions) {
    secondsByCallSign[session.officer.callSign] =
      (secondsByCallSign[session.officer.callSign] ?? 0) + session.elapsedSecs;
  }

  return secondsByCallSign;
}

export function getCurrentOpenDutySessions(
  events: DutyEventLike[],
  officers: OfficerLike[],
  now = new Date(),
  maxOpenDutyHours = DEFAULT_MAX_OPEN_DUTY_HOURS,
): OpenDutySession[] {
  const currentWeekStart = getCurrentWeekStart(now);
  const claimedOfficerIds = new Set<number>();
  const maxOpenDutySecs = Math.max(3600, Math.floor(maxOpenDutyHours * 3600));
  const futureToleranceMs = 5 * 60 * 1000;
  const sessions: OpenDutySession[] = [];
  const eventsByLicense = new Map<string, DutyEventLike[]>();

  for (const event of events) {
    const rawLicenseId = normalizeLicenseId(event.licenseId);
    if (!rawLicenseId) continue;
    if (event.eventAt.getTime() > now.getTime() + futureToleranceMs) continue;
    const list = eventsByLicense.get(rawLicenseId) ?? [];
    list.push(event);
    eventsByLicense.set(rawLicenseId, list);
  }

  for (const [licenseId, licenseEvents] of eventsByLicense.entries()) {
    const sortedEvents = [...licenseEvents].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
    let latestOpenEvent: DutyEventLike | null = null;

    for (const event of sortedEvents) {
      if (event.eventType === "on") {
        latestOpenEvent = event;
      } else if (event.eventType === "off") {
        latestOpenEvent = null;
      }
    }

    if (!latestOpenEvent) continue;

    const officer = findOfficerByDutyIdentity(
      licenseId,
      latestOpenEvent.officerName,
      officers,
      claimedOfficerIds,
    );

    if (!officer) continue;

    const overlapStart =
      latestOpenEvent.eventAt.getTime() > currentWeekStart.getTime()
        ? latestOpenEvent.eventAt
        : currentWeekStart;
    const elapsedSecs = Math.max(
      0,
      Math.floor((now.getTime() - overlapStart.getTime()) / 1000),
    );

    if (elapsedSecs <= 0 || elapsedSecs > maxOpenDutySecs) continue;

    claimedOfficerIds.add(officer.id);
    sessions.push({
      officer,
      event: latestOpenEvent,
      elapsedSecs,
      overlapStart,
    });
  }

  return sessions.sort((a, b) => b.event.eventAt.getTime() - a.event.eventAt.getTime());
}
