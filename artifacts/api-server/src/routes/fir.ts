import { Router, Response } from "express";
import { db, pdFirTable, officersTable, type FirThreadMessage } from "@workspace/db";
import { desc, ilike, or, sql, inArray, eq } from "drizzle-orm";
import { guard } from "../lib/auth-guard.js";
import {
  getMysqlOfficers,
  isMysqlDatabaseUrl,
  mysqlExecute,
  mysqlQuery,
} from "../lib/pd-mysql-read.js";

const router = Router();

const sseClients = new Set<Response>();

type MysqlFirRow = {
  id: number;
  discord_message_id: string | null;
  complainant_name: string | null;
  complainant_cid: string | null;
  complainant_contact: string | null;
  event_description: string | null;
  suspect_details: string | null;
  evidence: string | null;
  officer_name: string | null;
  raw_content: string | null;
  thread_id: string | null;
  thread_replies: string | null;
  status: string | null;
  accepted_by: string | null;
  accepted_at: unknown;
  rejected_by: string | null;
  posted_at: unknown;
  created_at: unknown;
  bookmarked: unknown;
};

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function parseThreadReplies(raw: string | null): FirThreadMessage[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FirThreadMessage[]) : null;
  } catch {
    return null;
  }
}

function normalizeFirPreview(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isBogusFirPreview(value: string | null | undefined): boolean {
  const text = normalizeFirPreview(value);
  if (!text) return true;
  if (/^pd fir\s*[•:#-]*\s*#?\d+$/i.test(text)) return true;
  if (/^(new fir submission|fir submission|test|result|output|report)$/i.test(text)) return true;
  return false;
}

function hasMeaningfulFirContent(row: {
  complainantName: string | null;
  complainantCid: string | null;
  complainantContact: string | null;
  eventDescription: string | null;
  suspectDetails: string | null;
  evidence: string | null;
}): boolean {
  if (row.complainantName?.trim()) return true;
  if (row.complainantCid?.trim()) return true;
  if (row.complainantContact?.trim()) return true;
  if (row.suspectDetails?.trim()) return true;
  if (row.evidence?.trim()) return true;
  if (!isBogusFirPreview(row.eventDescription)) return true;
  return false;
}

async function getMysqlFirRows(
  search?: string,
  limit = 10000,
): Promise<Array<{
  id: number;
  discordMessageId: string | null;
  complainantName: string | null;
  complainantCid: string | null;
  complainantContact: string | null;
  eventDescription: string | null;
  suspectDetails: string | null;
  evidence: string | null;
  officerName: string | null;
  rawContent: string | null;
  threadId: string | null;
  threadReplies: FirThreadMessage[] | null;
  status: string;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  rejectedBy: string | null;
  postedAt: Date | null;
  createdAt: Date | null;
  bookmarked: boolean;
}>> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (search?.trim()) {
    const like = `%${search.trim()}%`;
    where.push(
      `(complainant_name LIKE ? OR complainant_cid LIKE ? OR officer_name LIKE ? OR suspect_details LIKE ? OR event_description LIKE ?)`,
    );
    params.push(like, like, like, like, like);
  }
  params.push(limit);
  const rows = await mysqlQuery<MysqlFirRow>(
    `SELECT *
     FROM pd_fir
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY posted_at DESC, id DESC
     LIMIT ?`,
    params,
  );

  const firs = rows.map((row) => ({
    id: Number(row.id),
    discordMessageId: row.discord_message_id ?? null,
    complainantName: row.complainant_name ?? null,
    complainantCid: row.complainant_cid ?? null,
    complainantContact: row.complainant_contact ?? null,
    eventDescription: row.event_description ?? null,
    suspectDetails: row.suspect_details ?? null,
    evidence: row.evidence ?? null,
    officerName: row.officer_name ?? null,
    rawContent: row.raw_content ?? null,
    threadId: row.thread_id ?? null,
    threadReplies: parseThreadReplies(row.thread_replies),
    status: row.status ?? "pending",
    acceptedBy: row.accepted_by ?? null,
    acceptedAt: asDate(row.accepted_at),
    rejectedBy: row.rejected_by ?? null,
    postedAt: asDate(row.posted_at),
    createdAt: asDate(row.created_at),
    bookmarked: asBool(row.bookmarked),
  })).filter((row) => hasMeaningfulFirContent(row));

      const officers = await getMysqlOfficers();
  const idToOfficer = new Map<string, { id: number; name: string }>();
  const displayToOfficer = new Map<string, { id: number; name: string }>();
  const discordIds = new Set<string>();
  const displayNames = new Set<string>();

  for (const fir of firs) {
    for (const reply of fir.threadReplies ?? []) {
      const replyAuthorId = (reply as any).authorId || (reply as any).authorid;
      const replyAuthorName = (
        (reply as any).authorName ||
        (reply as any).author ||
        (reply as any).username ||
        ""
      ).trim();

      if (replyAuthorId) discordIds.add(String(replyAuthorId));
      if (replyAuthorName) displayNames.add(replyAuthorName);
    }
  }

  for (const officer of officers) {
    if (!officer.name) continue;

    const officerInfo = {
      id: Number(officer.id),
      name: officer.name,
    };

    if (officer.discordUid && discordIds.has(String(officer.discordUid))) {
      idToOfficer.set(String(officer.discordUid), officerInfo);
    }

    if (officer.discordId && discordIds.has(String(officer.discordId))) {
      idToOfficer.set(String(officer.discordId), officerInfo);
    }

    for (const displayName of displayNames) {
      const officerName = officer.name.toLowerCase();
      const display = displayName.toLowerCase();

      if (
        officerName.includes(display) ||
        display.includes(officerName.split(" ")[0] ?? "")
      ) {
        displayToOfficer.set(displayName, officerInfo);
      }
    }
  }

  return firs.map((fir) => ({
    ...fir,
    threadReplies: fir.threadReplies?.map((reply: any) => {
      const replyAuthorId = reply.authorId || reply.authorid;
      const replyAuthorName = (
        reply.authorName ||
        reply.author ||
        reply.username ||
        "Unknown Officer"
      ).trim();

      const matchedOfficer =
        (replyAuthorId && idToOfficer.get(String(replyAuthorId))) ||
        displayToOfficer.get(replyAuthorName) ||
        null;

      return {
        ...reply,
        authorId: replyAuthorId ?? null,
        author: matchedOfficer?.name ?? replyAuthorName,
        authorOfficerId: matchedOfficer?.id ?? null,
        authorOfficerName: matchedOfficer?.name ?? null,
      };
    }) ?? null,
  }));
}
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
  if (isMysqlDatabaseUrl) {
    res.json(await getMysqlFirRows(search, limit));
    return;
  }
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

// ── Toggle bookmark ───────────────────────────────────────────────────────────
router.patch("/fir/:id/bookmark", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);
  if (isMysqlDatabaseUrl) {
    const currentRows = await mysqlQuery<{ bookmarked: unknown }>(
      `SELECT bookmarked FROM pd_fir WHERE id = ? LIMIT 1`,
      [id],
    );
    const current = currentRows[0];
    if (!current) { res.status(404).json({ error: "FIR not found" }); return; }
    const bookmarked = !asBool(current.bookmarked);
    await mysqlExecute(
      `UPDATE pd_fir SET bookmarked = ? WHERE id = ?`,
      [bookmarked ? 1 : 0, id],
    );
    broadcastFirEvent("thread_update");
    res.json({ bookmarked });
    return;
  }
  const [current] = await db.select({ bookmarked: pdFirTable.bookmarked }).from(pdFirTable).where(eq(pdFirTable.id, id));
  if (!current) { res.status(404).json({ error: "FIR not found" }); return; }
  const [row] = await db.update(pdFirTable).set({ bookmarked: !current.bookmarked }).where(eq(pdFirTable.id, id)).returning();
  broadcastFirEvent("thread_update");
  res.json({ bookmarked: row.bookmarked });
});

