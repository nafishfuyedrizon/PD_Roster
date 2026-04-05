import { Router } from "express";
import { db, discordChannelsTable, pdDutyLogsTable, officersTable, discordDutyEventsTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";

function secsToHms(s: number): string {
  if (s <= 0) return "00:00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function norm(s: string) { return s.toLowerCase().replace(/[-_.\s]/g, ""); }
function tokens(s: string) { return s.toLowerCase().split(/[\s\-_]+/).filter(Boolean); }
function leetNorm(s: string) {
  return norm(s).replace(/4/g, "a").replace(/3/g, "e").replace(/0/g, "o").replace(/1/g, "i").replace(/5/g, "s").replace(/7/g, "t");
}

const router = Router();

// ── Discord Channels ────────────────────────────────────────────────────────

router.get("/admin/channels", async (_req, res): Promise<void> => {
  const channels = await db.select().from(discordChannelsTable).orderBy(discordChannelsTable.createdAt);
  res.json(channels);
});

router.post("/admin/channels", async (req, res): Promise<void> => {
  const { channelId, channelName } = req.body as { channelId?: string; channelName?: string };
  if (!channelId?.trim() || !channelName?.trim()) {
    res.status(400).json({ error: "channelId and channelName are required" });
    return;
  }
  const trimId = channelId.trim();
  const trimName = channelName.trim();
  const existing = await db.select().from(discordChannelsTable).where(eq(discordChannelsTable.channelId, trimId));
  if (existing.length > 0) { res.status(409).json({ error: "Channel ID already exists" }); return; }
  const [created] = await db.insert(discordChannelsTable).values({ channelId: trimId, channelName: trimName }).returning();
  res.status(201).json(created);
});

router.patch("/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive boolean required" }); return; }
  const [updated] = await db.update(discordChannelsTable).set({ isActive }).where(eq(discordChannelsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(discordChannelsTable).where(eq(discordChannelsTable.id, id));
  res.status(204).end();
});

// ── PD Duty Logs ─────────────────────────────────────────────────────────────

router.get("/admin/duty-logs", async (req, res): Promise<void> => {
  const { search, dateFrom, dateTo, shiftType } = req.query as {
    search?: string; dateFrom?: string; dateTo?: string; shiftType?: string;
  };

  const conditions = [];
  if (shiftType && shiftType !== "All") conditions.push(eq(pdDutyLogsTable.shiftType, shiftType));
  if (dateFrom) conditions.push(gte(pdDutyLogsTable.logDate, dateFrom));
  if (dateTo) conditions.push(lte(pdDutyLogsTable.logDate, dateTo));
  if (search?.trim()) {
    const s = `%${search.trim()}%`;
    conditions.push(or(ilike(pdDutyLogsTable.officerName, s), ilike(pdDutyLogsTable.csNumber, s))!);
  }

  const logs = await db
    .select()
    .from(pdDutyLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(pdDutyLogsTable.logDate), desc(pdDutyLogsTable.createdAt));

  res.json(logs);
});

router.post("/admin/duty-logs", async (req, res): Promise<void> => {
  const { logDate, csNumber, officerName, rank, shiftType, duration, notes } =
    req.body as Partial<{ logDate: string; csNumber: string; officerName: string; rank: string; shiftType: string; duration: string; notes: string }>;

  if (!logDate || !csNumber?.trim() || !officerName?.trim() || !duration?.trim()) {
    res.status(400).json({ error: "logDate, csNumber, officerName, duration are required" });
    return;
  }
  const [created] = await db.insert(pdDutyLogsTable).values({
    logDate,
    csNumber: csNumber.trim(),
    officerName: officerName.trim(),
    rank: rank?.trim() ?? "",
    shiftType: shiftType ?? "Full",
    duration: duration.trim(),
    notes: notes?.trim() || null,
  }).returning();
  res.status(201).json(created);
});

