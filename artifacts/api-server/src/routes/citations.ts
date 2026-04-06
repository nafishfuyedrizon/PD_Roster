import { Router } from "express";
import { db, pdCitationsTable, siteSettingsTable } from "@workspace/db";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

async function getWebhookSecret(): Promise<string> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "citation_webhook_secret"))
    .limit(1);

  if (row?.value) {
    try { return JSON.parse(row.value); } catch { return row.value; }
  }

  // Auto-generate and persist
  const secret = randomUUID().replace(/-/g, "");
  await db.insert(siteSettingsTable).values({
    key: "citation_webhook_secret",
    value: JSON.stringify(secret),
  }).onConflictDoUpdate({
    target: siteSettingsTable.key,
    set: { value: JSON.stringify(secret), updatedAt: new Date() },
  });
  return secret;
}

function parseCitationText(text: string): Partial<{
  title: string; incident: string; location: string;
  evidence: string; incidentReport: string;
  suspectName: string; suspectCid: string; suspectContact: string;
  charges: string; officerName: string;
}> {
  function field(keys: string[]): string | undefined {
    for (const key of keys) {
      const re = new RegExp(`${key}\\s*:([\\s\\S]*?)(?=\\n[A-Za-z ']+\\s*:|$)`, "i");
      const m = re.exec(text);
      if (m) { const v = m[1]!.trim(); if (v) return v; }
    }
    return undefined;
  }
  return {
    title:          field(["Title", "Code"]),
    incident:       field(["Incident"]),
    location:       field(["Location"]),
    evidence:       field(["Evidence"]),
    incidentReport: field(["Incident Report"]),
    suspectName:    field(["Suspect(?:'?s?)? Name", "Suspect Name"]),
    suspectCid:     field(["Suspect(?:'?s?)? CID", "CID"]),
    suspectContact: field(["Suspect(?:'?s?)? Contact", "Contact"]),
    charges:        field(["Charges", "Charge"]),
    officerName:    field(["Officer"]),
  };
}

// ── Public citation list ────────────────────────────────────────────────────

router.get("/citations", async (req, res): Promise<void> => {
  const { search, officer, limit: lim } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(lim ?? "100", 10) || 100, 500);

  let query = db.select().from(pdCitationsTable).orderBy(desc(pdCitationsTable.postedAt)).$dynamic();

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.where(
      or(
        ilike(pdCitationsTable.suspectName, q),
        ilike(pdCitationsTable.suspectCid, q),
        ilike(pdCitationsTable.charges, q),
        ilike(pdCitationsTable.officerName, q),
        ilike(pdCitationsTable.title, q),
        ilike(pdCitationsTable.incident, q),
      )
    );
  } else if (officer?.trim()) {
    query = query.where(ilike(pdCitationsTable.officerName, `%${officer.trim()}%`));
  }

  const rows = await query.limit(limit);
  res.json(rows);
});

router.get("/citations/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdCitationsTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS citations FROM pd_citations WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY citations DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

// ── Admin: get webhook info ─────────────────────────────────────────────────

router.get("/admin/citations/webhook", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secret = await getWebhookSecret();
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = `${proto}://${host}`;
  const webhookUrl = `${baseUrl}/api/citations/ingest?key=${secret}`;

  res.json({ secret, webhookUrl });
});

// ── Admin: regenerate secret ────────────────────────────────────────────────

router.post("/admin/citations/webhook/regenerate", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const newSecret = randomUUID().replace(/-/g, "");
  await db.insert(siteSettingsTable).values({
    key: "citation_webhook_secret",
    value: JSON.stringify(newSecret),
  }).onConflictDoUpdate({
    target: siteSettingsTable.key,
    set: { value: JSON.stringify(newSecret), updatedAt: new Date() },
  });

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = `${proto}://${host}`;
  const webhookUrl = `${baseUrl}/api/citations/ingest?key=${newSecret}`;

  res.json({ ok: true, secret: newSecret, webhookUrl });
});

// ── Webhook ingest endpoint (no session auth — uses secret key) ─────────────

router.post("/citations/ingest", async (req, res): Promise<void> => {
  const providedKey = (req.query.key as string) ?? req.headers["x-webhook-key"];
  const secret = await getWebhookSecret();

  if (!providedKey || providedKey !== secret) {
    res.status(403).json({ error: "Invalid webhook key" });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Support two modes:
  // 1. Structured JSON: fields sent directly
  // 2. Raw Discord content: body.content (string) to be parsed
  let data: Partial<{
    title: string; incident: string; location: string;
    evidence: string; incidentReport: string;
    suspectName: string; suspectCid: string; suspectContact: string;
    charges: string; officerName: string; rawContent: string;
    postedAt: string; messageId: string;
  }> = {};

  if (typeof body.content === "string") {
    // Parse raw Discord message content
    data = parseCitationText(body.content);
    data.rawContent = (body.content as string).slice(0, 4000);
  } else {
    // Structured fields
    data.title          = body.title as string;
    data.incident       = body.incident as string;
    data.location       = body.location as string;
    data.evidence       = body.evidence as string;
    data.incidentReport = (body.incidentReport ?? body.incident_report) as string;
    data.suspectName    = (body.suspectName ?? body.suspect_name) as string;
    data.suspectCid     = (body.suspectCid ?? body.suspect_cid ?? body.cid) as string;
    data.suspectContact = (body.suspectContact ?? body.suspect_contact) as string;
    data.charges        = body.charges as string;
    data.officerName    = (body.officerName ?? body.officer_name ?? body.officer) as string;
    data.rawContent     = JSON.stringify(body).slice(0, 4000);
  }

  const postedAt = body.postedAt || body.posted_at || body.timestamp
    ? new Date(String(body.postedAt ?? body.posted_at ?? body.timestamp))
    : new Date();

  const messageId = (body.messageId ?? body.message_id ?? body.id) as string | undefined;

  const [inserted] = await db.insert(pdCitationsTable).values({
    discordMessageId: messageId ?? null,
    title:          data.title ?? null,
    incident:       data.incident ?? null,
    location:       data.location ?? null,
    evidence:       data.evidence ?? null,
    incidentReport: data.incidentReport ?? null,
    suspectName:    data.suspectName ?? null,
    suspectCid:     data.suspectCid ?? null,
    suspectContact: data.suspectContact ?? null,
    charges:        data.charges ?? null,
    officerName:    data.officerName ?? null,
    rawContent:     data.rawContent ?? null,
    postedAt,
  }).onConflictDoNothing().returning();

  if (!inserted) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  res.json({ ok: true, id: inserted.id });
});

export default router;
