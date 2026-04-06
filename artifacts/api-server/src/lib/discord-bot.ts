import { Client, GatewayIntentBits, Message, Collection, TextChannel } from "discord.js";
import { db } from "@workspace/db";
import {
  discordDutyEventsTable,
  emsDutyLogsTable,
  pdDutyLogsTable,
  officersTable,
  shiftConfigsTable,
  pdCitationsTable,
} from "@workspace/db";
import { eq, and, asc, desc, or, lt, gte, lte } from "drizzle-orm";
import { logger } from "./logger";

const CHANNEL_ID = process.env.DISCORD_TIMESTAMP_CHANNEL_ID!;
const CITATION_CHANNEL_ID = process.env.DISCORD_CITATION_CHANNEL_ID ?? "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekPeriod(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  return `${fmt(monday)}-${fmt(sunday)}`;
}

function secsToHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hmsToSecs(hms: string | null | undefined): number {
  if (!hms) return 0;
  const parts = hms.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

interface ParsedEvent {
  officerName: string;
  licenseId: string;
  rank: string;
  eventType: "on" | "off";
}

function parseEventText(text: string): ParsedEvent | null {
  if (!text) return null;
  const onOff = /went\s+(on|off)-duty/i.exec(text);
  if (!onOff) return null;
  const eventType = onOff[1]!.toLowerCase() === "on" ? "on" : "off";

  const licenseMatch =
    /\((?:license:)?([a-f0-9]{32,64})\)/i.exec(text);
  if (!licenseMatch) return null;
  const licenseId = licenseMatch[1]!;

  const rankMatch = /went\s+(?:on|off)-duty\.\s*\(([^)]+)\)/i.exec(text);
  const rank = rankMatch ? rankMatch[1]!.trim() : "Unknown";

  const nameMatch = /^(.+?)\s*\[(\d+)\]/.exec(text.trim());
  const officerName = nameMatch ? nameMatch[1]!.trim() : text.split("(")[0]!.trim();

  return { officerName, licenseId, rank, eventType };
}

// Extract all parseable text from a Discord message
function getMessageTexts(msg: Message): string[] {
  const texts: string[] = [];
  if (msg.content) texts.push(msg.content);
  for (const embed of msg.embeds) {
    if (embed.description) texts.push(embed.description);
    if (embed.title) texts.push(embed.title);
  }
  return texts;
}

// ── Shift window definitions (loaded from DB) ───────────────────────────────
// Fallback used only if DB is empty
const DEFAULT_SHIFT_WINDOWS: Record<string, [number, number]> = {
  EVENING:  [20, 22],
  NIGHT:    [22, 2],
  MIDNIGHT: [0,  6],
  FULL:     [20, 2],
};

async function getShiftWindows(): Promise<Record<string, [number, number]>> {
  const rows = await db.select().from(shiftConfigsTable);
  if (rows.length === 0) return DEFAULT_SHIFT_WINDOWS;
  const map: Record<string, [number, number]> = {};
  for (const r of rows) map[r.key] = [r.startHour, r.endHour];
  return map;
}

