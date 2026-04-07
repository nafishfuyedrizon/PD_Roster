import { Router, type IRouter } from "express";
import { db, siteSettingsTable, officersTable, discordDutyEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/fivem/players — fetch live players from FiveM server and match to officers
router.get("/fivem/players", async (req, res): Promise<void> => {
  // Get configured server URL
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "fivem_server_url")).limit(1);
  const serverUrl = setting?.value?.trim();

  if (!serverUrl) {
    res.json({ configured: false, online: false, players: [] });
    return;
  }

  // Fetch players from FiveM server
  let fivemPlayers: any[] = [];
  let online = false;
  try {
    const base = serverUrl.replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`${base}/players.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      fivemPlayers = await resp.json();
      online = true;
    }
  } catch {
    online = false;
  }

  // Get all officers
  const officers = await db.select().from(officersTable);

  // Map 1: license → officer (from rockstarLicenseId in officers table)
  const licenseMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) {
      const rawId = (o.rockstarLicenseId as string).replace(/^license:/i, "").toLowerCase();
      licenseMap.set(rawId, o);
    }
  }

  // Map 2: fivemName → officer (manually set in roster)
  const fivemNameMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.fivemName) {
      fivemNameMap.set((o.fivemName as string).toLowerCase().trim(), o);
    }
  }

  // Get all duty events — sorted newest first
  const dutyEvents = await db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt));

  // Map 3: FiveM character name → officer (from discord_duty_events officer_name + license_id)
  // discord_duty_events stores the FiveM display name in officer_name and the license in license_id
  const dutyNameMap = new Map<string, typeof officers[0]>();
  for (const ev of dutyEvents) {
    const evName = (ev.officerName ?? "").toLowerCase().trim();
    if (!evName || dutyNameMap.has(evName)) continue;
    const rawId = (ev.licenseId ?? "").replace(/^license:/i, "").toLowerCase();
    const officer = rawId ? licenseMap.get(rawId) : null;
    if (officer) dutyNameMap.set(evName, officer);
  }

  // Latest duty event per license for on-duty check
  const latestByLicense = new Map<string, typeof dutyEvents[0]>();
  for (const ev of dutyEvents) {
    const rawId = (ev.licenseId ?? "").replace(/^license:/i, "").toLowerCase();
    if (rawId && !latestByLicense.has(rawId)) latestByLicense.set(rawId, ev);
  }

  // Latest duty event per FiveM display name (for players whose license isn't exposed)
  const latestByFivemName = new Map<string, typeof dutyEvents[0]>();
  for (const ev of dutyEvents) {
    const evName = (ev.officerName ?? "").toLowerCase().trim();
    if (evName && !latestByFivemName.has(evName)) latestByFivemName.set(evName, ev);
  }

  // Match players — priority: license → manual fivemName → duty log name
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

    // Duty status: check by license first, then by FiveM display name
    const latestDuty =
      (rawLicense ? latestByLicense.get(rawLicense) : null) ??
      latestByFivemName.get(playerFivemName) ??
      null;

    // event_type in discord_duty_events is "on" or "off"
    const onDuty = latestDuty?.eventType === "on" || latestDuty?.eventType === "on_duty";

    return {
      serverId: p.id,
      fivemName: p.name ?? "Unknown",
      ping: p.ping ?? 0,
      license: rawLicense,
      officer: officer
        ? { name: officer.name, rank: officer.rank, callSign: officer.callSign, department: officer.department }
        : null,
      onDuty,
    };
  });

  res.json({ configured: true, online, serverUrl, players });
});

// PUT /api/fivem/server-url — save FiveM server URL
router.put("/fivem/server-url", async (req, res): Promise<void> => {
  const { url } = req.body;
  if (typeof url !== "string") { res.status(400).json({ error: "url required" }); return; }
  await db.insert(siteSettingsTable)
    .values({ key: "fivem_server_url", value: url.trim() })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: url.trim(), updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
