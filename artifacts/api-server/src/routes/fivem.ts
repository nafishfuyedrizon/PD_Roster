import { Router, type IRouter } from "express";
import { db, siteSettingsTable, officersTable, discordDutyEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  getMysqlDutyEvents,
  getMysqlOfficers,
  getMysqlSetting,
  isMysqlDatabaseUrl,
  setMysqlSetting,
} from "../lib/pd-mysql-read.js";

const router: IRouter = Router();

// In-memory tracking: serverId -> first seen timestamp
const playerFirstSeen = new Map<number, Date>();
let lastKnownIds = new Set<number>();

function formatElapsed(since: Date): string {
  const secs = Math.floor((Date.now() - since.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

// GET /api/fivem/players
router.get("/fivem/players", async (req, res): Promise<void> => {
  const serverUrl = isMysqlDatabaseUrl
    ? await getMysqlSetting("fivem_server_url")
    : (await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "fivem_server_url")).limit(1))[0]?.value?.trim();

  if (!serverUrl) {
    res.json({ configured: false, online: false, players: [] });
    return;
  }

  let fivemPlayers: any[] = [];
  let online = false;
  try {
    const base = serverUrl.replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`${base}/players.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      fivemPlayers = (await resp.json()) as any[];
      online = true;
    }
  } catch {
    online = false;
  }

  // Update first-seen tracking
  const currentIds = new Set<number>(fivemPlayers.map((p: any) => p.id as number));
  const now = new Date();
  for (const id of currentIds) {
    if (!playerFirstSeen.has(id)) playerFirstSeen.set(id, now);
  }
  // Clean up players who left
  for (const id of lastKnownIds) {
    if (!currentIds.has(id)) playerFirstSeen.delete(id);
  }
  lastKnownIds = currentIds;

  // Get all officers
  const officers = isMysqlDatabaseUrl
    ? await getMysqlOfficers()
    : await db.select().from(officersTable);

  const licenseMap = new Map<string, typeof officers[0]>();
  const fivemNameMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) {
      const rawId = (o.rockstarLicenseId as string).replace(/^license:/i, "").toLowerCase();
      licenseMap.set(rawId, o);
    }
    if (o.fivemName) {
      fivemNameMap.set((o.fivemName as string).toLowerCase().trim(), o);
    }
  }

  const dutyEvents = isMysqlDatabaseUrl
    ? await getMysqlDutyEvents()
    : await db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt));

  // Map: FiveM character name → officer (via duty log license → officers table)
  const dutyNameMap = new Map<string, typeof officers[0]>();
  for (const ev of dutyEvents) {
    const evName = (ev.officerName ?? "").toLowerCase().trim();
    if (!evName || dutyNameMap.has(evName)) continue;
    const rawId = (ev.licenseId ?? "").replace(/^license:/i, "").toLowerCase();
    const officer = rawId ? licenseMap.get(rawId) : null;
    if (officer) dutyNameMap.set(evName, officer);
  }

  // Latest duty event per license
  const latestByLicense = new Map<string, typeof dutyEvents[0]>();
  for (const ev of dutyEvents) {
    const rawId = (ev.licenseId ?? "").replace(/^license:/i, "").toLowerCase();
    if (rawId && !latestByLicense.has(rawId)) latestByLicense.set(rawId, ev);
  }

  // Latest duty event per FiveM display name
  const latestByFivemName = new Map<string, typeof dutyEvents[0]>();
  for (const ev of dutyEvents) {
    const evName = (ev.officerName ?? "").toLowerCase().trim();
    if (evName && !latestByFivemName.has(evName)) latestByFivemName.set(evName, ev);
  }

  const players = fivemPlayers.map((p: any) => {
    const rawLicense = (p.identifiers ?? [])
      .find((id: string) => id.startsWith("license:"))
      ?.replace(/^license:/i, "")
      .toLowerCase() ?? null;

    const playerFivemName = (p.name ?? "").toLowerCase().trim();

    const officer =
      (rawLicense ? licenseMap.get(rawLicense) : null) ??
      fivemNameMap.get(playerFivemName) ??
      dutyNameMap.get(playerFivemName) ??
      null;

    const latestDuty =
      (rawLicense ? latestByLicense.get(rawLicense) : null) ??
      latestByFivemName.get(playerFivemName) ??
      null;

    const onDuty = latestDuty?.eventType === "on" || latestDuty?.eventType === "on_duty";

    const firstSeen = playerFirstSeen.get(p.id as number);
    const timeOnServer = firstSeen ? formatElapsed(firstSeen) : null;

    return {
      serverId: p.id,
      fivemName: p.name ?? "Unknown",
      ping: p.ping ?? 0,
      license: rawLicense,
      timeOnServer,
      officer: officer
        ? { name: officer.name, rank: officer.rank, callSign: officer.callSign, department: officer.department }
        : null,
      onDuty,
    };
  });

  res.json({ configured: true, online, serverUrl, players });
});

// PUT /api/fivem/server-url
router.put("/fivem/server-url", async (req, res): Promise<void> => {
  const { url } = req.body;
  if (typeof url !== "string") { res.status(400).json({ error: "url required" }); return; }
  if (isMysqlDatabaseUrl) {
    await setMysqlSetting("fivem_server_url", url.trim());
    res.json({ ok: true });
    return;
  }
  await db.insert(siteSettingsTable)
    .values({ key: "fivem_server_url", value: url.trim() })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: url.trim(), updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