function computeShiftOverlapSecs(
  sessionStart: Date,
  sessionEnd: Date,
  shiftStartHour: number,
  shiftEndHour: number
): number {
  const wraps = shiftEndHour < shiftStartHour;
  let total = 0;
  const day = new Date(sessionStart.getTime());
  day.setUTCHours(0, 0, 0, 0);
  const lastDay = new Date(sessionEnd.getTime());
  lastDay.setUTCHours(0, 0, 0, 0);
  while (day <= lastDay) {
    const ms = day.getTime();
    const wStart = ms + shiftStartHour * 3_600_000;
    const wEnd   = wraps
      ? ms + (24 + shiftEndHour) * 3_600_000
      : ms + shiftEndHour * 3_600_000;
    const oStart = Math.max(sessionStart.getTime(), wStart);
    const oEnd   = Math.min(sessionEnd.getTime(),   wEnd);
    if (oEnd > oStart) total += (oEnd - oStart) / 1000;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return Math.floor(total);
}

async function upsertDutyLog(
  callSign: string,
  name: string,
  rank: string,
  status: string,
  weekPeriod: string,
  shiftType: string,
  dutyHours: string
): Promise<void> {
  const existing = await db
    .select({ id: emsDutyLogsTable.id })
    .from(emsDutyLogsTable)
    .where(
      and(
        eq(emsDutyLogsTable.csNumber, callSign),
        eq(emsDutyLogsTable.weekPeriod, weekPeriod),
        eq(emsDutyLogsTable.shiftType, shiftType)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (existing) {
    await db
      .update(emsDutyLogsTable)
      .set({ dutyHours })
      .where(eq(emsDutyLogsTable.id, existing.id));
  } else {
    // Determine duty year: extract end-month from "MM/DD-MM/DD" and compare to current month
    // If end-month > current month, the data belongs to the previous year
    const now = new Date();
    const endMonth = parseInt(weekPeriod.slice(6, 8), 10);
    const dutyYear = endMonth > now.getMonth() + 1
      ? String(now.getFullYear() - 1)
      : String(now.getFullYear());
    await db.insert(emsDutyLogsTable).values({
      csNumber: callSign, name, rank, status, weekPeriod, dutyYear, dutyHours, shiftType,
    });
  }
}

// ── Duty-hour recompute ────────────────────────────────────────────────────

async function recomputeDutyHours(licenseId: string, weekPeriod: string) {
  const events = await db
    .select()
    .from(discordDutyEventsTable)
    .where(
      and(
        eq(discordDutyEventsTable.licenseId, licenseId),
        eq(discordDutyEventsTable.weekPeriod, weekPeriod)
      )
    )
    .orderBy(asc(discordDutyEventsTable.eventAt));

  // Cross-week carry-over: if the first event of this week is "off", look back for
  // an unmatched "on" from a prior week (handles sessions that span the BST week boundary).
  let carryOnTime: Date | null = null;
  if (events.length > 0 && events[0]!.eventType === "off") {
    const firstOffAt = events[0]!.eventAt;
    // Find the most recent "on" before this week's first "off"
    const lastOnRow = await db
      .select({ eventAt: discordDutyEventsTable.eventAt })
      .from(discordDutyEventsTable)
      .where(and(eq(discordDutyEventsTable.licenseId, licenseId), eq(discordDutyEventsTable.eventType, "on"), lt(discordDutyEventsTable.eventAt, firstOffAt)))
      .orderBy(desc(discordDutyEventsTable.eventAt))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (lastOnRow) {
      // Find the most recent "off" before this week's first "off"
      const lastOffRow = await db
        .select({ eventAt: discordDutyEventsTable.eventAt })
        .from(discordDutyEventsTable)
        .where(and(eq(discordDutyEventsTable.licenseId, licenseId), eq(discordDutyEventsTable.eventType, "off"), lt(discordDutyEventsTable.eventAt, firstOffAt)))
        .orderBy(desc(discordDutyEventsTable.eventAt))
        .limit(1)
        .then((r) => r[0] ?? null);

      // Session is open only if the last "on" is more recent than the last "off"
      if (!lastOffRow || new Date(lastOnRow.eventAt) > new Date(lastOffRow.eventAt)) {
        carryOnTime = new Date(lastOnRow.eventAt);
      }
    }
  }

  // Build on/off sessions
  const sessions: { start: Date; end: Date }[] = [];
  let lastOn: Date | null = carryOnTime;
  for (const ev of events) {
    if (ev.eventType === "on") {
      lastOn = new Date(ev.eventAt);
    } else if (ev.eventType === "off" && lastOn) {
      sessions.push({ start: lastOn, end: new Date(ev.eventAt) });
      lastOn = null;
    }
  }

  // Compute total and per-shift seconds
  const SHIFT_WINDOWS = await getShiftWindows();
  let totalSecs = 0;
  const shiftSecs: Record<string, number> = {};
  for (const key of Object.keys(SHIFT_WINDOWS)) shiftSecs[key] = 0;
  for (const { start, end } of sessions) {
    totalSecs += Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    for (const [st, [sh, eh]] of Object.entries(SHIFT_WINDOWS)) {
      shiftSecs[st]! += computeShiftOverlapSecs(start, end, sh, eh);
    }
  }

  const officer = await db
    .select()
    .from(officersTable)
    .where(
      or(
        eq(officersTable.rockstarLicenseId, licenseId),
        eq(officersTable.rockstarLicenseId, `license:${licenseId}`)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!officer) return;

  const cs   = officer.callSign;
  const name = officer.name ?? officer.callSign;
  const rank = officer.rank ?? "Unknown";
  const status = officer.status;

  await upsertDutyLog(cs, name, rank, status, weekPeriod, "ALL", secsToHms(totalSecs));
  for (const st of Object.keys(SHIFT_WINDOWS)) {
    await upsertDutyLog(cs, name, rank, status, weekPeriod, st, secsToHms(shiftSecs[st]!));
  }

  // ── Sync individual sessions to pd_duty_logs ──────────────────────────────
  // Derive duty year from weekPeriod (same logic as upsertDutyLog)
  const now2 = new Date();
  const endMonthWp = parseInt(weekPeriod.slice(6, 8), 10);
  const dutyYear2 = endMonthWp > now2.getMonth() + 1
    ? String(now2.getFullYear() - 1)
    : String(now2.getFullYear());

  // Build ISO date strings for Monday and Sunday of this week
  const [startMm, startDd] = [weekPeriod.slice(0, 2), weekPeriod.slice(3, 5)];
  const [endMm, endDd] = [weekPeriod.slice(6, 8), weekPeriod.slice(9, 11)];
  // Cross-year: if Monday month > Sunday month (e.g. "12/30-01/05"), Monday is prior year
  const startYear = parseInt(startMm) > endMonthWp
    ? String(parseInt(dutyYear2) - 1)
    : dutyYear2;
  const weekDateStart = `${startYear}-${startMm}-${startDd}`;
  const weekDateEnd   = `${dutyYear2}-${endMm}-${endDd}`;

  // Load shift config labels to assign the correct shift to each session
  const shiftConfigRows = await db
    .select({ key: shiftConfigsTable.key, label: shiftConfigsTable.label })
    .from(shiftConfigsTable);
  const shiftLabelMap = Object.fromEntries(shiftConfigRows.map((r) => [r.key, r.label]));

  // Determine the shift label for a session.
  // "Atomic" shifts are all but the widest window (the widest is the composite).
  // If a session overlaps only one atomic shift → use that label.
  // If it overlaps multiple atomic shifts → use the composite label.
  // If it overlaps no atomic shift → fall back to composite/default.
  function sessionShiftLabel(start: Date, end: Date): string {
    // Use 40% of session duration as the threshold (capped at 15 min) so
    // even very short sessions get classified correctly.
    const sessionSecs = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000));
    const MIN_OVERLAP = Math.min(900, Math.floor(sessionSecs * 0.4));
    const entries = Object.entries(SHIFT_WINDOWS) as [string, [number, number]][];
    const sized = entries.map(([key, [sh, eh]]) => ({
      key,
      size: eh >= sh ? eh - sh : 24 - sh + eh,
      overlap: computeShiftOverlapSecs(start, end, sh, eh),
    })).sort((a, b) => a.size - b.size);

    const maxSize = sized[sized.length - 1]?.size ?? 0;
    // Atomic = all shifts except the widest (the composite "Full Shift")
    const atomicShifts = sized.filter((s) => s.size < maxSize);
    const matched = atomicShifts.filter((s) => s.overlap >= MIN_OVERLAP);

    if (matched.length === 1) {
      return shiftLabelMap[matched[0]!.key] ?? "Full";
    }
    if (matched.length > 1) {
      // Session spans multiple atomic shifts — use the composite label
      const composite = sized.find((s) => s.size === maxSize && s.overlap > 0);
      return composite ? (shiftLabelMap[composite.key] ?? "Full Shift") : "Full Shift";
    }
    // No atomic shift overlap — session is outside defined shift windows
    const composite = sized.find((s) => s.size === maxSize && s.overlap > 0);
    return composite ? (shiftLabelMap[composite.key] ?? "Full") : "Full";
  }

  // Replace all bot-imported sessions for this officer + week
  await db
    .delete(pdDutyLogsTable)
    .where(
      and(
        eq(pdDutyLogsTable.csNumber, cs),
        eq(pdDutyLogsTable.notes, "discord"),
        gte(pdDutyLogsTable.logDate, weekDateStart),
        lte(pdDutyLogsTable.logDate, weekDateEnd)
      )
    );

  if (sessions.length > 0) {
    await db.insert(pdDutyLogsTable).values(
      sessions.map(({ start, end }) => ({
        logDate:     start.toISOString().split("T")[0]!,
        startTime:   start.toISOString().substring(11, 16),
        endTime:     end.toISOString().substring(11, 16),
        csNumber:    cs,
        officerName: name,
        rank,
        shiftType:   sessionShiftLabel(start, end),
        duration:    secsToHms(Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))),
        notes:       "discord",
      }))
    );
  }

  logger.info({ licenseId, weekPeriod, totalSecs }, "Updated duty hours");
}

