import { Router } from "express";
import { db, pdCitationsTable, siteSettingsTable } from "@workspace/db";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

// ── Settings helpers ────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, key))
    .limit(1);
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(siteSettingsTable).values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
}

async function getWebhookSecret(): Promise<string> {
  const existing = await getSetting("citation_webhook_secret");
  if (existing) return existing;
  const secret = randomUUID().replace(/-/g, "");
  await setSetting("citation_webhook_secret", secret);
  return secret;
}

// ── Google Sheet CSV helpers ─────────────────────────────────────────────────

function extractSheetId(urlOrId: string): string | null {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(urlOrId);
  if (match) return match[1]!;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId.trim())) return urlOrId.trim();
  return null;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field); field = ""; }
      else if (char === '\n') { row.push(field); field = ""; if (row.some(c => c !== "")) rows.push(row); row = []; }
      else if (char !== '\r') { field += char; }
    }
  }
  if (field || row.length > 0) { row.push(field); if (row.some(c => c !== "")) rows.push(row); }
  return rows;
}

function sanitize(val: string | undefined): string | null {
  if (!val) return null;
  const v = val.trim();
  if (v === "" || v.toLowerCase() === "n/a") return null;
  return v;
}

export async function syncFromGoogleSheet(): Promise<{ inserted: number; total: number; error?: string }> {
  const sheetUrl = await getSetting("citation_sheet_url");
  if (!sheetUrl) return { inserted: 0, total: 0, error: "Sheet URL not configured" };

  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return { inserted: 0, total: 0, error: "Invalid Sheet URL" };

  const sheetName = await getSetting("citation_sheet_name") ?? "Citations";
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  let text: string;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) return { inserted: 0, total: 0, error: `Sheet fetch failed: ${res.status} — Make sure the sheet is publicly readable` };
    text = await res.text();
  } catch (err) {
    return { inserted: 0, total: 0, error: `Network error: ${String(err)}` };
  }

  const rows = parseCSV(text);

  // Skip header row if first cell doesn't look like a date
  const dataRows = rows.filter((row, i) => {
    if (i === 0) {
      const first = row[0]?.trim() ?? "";
      return !isNaN(Date.parse(first));
    }
    return true;
  });

  // Track how many rows we've already synced
  const lastSyncedStr = await getSetting("citation_sheet_synced_rows");
  const lastSynced = parseInt(lastSyncedStr ?? "0", 10) || 0;
  const newRows = dataRows.slice(lastSynced);

  let inserted = 0;
  for (const row of newRows) {
    const rawDate = row[0]?.trim() ?? "";
    const postedAt = rawDate ? new Date(rawDate) : new Date();
    if (isNaN(postedAt.getTime())) continue;

    await db.insert(pdCitationsTable).values({
      title:          sanitize(row[1]),
      incident:       sanitize(row[2]),
      location:       sanitize(row[3]),
      evidence:       sanitize(row[4]),
      incidentReport: sanitize(row[5]),
      suspectName:    sanitize(row[6]),
      suspectCid:     sanitize(row[7]),
      suspectContact: sanitize(row[8]),
      charges:        sanitize(row[9]),
      officerName:    sanitize(row[10]),
      rawContent:     row.join(", ").slice(0, 4000),
      postedAt,
    }).onConflictDoNothing();
    inserted++;
  }

  await setSetting("citation_sheet_synced_rows", String(dataRows.length));
  await setSetting("citation_sheet_last_sync", new Date().toISOString());

  return { inserted, total: dataRows.length };
}

// ── Auto-sync every 5 minutes ─────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSheetAutoSync() {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    try {
      const result = await syncFromGoogleSheet();
      if (result.inserted > 0) {
        console.log(`[citations] Auto-synced ${result.inserted} new rows from Google Sheet`);
      }
    } catch (err) {
      console.warn("[citations] Auto-sync error:", err);
    }
  }, 5 * 60 * 1000); // every 5 minutes
  console.log("[citations] Google Sheet auto-sync started (every 5 min)");
}

// ── Citation text parser (for webhook ingest) ────────────────────────────────

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

// ── Discord forward ──────────────────────────────────────────────────────────

async function forwardToDiscord(discordWebhookUrl: string, body: Record<string, unknown>): Promise<void> {
  try {
    const isDiscordPayload = "content" in body || "embeds" in body;
    const payload = isDiscordPayload ? body : { content: body.rawContent ?? JSON.stringify(body) };
    await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_err) {
    console.warn("[citations] Discord forward failed:", _err);
  }
}

// ── Public routes ─────────────────────────────────────────────────────────────

router.get("/citations", async (req, res): Promise<void> => {
  const { search, officer, limit: lim } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(lim ?? "100", 10) || 100, 500);
  let query = db.select().from(pdCitationsTable).orderBy(desc(pdCitationsTable.postedAt)).$dynamic();
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.where(or(
      ilike(pdCitationsTable.suspectName, q), ilike(pdCitationsTable.suspectCid, q),
      ilike(pdCitationsTable.charges, q), ilike(pdCitationsTable.officerName, q),
      ilike(pdCitationsTable.title, q), ilike(pdCitationsTable.incident, q),
    ));
  } else if (officer?.trim()) {
    query = query.where(ilike(pdCitationsTable.officerName, `%${officer.trim()}%`));
  }
  res.json(await query.limit(limit));
});

