import { Router, Response } from "express";
import { db, pdFirTable, officersTable, type FirThreadMessage } from "@workspace/db";
import { desc, ilike, or, sql, inArray } from "drizzle-orm";

const router = Router();

const sseClients = new Set<Response>();

export function broadcastFirEvent(type: "new_fir" | "thread_update") {
  const data = JSON.stringify({ type, ts: Date.now() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

router.get("/fir/stream", (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`: connected\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  sseClients.add(res);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

router.get("/fir", async (req, res): Promise<void> => {
  const { search, limit: lim } = req.query as Record<string, string>;
  const limit = lim ? Math.min(parseInt(lim, 10) || 10000, 10000) : 10000;
  let query = db.select().from(pdFirTable).orderBy(desc(pdFirTable.postedAt)).$dynamic();
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.where(or(
      ilike(pdFirTable.complainantName, q),
      ilike(pdFirTable.complainantCid, q),
      ilike(pdFirTable.officerName, q),
      ilike(pdFirTable.suspectDetails, q),
      ilike(pdFirTable.eventDescription, q),
    ));
  }
  const firs = await query.limit(limit);

  const discordIds = new Set<string>();
  for (const fir of firs) {
    for (const reply of (fir.threadReplies ?? []) as FirThreadMessage[]) {
      if (reply.authorId) discordIds.add(reply.authorId);
    }
  }

  const nameMap = new Map<string, string>();
  if (discordIds.size > 0) {
    const officers = await db
      .select({ discordId: officersTable.discordId, name: officersTable.name })
      .from(officersTable)
      .where(inArray(officersTable.discordId, [...discordIds]));
    for (const o of officers) {
      if (o.discordId && o.name) nameMap.set(o.discordId, o.name);
    }
  }

  const result = firs.map(fir => ({
    ...fir,
    threadReplies: fir.threadReplies
      ? (fir.threadReplies as FirThreadMessage[]).map(reply => ({
          ...reply,
          author: (reply.authorId && nameMap.get(reply.authorId)) || reply.author,
        }))
      : null,
  }));

  res.json(result);
});

router.get("/fir/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdFirTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS firs FROM pd_fir WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY firs DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

export default router;