// ── Message processor ──────────────────────────────────────────────────────

async function processMessage(msg: Message) {
  const texts = getMessageTexts(msg);
  for (const text of texts) {
    const parsed = parseEventText(text);
    if (!parsed) continue;

    const eventAt = msg.createdAt;
    const weekPeriod = getWeekPeriod(eventAt);

    try {
      await db
        .insert(discordDutyEventsTable)
        .values({
          licenseId: parsed.licenseId,
          officerName: parsed.officerName,
          rank: parsed.rank,
          eventType: parsed.eventType,
          eventAt,
          discordMessageId: msg.id,
          weekPeriod,
        })
        .onConflictDoNothing();

      await recomputeDutyHours(parsed.licenseId, weekPeriod);
    } catch (err) {
      logger.error({ err, messageId: msg.id }, "Error processing message");
    }
    break;
  }
}

// ── Historical backfill ────────────────────────────────────────────────────

async function backfillHistory(channel: TextChannel) {
  logger.info({ channelId: channel.id }, "Starting history backfill");
  let before: string | undefined;
  let processed = 0;

  // backfill up to 5 000 messages (50 batches of 100)
  for (let i = 0; i < 50; i++) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (before) options.before = before;

    const msgs: Collection<string, Message> = await channel.messages.fetch(options);
    if (msgs.size === 0) break;

    const sorted = [...msgs.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    for (const msg of sorted) {
      await processMessage(msg);
      processed++;
    }

    const oldest = sorted[0];
    if (!oldest) break;
    before = oldest.id;

    if (msgs.size < 100) break;
  }

  logger.info({ processed }, "History backfill complete");
}

