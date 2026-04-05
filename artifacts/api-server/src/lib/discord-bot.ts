import { Client, GatewayIntentBits, Message, Collection, TextChannel } from "discord.js";
import { db } from "@workspace/db";
import {
  discordDutyEventsTable,
  emsDutyLogsTable,
  officersTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "./logger";

const CHANNEL_ID = process.env.DISCORD_TIMESTAMP_CHANNEL_ID!;
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

  let totalSecs = 0;
  let lastOn: Date | null = null;

  for (const ev of events) {
    if (ev.eventType === "on") {
      lastOn = new Date(ev.eventAt);
    } else if (ev.eventType === "off" && lastOn) {
      const diff = Math.max(0, (new Date(ev.eventAt).getTime() - lastOn.getTime()) / 1000);
      totalSecs += Math.floor(diff);
      lastOn = null;
    }
  }

  const dutyHours = secsToHms(totalSecs);

  const officer = await db
    .select()
    .from(officersTable)
    .where(eq(officersTable.rockstarLicenseId, licenseId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!officer) return;

  const existing = await db
    .select()
    .from(emsDutyLogsTable)
    .where(
      and(
        eq(emsDutyLogsTable.csNumber, officer.callSign),
        eq(emsDutyLogsTable.weekPeriod, weekPeriod)
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
    await db.insert(emsDutyLogsTable).values({
      csNumber: officer.callSign,
      name: officer.name ?? officer.callSign,
      rank: officer.rank,
      status: officer.status,
      weekPeriod,
      dutyHours,
      shiftType: "ALL",
    });
  }

  logger.info({ licenseId, weekPeriod, dutyHours }, "Updated duty hours");
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

  client.once("ready", async () => {
    logger.info({ tag: client.user?.tag }, "Discord bot connected");

    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error({ CHANNEL_ID }, "Could not find time-stamp channel");
      return;
    }

    await backfillHistory(channel);
  });

  client.on("messageCreate", async (msg) => {
    if (msg.channelId !== CHANNEL_ID) return;
    await processMessage(msg);
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(BOT_TOKEN);
}