router.patch("/fir/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);
  const { status, acceptedBy, officerName, rejectedBy } = req.body as { status: "accepted" | "rejected" | "pending"; acceptedBy?: string; officerName?: string; rejectedBy?: string };
  const nextOfficerName = status === "accepted" ? (officerName ?? null) : null;
  if (!["accepted", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  if (isMysqlDatabaseUrl) {
    const result = await mysqlExecute(
      `UPDATE pd_fir
       SET status = ?,
           accepted_by = ?,
           accepted_at = ?,
           rejected_by = ?,
           officer_name = CASE
             WHEN ? = 'accepted' THEN ?
             ELSE NULL
           END
       WHERE id = ?`,
      [
        status,
        status === "accepted" ? (acceptedBy ?? null) : null,
        status === "accepted" ? new Date() : null,
        status === "rejected" ? (rejectedBy ?? null) : null,
        status,
        status === "accepted" ? (officerName ?? null) : null,
        id,
      ],
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "FIR not found" }); return; }
    const row = (await getMysqlFirRows(undefined, 10000)).find((fir) => fir.id === id) ?? null;
    broadcastFirEvent("thread_update");
    res.json(row);
    return;
  }
  const [row] = await db.update(pdFirTable).set({
    status,
    acceptedBy: status === "accepted" ? (acceptedBy ?? null) : null,
    acceptedAt: status === "accepted" ? new Date() : null,
    rejectedBy: status === "rejected" ? (rejectedBy ?? null) : null,
    officerName: status === "accepted" ? (officerName ?? null) : null,
  }).where(eq(pdFirTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "FIR not found" }); return; }
  broadcastFirEvent("thread_update");
  res.json(row);
});

