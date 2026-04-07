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

  // Get all officers with license IDs
  const officers = await db.select().from(officersTable);
  const licenseMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) {
      const rawId = (o.rockstarLicenseId as string).replace(/^license:/i, "").toLowerCase();
      licenseMap.set(rawId, o);
    }
  }

  // Get latest duty event per license to determine on-duty status
  const dutyEvents = await db.select().from(discordDutyEventsTable).orderBy(desc(discordDutyEventsTable.eventAt));
  const latestByLicense = new Map<string, typeof dutyEvents[0]>();
  for (const ev of dutyEvents) {
    const rawId = (ev.licenseId ?? "").replace(/^license:/i, "").toLowerCase();
    if (rawId && !latestByLicense.has(rawId)) latestByLicense.set(rawId, ev);
  }

  // Match players
  const players = fivemPlayers.map((p: any) => {
    const rawLicense = (p.identifiers ?? [])
      .find((id: string) => id.startsWith("license:"))
      ?.replace(/^license:/i, "")
      .toLowerCase() ?? null;

    const officer = rawLicense ? licenseMap.get(rawLicense) ?? null : null;
    const latestDuty = rawLicense ? latestByLicense.get(rawLicense) ?? null : null;
    const onDuty = latestDuty?.eventType === "on_duty";

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