// ── Recompute all ──────────────────────────────────────────────────────────

export async function recomputeAllDutyHours(): Promise<{ pairs: number; updated: number }> {
  const rows = await db
    .selectDistinct({
      licenseId: discordDutyEventsTable.licenseId,
      weekPeriod: discordDutyEventsTable.weekPeriod,
    })
    .from(discordDutyEventsTable);

  let updated = 0;
  for (const { licenseId, weekPeriod } of rows) {
    try {
      await recomputeDutyHours(licenseId, weekPeriod);
      updated++;
    } catch (err) {
      logger.error({ err, licenseId, weekPeriod }, "recompute error");
    }
  }

  logger.info({ pairs: rows.length, updated }, "Full recompute complete");
  return { pairs: rows.length, updated };
}

// ── Citation parser ────────────────────────────────────────────────────────

interface ParsedCitation {
  title: string | null;
  incident: string | null;
  location: string | null;
  evidence: string | null;
  incidentReport: string | null;
  suspectName: string | null;
  suspectCid: string | null;
  suspectContact: string | null;
  charges: string | null;
  officerName: string | null;
}

function field(text: string, ...keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`${key}\\s*:([\\s\\S]*?)(?=\\n[A-Z][a-zA-Z ']+\\s*:|$)`, "i");
    const m = re.exec(text);
    if (m) return m[1]!.trim() || null;
  }
  return null;
}