// ── FIR breakdown for Qual Chart drill-down ───────────────────────────────────
// GET /api/fir/officer-breakdown?name=...  — accepted FIRs filed against the officer
router.get("/fir/officer-breakdown", async (req, res): Promise<void> => {
  const name = (req.query.name as string | undefined)?.trim();
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (isMysqlDatabaseUrl) {
    const rows = await mysqlQuery<{
      id: number;
      complainant_name: string | null;
      complainant_cid: string | null;
      complainant_contact: string | null;
      event_description: string | null;
      suspect_details: string | null;
      evidence: string | null;
      officer_name: string | null;
      accepted_by: string | null;
      accepted_at: unknown;
      posted_at: unknown;
    }>(
      `SELECT id, complainant_name, complainant_cid, complainant_contact, event_description,
              suspect_details, evidence, officer_name, accepted_by, accepted_at, posted_at
       FROM pd_fir
       WHERE LOWER(officer_name) = LOWER(?) AND status = 'accepted'
       ORDER BY accepted_at DESC, id DESC`,
      [name],
    );
    res.json(rows.map((row) => ({
      id: Number(row.id),
      complainantName: row.complainant_name ?? null,
      complainantCid: row.complainant_cid ?? null,
      complainantContact: row.complainant_contact ?? null,
      eventDescription: row.event_description ?? null,
      suspectDetails: row.suspect_details ?? null,
      evidence: row.evidence ?? null,
      officerName: row.officer_name ?? null,
      acceptedBy: row.accepted_by ?? null,
      acceptedAt: asDate(row.accepted_at),
      postedAt: asDate(row.posted_at),
    })));
    return;
  }
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
    .where(sql`${pdFirTable.officerName} ILIKE ${name} AND ${pdFirTable.status} = 'accepted'`)
    .orderBy(desc(pdFirTable.acceptedAt));
  res.json(rows);
});

router.get("/fir/stats", async (_req, res): Promise<void> => {
  if (isMysqlDatabaseUrl) {
    const firRows = await getMysqlFirRows(undefined, 10000);
    const topOfficerMap = new Map<string, number>();
    for (const fir of firRows) {
      const officerName = fir.officerName?.trim();
      if (!officerName) continue;
      topOfficerMap.set(officerName, (topOfficerMap.get(officerName) ?? 0) + 1);
    }
    const topOfficers = [...topOfficerMap.entries()]
      .map(([officer_name, firs]) => ({ officer_name, firs }))
      .sort((a, b) => b.firs - a.firs)
      .slice(0, 10);
    res.json({
      total: firRows.length,
      topOfficers,
    });
    return;
  }
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdFirTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS firs FROM pd_fir WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY firs DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

export default router;
