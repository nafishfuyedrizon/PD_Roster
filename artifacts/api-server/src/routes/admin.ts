import { Router } from "express";
import { db, discordChannelsTable, pdDutyLogsTable, officersTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";

const router = Router();

// ── Discord Channels ────────────────────────────────────────────────────────

router.get("/api/admin/channels", async (_req, res): Promise<void> => {
  const channels = await db.select().from(discordChannelsTable).orderBy(discordChannelsTable.createdAt);
  res.json(channels);
});

router.post("/api/admin/channels", async (req, res): Promise<void> => {
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

router.patch("/api/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive boolean required" }); return; }
  const [updated] = await db.update(discordChannelsTable).set({ isActive }).where(eq(discordChannelsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/api/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(discordChannelsTable).where(eq(discordChannelsTable.id, id));
  res.status(204).end();
});

// ── PD Duty Logs ─────────────────────────────────────────────────────────────

router.get("/api/admin/duty-logs", async (req, res): Promise<void> => {
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

router.post("/api/admin/duty-logs", async (req, res): Promise<void> => {
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

router.put("/api/admin/duty-logs/:id", async (req, res): Promise<void> => {
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

router.delete("/api/admin/duty-logs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(pdDutyLogsTable).where(eq(pdDutyLogsTable.id, id));
  res.status(204).end();
});

// Officers list for dropdown
router.get("/api/admin/officers-list", async (_req, res): Promise<void> => {
  const officers = await db
    .select({ id: officersTable.id, callSign: officersTable.callSign, name: officersTable.name, rank: officersTable.rank })
    .from(officersTable)
    .orderBy(asc(officersTable.callSign));
  res.json(officers);
});

export default router;