function parseCitation(text: string): ParsedCitation {
  return {
    title:          field(text, "Title", "Code"),
    incident:       field(text, "Incident"),
    location:       field(text, "Location"),
    evidence:       field(text, "Evidence"),
    incidentReport: field(text, "Incident Report"),
    suspectName:    field(text, "Suspect'?s? Name", "Suspect Name"),
    suspectCid:     field(text, "Suspect'?s? CID", "Suspect CID", "CID"),
    suspectContact: field(text, "Suspect'?s? Contact", "Contact"),
    charges:        field(text, "Charges", "Charge"),
    officerName:    field(text, "Officer"),
  };
}

function isCitationMessage(text: string): boolean {
  return /citation|pd report|new pd/i.test(text) ||
    (/charges?/i.test(text) && /officer/i.test(text) && /suspect/i.test(text));
}

async function processCitationMessage(msg: Message) {
  const allTexts: string[] = [];
  if (msg.content) allTexts.push(msg.content);
  for (const embed of msg.embeds) {
    const parts: string[] = [];
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    for (const f of embed.fields ?? []) parts.push(`${f.name}: ${f.value}`);
    if (parts.length) allTexts.push(parts.join("\n"));
  }

  const combined = allTexts.join("\n");
  if (!isCitationMessage(combined)) return;

  const parsed = parseCitation(combined);

  try {
    await db.insert(pdCitationsTable).values({
      discordMessageId: msg.id,
      title:          parsed.title,
      incident:       parsed.incident,
      location:       parsed.location,
      evidence:       parsed.evidence,
      incidentReport: parsed.incidentReport,
      suspectName:    parsed.suspectName,
      suspectCid:     parsed.suspectCid,
      suspectContact: parsed.suspectContact,
      charges:        parsed.charges,
      officerName:    parsed.officerName,
      rawContent:     combined.slice(0, 4000),
      postedAt:       msg.createdAt,
    }).onConflictDoNothing();
  } catch (err) {
    logger.error({ err, messageId: msg.id }, "Error saving citation");
  }
}

async function backfillCitations(channel: TextChannel) {
  logger.info({ channelId: channel.id }, "Starting citation backfill");
  let before: string | undefined;
  let total = 0;

  for (let i = 0; i < 50; i++) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (before) options.before = before;

    const msgs: Collection<string, Message> = await channel.messages.fetch(options);
    if (msgs.size === 0) break;

    const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const msg of sorted) {
      await processCitationMessage(msg);
      total++;
    }

    const oldest = sorted[0];
    if (!oldest) break;
    before = oldest.id;
    if (msgs.size < 100) break;
  }

  logger.info({ total }, "Citation backfill complete");
}

// ── Bot start ──────────────────────────────────────────────────────────────

export async function startDiscordBot() {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    logger.warn("DISCORD_BOT_TOKEN or DISCORD_TIMESTAMP_CHANNEL_ID not set — bot disabled");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("clientReady", async () => {
    logger.info({ tag: client.user?.tag }, "Discord bot connected");

    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error({ CHANNEL_ID }, "Could not find time-stamp channel");
    } else {
      await backfillHistory(channel);
    }

    if (CITATION_CHANNEL_ID) {
      const citationChannel = await client.channels.fetch(CITATION_CHANNEL_ID).catch(() => null);
      if (!citationChannel || !(citationChannel instanceof TextChannel)) {
        logger.warn({ CITATION_CHANNEL_ID }, "Could not find citation channel — set DISCORD_CITATION_CHANNEL_ID");
      } else {
        await backfillCitations(citationChannel);
      }
    } else {
      logger.warn("DISCORD_CITATION_CHANNEL_ID not set — citation sync disabled");
    }
  });

  client.on("messageCreate", async (msg) => {
    if (msg.channelId === CHANNEL_ID) {
      await processMessage(msg);
    } else if (CITATION_CHANNEL_ID && msg.channelId === CITATION_CHANNEL_ID) {
      await processCitationMessage(msg);
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(BOT_TOKEN);
}
