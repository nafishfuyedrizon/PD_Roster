import { Router, Response } from "express";
import { db, pdFirTable, officersTable, type FirThreadMessage } from "@workspace/db";
import { desc, ilike, or, sql, inArray, eq } from "drizzle-orm";

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
  const displayNames = new Set<string>();
  for (const fir of firs) {
    for (const reply of (fir.threadReplies ?? []) as FirThreadMessage[]) {
      if (reply.authorId) discordIds.add(reply.authorId);
      else if (reply.author) displayNames.add(reply.author);
    }
  }

  const idToName = new Map<string, string>();
  const displayToName = new Map<string, string>();

  const allOfficers = await db
    .select({ discordId: officersTable.discordId, name: officersTable.name })
    .from(officersTable);

  for (const o of allOfficers) {
    if (o.discordId && o.name) {
      if (discordIds.has(o.discordId)) idToName.set(o.discordId, o.name);
      for (const dn of displayNames) {
        if (o.name.toLowerCase().includes(dn.toLowerCase()) || dn.toLowerCase().includes(o.name.split(" ")[0].toLowerCase())) {
          displayToName.set(dn, o.name);
        }
      }
    }
  }

  const result = firs.map(fir => ({
    ...fir,
    threadReplies: fir.threadReplies
      ? (fir.threadReplies as FirThreadMessage[]).map(reply => ({
          ...reply,
          author: (reply.authorId && idToName.get(reply.authorId))
            || (reply.author && displayToName.get(reply.author))
            || reply.author,
        }))
      : null,
  }));

  res.json(result);
});

router.patch("/fir/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { status, acceptedBy, officerName, rejectedBy } = req.body as { status: "accepted" | "rejected" | "pending"; acceptedBy?: string; officerName?: string; rejectedBy?: string };
  if (!["accepted", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const [row] = await db.update(pdFirTable).set({
    status,
    acceptedBy: status === "accepted" ? (acceptedBy ?? null) : null,
    acceptedAt: status === "accepted" ? new Date() : null,
    rejectedBy: status === "rejected" ? (rejectedBy ?? null) : null,
    ...(status === "accepted" && officerName != null ? { officerName } : {}),
  }).where(eq(pdFirTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "FIR not found" }); return; }
  broadcastFirEvent("thread_update");
  res.json(row);
});

// ── FIR breakdown for Qual Chart drill-down ───────────────────────────────────
// GET /api/fir/officer-breakdown?name=...  — FIRs accepted_by the officer
router.get("/fir/officer-breakdown", async (req, res): Promise<void> => {
  const name = (req.query.name as string | undefined)?.trim();
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const rows = await db
    .select({
      id: pdFirTable.id,
      complainantName: pdFirTable.complainantName,
      complainantCid: pdFirTable.complainantCid,
      complainantContact: pdFirTable.complainantContact,
      eventDescription: pdFirTable.eventDescription,
      suspectDetails: pdFirTable.suspectDetails,
      evidence: pdFirTable.evidence,
      officerName: pdFirTable.officerName,
      acceptedBy: pdFirTable.acceptedBy,
      acceptedAt: pdFirTable.acceptedAt,
      postedAt: pdFirTable.postedAt,
    })
    .from(pdFirTable)
    .where(sql`${pdFirTable.acceptedBy} ILIKE ${name} AND ${pdFirTable.status} = 'accepted'`)
    .orderBy(desc(pdFirTable.acceptedAt));
  res.json(rows);
});

router.get("/fir/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdFirTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS firs FROM pd_fir WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY firs DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

export default router;
