import { Router } from "express";
import { db, discordChannelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/api/admin/channels", async (req, res): Promise<void> => {
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
  if (existing.length > 0) {
    res.status(409).json({ error: "Channel ID already exists" });
    return;
  }
  const [created] = await db.insert(discordChannelsTable).values({ channelId: trimId, channelName: trimName }).returning();
  res.status(201).json(created);
});

router.patch("/api/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive boolean required" });
    return;
  }
  const [updated] = await db
    .update(discordChannelsTable)
    .set({ isActive })
    .where(eq(discordChannelsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/api/admin/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(discordChannelsTable).where(eq(discordChannelsTable.id, id));
  res.status(204).end();
});

export default router;