router.put("/admin/duty-logs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { logDate, csNumber, officerName, rank, shiftType, duration, notes } =
    req.body as Partial<{ logDate: string; csNumber: string; officerName: string; rank: string; shiftType: string; duration: string; notes: string }>;

  if (!logDate || !csNumber?.trim() || !officerName?.trim() || !duration?.trim()) {
    res.status(400).json({ error: "logDate, csNumber, officerName, duration are required" });
    return;
  }
  const [updated] = await db.update(pdDutyLogsTable).set({
    logDate,
    csNumber: csNumber.trim(),
    officerName: officerName.trim(),
    rank: rank?.trim() ?? "",
    shiftType: shiftType ?? "Full",
    duration: duration.trim(),
    notes: notes?.trim() || null,
  }).where(eq(pdDutyLogsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/duty-logs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(pdDutyLogsTable).where(eq(pdDutyLogsTable.id, id));
  res.status(204).end();
});

// Officers list for dropdown
router.get("/admin/officers-list", async (_req, res): Promise<void> => {
  const officers = await db
    .select({ id: officersTable.id, callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank })
    .from(officersTable)
    .orderBy(asc(officersTable.callSign));
  res.json(officers);
});

// ── Import Discord Events → Duty Logs ───────────────────────────────────────

router.post("/admin/duty-logs/import-discord", async (req, res): Promise<void> => {
  // 1. Fetch all events ordered by license + time
  const events = await db
    .select()
    .from(discordDutyEventsTable)
    .orderBy(asc(discordDutyEventsTable.licenseId), asc(discordDutyEventsTable.eventAt));

  // 2. Fetch officers for matching
  const officers = await db.select().from(officersTable);

  // Build licenseId → officer map (for those with rockstar_license_id)
  const licenseMap = new Map<string, typeof officers[0]>();
  for (const o of officers) {
    if (o.rockstarLicenseId) licenseMap.set(o.rockstarLicenseId, o);
  }

  // Fuzzy name matcher (same strategy as dashboard)
  function findByName(evName: string): typeof officers[0] | null {
    const evNorm = norm(evName);
    const evLeet = leetNorm(evName);
    const evTokens = tokens(evName);
    const evLeetTokens = evLeet.split(/[^a-z]+/).filter(Boolean);
    const candidates: typeof officers[0][] = [];
    for (const o of officers) {
      const rosterNorm = norm(o.name ?? "");
      const discordNorm = norm(o.discordUsername ?? "");
      const discordLeet = leetNorm(o.discordUsername ?? "");
      const rosterTokens = tokens(o.name ?? "");
      if (rosterNorm === evNorm) return o;
      if (evLeet.length >= 3 && (discordNorm.includes(evLeet) || discordLeet.includes(evLeet) || evLeet.includes(discordNorm))) { candidates.push(o); continue; }
      if (evNorm.length >= 3 && (discordNorm.includes(evNorm) || evNorm.includes(discordNorm))) { candidates.push(o); continue; }
      const matched = [...evTokens, ...evLeetTokens].some((t) => {
        if (t.length < 3) return false;
        return discordNorm.includes(t) || discordLeet.includes(t) || rosterTokens[0] === t;
      });
      if (matched) { candidates.push(o); continue; }
    }
    return candidates.length === 1 ? candidates[0]! : null;
  }

  // 3. Group events by licenseId
  const byLicense = new Map<string, typeof events>();
  for (const ev of events) {
    const list = byLicense.get(ev.licenseId) ?? [];
    list.push(ev);
    byLicense.set(ev.licenseId, list);
  }

  // 4. Pair on→off and build log entries
  type NewLog = typeof pdDutyLogsTable.$inferInsert;
  const newLogs: NewLog[] = [];

  for (const [licenseId, evList] of byLicense) {
    const officer = licenseMap.get(licenseId) ?? findByName(evList[0]?.officerName ?? "");
    let pendingOn: typeof evList[0] | null = null;

    for (const ev of evList) {
      if (ev.eventType === "on") {
        pendingOn = ev;
      } else if (ev.eventType === "off" && pendingOn) {
        const durationSecs = Math.floor((ev.eventAt.getTime() - pendingOn.eventAt.getTime()) / 1000);
        if (durationSecs > 30) {  // skip spurious sub-30s sessions
          const logDate = pendingOn.eventAt.toISOString().split("T")[0]!;
          newLogs.push({
            logDate,
            csNumber: officer?.callSign ?? "",
            officerName: officer?.name ?? pendingOn.officerName,
            rank: officer?.rank ?? pendingOn.rank ?? "",
            shiftType: "Full",
            duration: secsToHms(durationSecs),
            notes: "discord",
          });
        }
        pendingOn = null;
      }
    }
  }

  // 5. Clear previous discord-imported logs, then bulk insert
  await db.delete(pdDutyLogsTable).where(eq(pdDutyLogsTable.notes, "discord"));

  if (newLogs.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < newLogs.length; i += CHUNK) {
      await db.insert(pdDutyLogsTable).values(newLogs.slice(i, i + CHUNK));
    }
  }

  res.json({ imported: newLogs.length });
});

export default router;