router.get("/citations/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdCitationsTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS citations FROM pd_citations WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY citations DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

// ── Admin: webhook info ───────────────────────────────────────────────────────

router.get("/admin/citations/webhook", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const secret = await getWebhookSecret();
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const webhookUrl = `${proto}://${host}/api/citations/ingest?key=${secret}`;
  const discordForwardUrl = await getSetting("citation_discord_forward_url");
  res.json({ secret, webhookUrl, discordForwardUrl });
});

router.post("/admin/citations/webhook/regenerate", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const newSecret = randomUUID().replace(/-/g, "");
  await setSetting("citation_webhook_secret", newSecret);
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  res.json({ ok: true, secret: newSecret, webhookUrl: `${proto}://${host}/api/citations/ingest?key=${newSecret}` });
});

router.post("/admin/citations/discord-forward", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { url } = req.body as { url: string };
  if (url && !url.startsWith("https://discord.com/api/webhooks/")) {
    res.status(400).json({ error: "Invalid Discord webhook URL" }); return;
  }
  if (url) { await setSetting("citation_discord_forward_url", url); }
  else { await db.delete(siteSettingsTable).where(eq(siteSettingsTable.key, "citation_discord_forward_url")); }
  res.json({ ok: true });
});

// ── Admin: Google Sheet config ────────────────────────────────────────────────

router.get("/admin/citations/sheet", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const sheetUrl  = await getSetting("citation_sheet_url");
  const sheetName = await getSetting("citation_sheet_name") ?? "Citations";
  const lastSync  = await getSetting("citation_sheet_last_sync");
  const syncedRows = await getSetting("citation_sheet_synced_rows");
  res.json({ sheetUrl, sheetName, lastSync, syncedRows: parseInt(syncedRows ?? "0", 10) || 0 });
});

router.post("/admin/citations/sheet", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { url, sheetName } = req.body as { url: string; sheetName?: string };
  if (url) await setSetting("citation_sheet_url", url);
  if (sheetName) await setSetting("citation_sheet_name", sheetName);
  res.json({ ok: true });
});

router.post("/admin/citations/sheet/sync", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await syncFromGoogleSheet();
  res.json(result);
});

router.post("/admin/citations/sheet/reset", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.discordUser) { res.status(401).json({ error: "Unauthorized" }); return; }
  await setSetting("citation_sheet_synced_rows", "0");
  res.json({ ok: true });
});

// ── Webhook ingest ────────────────────────────────────────────────────────────

router.post("/citations/ingest", async (req, res): Promise<void> => {
  const providedKey = (req.query.key as string) ?? req.headers["x-webhook-key"];
  const secret = await getWebhookSecret();
  if (!providedKey || providedKey !== secret) { res.status(403).json({ error: "Invalid webhook key" }); return; }

  const body = req.body as Record<string, unknown>;
  let data: Partial<{
    title: string; incident: string; location: string; evidence: string;
    incidentReport: string; suspectName: string; suspectCid: string;
    suspectContact: string; charges: string; officerName: string; rawContent: string;
  }> = {};

  let textToParse: string | null = null;
  if (typeof body.content === "string" && body.content.trim()) {
    textToParse = body.content;
  } else if (Array.isArray(body.embeds) && body.embeds.length > 0) {
    const embed = body.embeds[0] as Record<string, unknown>;
    const parts: string[] = [];
    if (embed.title) parts.push(String(embed.title));
    if (embed.description) parts.push(String(embed.description));
    if (Array.isArray(embed.fields)) {
      for (const f of embed.fields as Array<{ name: string; value: string }>) parts.push(`${f.name}: ${f.value}`);
    }
    textToParse = parts.join("\n");
  }

  if (textToParse) {
    data = parseCitationText(textToParse);
    data.rawContent = textToParse.slice(0, 4000);
  } else {
    data.title          = body.title as string;
    data.incident       = body.incident as string;
    data.location       = body.location as string;
    data.evidence       = body.evidence as string;
    data.incidentReport = (body.incidentReport ?? body.incident_report ?? body.report) as string;
    data.suspectName    = (body.suspectName ?? body.suspect_name) as string;
    data.suspectCid     = (body.suspectCid ?? body.suspect_cid ?? body.cid) as string;
    data.suspectContact = (body.suspectContact ?? body.suspect_contact ?? body.contact) as string;
    data.charges        = body.charges as string;
    data.officerName    = (body.officerName ?? body.officer_name ?? body.officer) as string;
    data.rawContent     = JSON.stringify(body).slice(0, 4000);
  }

  const postedAt = body.postedAt || body.posted_at || body.timestamp
    ? new Date(String(body.postedAt ?? body.posted_at ?? body.timestamp)) : new Date();
  const messageId = (body.messageId ?? body.message_id ?? body.id) as string | undefined;

  const [inserted] = await db.insert(pdCitationsTable).values({
    discordMessageId: messageId ?? null,
    title: data.title ?? null, incident: data.incident ?? null,
    location: data.location ?? null, evidence: data.evidence ?? null,
    incidentReport: data.incidentReport ?? null, suspectName: data.suspectName ?? null,
    suspectCid: data.suspectCid ?? null, suspectContact: data.suspectContact ?? null,
    charges: data.charges ?? null, officerName: data.officerName ?? null,
    rawContent: data.rawContent ?? null, postedAt,
  }).onConflictDoNothing().returning();

  const discordForwardUrl = await getSetting("citation_discord_forward_url");
  if (discordForwardUrl) await forwardToDiscord(discordForwardUrl, body);

  if (!inserted) { res.json({ ok: true, duplicate: true }); return; }
  res.json({ ok: true, id: inserted.id });
});

export default router;
