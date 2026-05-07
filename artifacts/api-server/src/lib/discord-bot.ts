import { Client, GatewayIntentBits, Message, Collection, TextChannel, ChannelType } from "discord.js";
import { broadcastFirEvent } from "../routes/fir";
import { db } from "@workspace/db";
import {
  discordDutyEventsTable,
  emsDutyLogsTable,
  pdDutyLogsTable,
  officersTable,
  shiftConfigsTable,
  pdCitationsTable,
  pdFirTable,
  adminLogsTable,
  type FirThreadMessage,
} from "@workspace/db";
import { eq, and, asc, desc, or, lt, gte, lte } from "drizzle-orm";
import { logger } from "./logger";
import { findOfficerByDutyIdentity } from "./duty-officer-match";
import {
  getMysqlOfficers,
  getMysqlShiftConfigs,
  getNextMysqlId,
  isMysqlDatabaseUrl,
  mysqlExecute,
  mysqlQuery,
} from "./pd-mysql-read.js";

async function botLog(actionType: string, entityType: string, entityName: string | null, changes: Record<string, unknown> | null = null) {
  try {
    if (isMysqlDatabaseUrl) {
      const nextId = await getNextMysqlId("pd_admin_logs");
      await mysqlExecute(
        `INSERT INTO pd_admin_logs
          (id, action_type, entity_type, entity_id, entity_name, changed_by, changed_by_uid, changes, created_at)
         VALUES (?, ?, ?, NULL, ?, 'Discord Bot', NULL, ?, NOW())`,
        [nextId, actionType, entityType, entityName, changes ? JSON.stringify(changes) : null],
      );
      return;
    }
    await db.insert(adminLogsTable).values({
      actionType,
      entityType,
      entityId: null,
      entityName,
      changedBy: "Discord Bot",
      changedByUid: null,
      changes: changes as any,
    });
  } catch (_) {}
}

const CHANNEL_ID = process.env.DISCORD_TIMESTAMP_CHANNEL_ID ?? "";
const CITATION_CHANNEL_ID = process.env.DISCORD_CITATION_CHANNEL_ID ?? "";
const FIR_CHANNEL_ID = process.env.DISCORD_FIR_CHANNEL_ID ?? "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const BACKFILL_MONTHS = Math.max(1, Number.parseInt(process.env.PD_REGISTRAR_BACKFILL_MONTHS ?? "3", 10) || 3);
const MAX_BACKFILL_BATCHES = Math.max(1, Number.parseInt(process.env.PD_REGISTRAR_MAX_BACKFILL_BATCHES ?? "500", 10) || 500);
const RECENT_RESCAN_LIMIT = Math.max(1, Math.min(100, Number.parseInt(process.env.PD_REGISTRAR_RECENT_RESCAN_LIMIT ?? "100", 10) || 100));
const RECENT_RESCAN_INTERVAL_MS = Math.max(5000, Number.parseInt(process.env.PD_REGISTRAR_RECENT_RESCAN_INTERVAL_MS ?? "30000", 10) || 30000);
const SECONDARY_RECENT_RESCAN_LIMIT = Math.max(1, Math.min(10, Number.parseInt(process.env.PD_REGISTRAR_SECONDARY_RESCAN_LIMIT ?? "10", 10) || 10));
let dutySyncEnabled = true;

function isSafePdDutyChannelName(name: string | null | undefined): boolean {
  const value = (name ?? "").toLowerCase();
  const normalized = value.replace(/[\s_-]+/g, "");
  if (!value) return false;
  if (value.includes("ems")) return false;
  return (
    value.includes("pd") ||
    value.includes("police") ||
    value.includes("time-stamp") ||
    value.includes("time stamp") ||
    normalized.includes("timestamp")
  );
}

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
  if (isMysqlDatabaseUrl) {
    const rows = await getMysqlShiftConfigs();
    if (rows.length === 0) return DEFAULT_SHIFT_WINDOWS;
    return Object.fromEntries(rows.map((row) => [row.key, [row.startHour, row.endHour]]));
  }
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
  if (isMysqlDatabaseUrl) {
    const existing = await mysqlQuery<{ id: number }>(
      `SELECT id
       FROM pd_duty_hour_totals
       WHERE cs_number = ? AND week_period = ? AND shift_type = ?
       LIMIT 1`,
      [callSign, weekPeriod, shiftType],
    ).then((rows) => rows[0] ?? null);

    if (existing) {
      await mysqlExecute(
        `UPDATE pd_duty_hour_totals
         SET name = ?, rank = ?, status = ?, duty_hours = ?
         WHERE id = ?`,
        [name, rank, status, dutyHours, existing.id],
      );
      return;
    }

    const now = new Date();
    const endMonth = parseInt(weekPeriod.slice(6, 8), 10);
    const dutyYear = endMonth > now.getMonth() + 1
      ? String(now.getFullYear() - 1)
      : String(now.getFullYear());
    const nextId = await getNextMysqlId("pd_duty_hour_totals");
    await mysqlExecute(
      `INSERT INTO pd_duty_hour_totals
        (id, cs_number, name, rank, status, week_period, duty_year, duty_hours, shift_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [nextId, callSign, name, rank, status, weekPeriod, dutyYear, dutyHours, shiftType],
    );
    return;
  }

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
  const events = isMysqlDatabaseUrl
    ? await mysqlQuery<{
        id: number;
        license_id: string;
        officer_name: string | null;
        rank: string | null;
        event_type: "on" | "off";
        event_at: string | Date;
        discord_message_id: string | null;
        week_period: string;
      }>(
        `SELECT *
         FROM pd_discord_duty_events
         WHERE license_id = ? AND week_period = ?
         ORDER BY event_at ASC, id ASC`,
        [licenseId, weekPeriod],
      ).then((rows) =>
        rows.map((row) => ({
          id: row.id,
          licenseId: row.license_id,
          officerName: row.officer_name ?? "",
          rank: row.rank ?? "",
          eventType: row.event_type,
          eventAt: new Date(row.event_at),
          discordMessageId: row.discord_message_id ?? "",
          weekPeriod: row.week_period,
        })),
      )
    : await db
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
    const lastOnRow = isMysqlDatabaseUrl
      ? await mysqlQuery<{ event_at: string | Date }>(
          `SELECT event_at
           FROM pd_discord_duty_events
           WHERE license_id = ? AND event_type = 'on' AND event_at < ?
           ORDER BY event_at DESC, id DESC
           LIMIT 1`,
          [licenseId, firstOffAt],
        ).then((rows) => rows[0] ? { eventAt: new Date(rows[0].event_at) } : null)
      : await db
          .select({ eventAt: discordDutyEventsTable.eventAt })
          .from(discordDutyEventsTable)
          .where(and(eq(discordDutyEventsTable.licenseId, licenseId), eq(discordDutyEventsTable.eventType, "on"), lt(discordDutyEventsTable.eventAt, firstOffAt)))
          .orderBy(desc(discordDutyEventsTable.eventAt))
          .limit(1)
          .then((r) => r[0] ?? null);

    if (lastOnRow) {
      // Find the most recent "off" before this week's first "off"
      const lastOffRow = isMysqlDatabaseUrl
        ? await mysqlQuery<{ event_at: string | Date }>(
            `SELECT event_at
             FROM pd_discord_duty_events
             WHERE license_id = ? AND event_type = 'off' AND event_at < ?
             ORDER BY event_at DESC, id DESC
             LIMIT 1`,
            [licenseId, firstOffAt],
          ).then((rows) => rows[0] ? { eventAt: new Date(rows[0].event_at) } : null)
        : await db
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

  const officer = await (isMysqlDatabaseUrl
    ? getMysqlOfficers()
    : db
        .select({
          id: officersTable.id,
          callSign: officersTable.callSign,
          name: officersTable.name,
          rank: officersTable.rank,
          status: officersTable.status,
          discordUsername: officersTable.discordUsername,
          rockstarLicenseId: officersTable.rockstarLicenseId,
        })
        .from(officersTable))
    .then((rows) =>
      findOfficerByDutyIdentity(
        licenseId,
        events[events.length - 1]?.officerName ?? events[0]?.officerName ?? "",
        rows,
      ),
    );

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
  const shiftLabelMap = isMysqlDatabaseUrl
    ? Object.fromEntries((await getMysqlShiftConfigs()).map((row) => [row.key, row.label]))
    : Object.fromEntries(
        (await db
          .select({ key: shiftConfigsTable.key, label: shiftConfigsTable.label })
          .from(shiftConfigsTable))
          .map((row) => [row.key, row.label]),
      );

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
  if (isMysqlDatabaseUrl) {
    await mysqlExecute(
      `DELETE FROM pd_duty_logs
       WHERE cs_number = ? AND notes = 'discord' AND log_date >= ? AND log_date <= ?`,
      [cs, weekDateStart, weekDateEnd],
    );
  } else {
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
  }

  if (sessions.length > 0) {
    if (isMysqlDatabaseUrl) {
      for (const { start, end } of sessions) {
        const nextId = await getNextMysqlId("pd_duty_logs");
        await mysqlExecute(
          `INSERT INTO pd_duty_logs
            (id, log_date, start_time, end_time, cs_number, officer_name, rank, shift_type, duration, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'discord')`,
          [
            nextId,
            start.toISOString().split("T")[0]!,
            start.toISOString().substring(11, 16),
            end.toISOString().substring(11, 16),
            cs,
            name,
            rank,
            sessionShiftLabel(start, end),
            secsToHms(Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))),
          ],
        );
      }
    } else {
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
  }

  logger.info({ licenseId, weekPeriod, totalSecs }, "Updated duty hours");
}

// ── Message processor ──────────────────────────────────────────────────────

async function processMessage(
  msg: Message,
  opts?: { skipRecompute?: boolean },
): Promise<{ licenseId: string; weekPeriod: string; inserted: boolean } | null> {
  const texts = getMessageTexts(msg);
  for (const text of texts) {
    const parsed = parseEventText(text);
    if (!parsed) continue;

    const eventAt = msg.createdAt;
    const weekPeriod = getWeekPeriod(eventAt);

    try {
      let inserted = false;
      if (isMysqlDatabaseUrl) {
        const existing = await mysqlQuery<{ id: number }>(
          `SELECT id FROM pd_discord_duty_events WHERE discord_message_id = ? LIMIT 1`,
          [msg.id],
        );
        if (existing.length === 0) {
          const nextId = await getNextMysqlId("pd_discord_duty_events");
          await mysqlExecute(
            `INSERT INTO pd_discord_duty_events
              (id, license_id, officer_name, rank, event_type, event_at, discord_message_id, week_period, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [nextId, parsed.licenseId, parsed.officerName, parsed.rank, parsed.eventType, eventAt, msg.id, weekPeriod],
          );
          inserted = true;
        }
      } else {
        const insertResult = await db
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
        inserted = Array.isArray(insertResult) || !!insertResult;
      }

      if (inserted && !opts?.skipRecompute) {
        await recomputeDutyHours(parsed.licenseId, weekPeriod);
      }
      return { licenseId: parsed.licenseId, weekPeriod, inserted };
    } catch (err) {
      logger.error({ err, messageId: msg.id }, "Error processing message");
    }
    break;
  }
  return null;
}

// ── Historical backfill ────────────────────────────────────────────────────

function getBackfillCutoffDate(months = BACKFILL_MONTHS): Date {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

async function forEachMessageSince(
  channel: TextChannel,
  cutoff: Date,
  handler: (msg: Message) => Promise<void>,
): Promise<{ scanned: number; processed: number; reachedCutoff: boolean }> {
  let before: string | undefined;
  let scanned = 0;
  let processed = 0;
  let reachedCutoff = false;

  for (let i = 0; i < MAX_BACKFILL_BATCHES; i++) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (before) options.before = before;

    const msgs: Collection<string, Message> = await channel.messages.fetch(options);
    if (msgs.size === 0) break;

    const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const inWindow = sorted.filter((msg) => msg.createdAt >= cutoff);

    scanned += sorted.length;
    for (const msg of inWindow) {
      await handler(msg);
      processed++;
    }

    const oldest = sorted[0];
    if (!oldest) break;
    if (oldest.createdAt < cutoff) {
      reachedCutoff = true;
      break;
    }

    before = oldest.id;
    if (msgs.size < 100) break;
  }

  return { scanned, processed, reachedCutoff };
}

async function backfillHistory(channel: TextChannel) {
  const cutoff = getBackfillCutoffDate();
  logger.info({ channelId: channel.id, backfillMonths: BACKFILL_MONTHS, cutoffAt: cutoff.toISOString() }, "Starting history backfill");
  const dirtyPairs = new Set<string>();

  const { scanned, processed, reachedCutoff } = await forEachMessageSince(
    channel,
    cutoff,
    async (msg) => {
      const pair = await processMessage(msg, { skipRecompute: true });
      if (pair) dirtyPairs.add(`${pair.licenseId}::${pair.weekPeriod}`);
    },
  );

  // Now do a single batch recompute for all affected pairs — no mid-flight flickering
  logger.info({ scanned, processed, pairs: dirtyPairs.size, reachedCutoff }, "Events stored, starting batch recompute");
  for (const key of dirtyPairs) {
    const [licenseId, weekPeriod] = key.split("::");
    if (licenseId && weekPeriod) {
      try { await recomputeDutyHours(licenseId, weekPeriod); } catch (_) {}
    }
  }

  logger.info({ scanned, processed, pairs: dirtyPairs.size, backfillMonths: BACKFILL_MONTHS, reachedCutoff }, "History backfill complete");
  await botLog("SYNC", "duty-hours", "History Backfill", { scanned, processed, pairs: dirtyPairs.size, backfillMonths: BACKFILL_MONTHS, reachedCutoff });
}

async function reconcileRecentDutyMessages(channel: TextChannel) {
  const msgs = await channel.messages.fetch({ limit: RECENT_RESCAN_LIMIT });
  const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const dirtyPairs = new Set<string>();
  let inserted = 0;

  for (const msg of sorted) {
    const pair = await processMessage(msg, { skipRecompute: true });
    if (pair?.inserted) {
      inserted++;
      dirtyPairs.add(`${pair.licenseId}::${pair.weekPeriod}`);
    }
  }

  for (const key of dirtyPairs) {
    const [licenseId, weekPeriod] = key.split("::");
    if (licenseId && weekPeriod) {
      try {
        await recomputeDutyHours(licenseId, weekPeriod);
      } catch (err) {
        logger.error({ err, licenseId, weekPeriod }, "Recent duty reconcile recompute error");
      }
    }
  }

  logger.info(
    { scanned: sorted.length, inserted, repairedPairs: dirtyPairs.size, intervalMs: RECENT_RESCAN_INTERVAL_MS },
    "Recent duty reconcile complete",
  );
}

function startRecentDutyReconcileLoop(channel: TextChannel) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileRecentDutyMessages(channel);
    } catch (err) {
      logger.error({ err }, "Recent duty reconcile failed");
    } finally {
      running = false;
    }
  };

  setInterval(() => {
    void run();
  }, RECENT_RESCAN_INTERVAL_MS);

  logger.info(
    { intervalMs: RECENT_RESCAN_INTERVAL_MS, recentScanLimit: RECENT_RESCAN_LIMIT },
    "Periodic duty reconcile enabled",
  );
}

// ── Recompute all ──────────────────────────────────────────────────────────

export async function recomputeAllDutyHours(): Promise<{ pairs: number; updated: number }> {
  const rows = isMysqlDatabaseUrl
    ? await mysqlQuery<{ licenseId: string; weekPeriod: string }>(
        `SELECT DISTINCT license_id AS licenseId, week_period AS weekPeriod FROM pd_discord_duty_events`,
      )
    : await db
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
  await botLog("SYNC", "duty-hours", "Full Recompute", { pairs: rows.length, updated });
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

// ── FIR parser ────────────────────────────────────────────────────────────────

interface ParsedFir {
  complainantName: string | null;
  complainantCid: string | null;
  complainantContact: string | null;
  eventDescription: string | null;
  suspectDetails: string | null;
  evidence: string | null;
  officerName: string | null;
}

function parseFir(text: string): ParsedFir {
  return {
    complainantName:    field(text, "Complainant'?s? Name", "Complainant Name"),
    complainantCid:     field(text, "Complainant'?s? CID", "Complainant CID"),
    complainantContact: field(text, "Complainant'?s? Contact", "Contact"),
    eventDescription:   field(text, "Description of Event", "Event Description", "Description"),
    suspectDetails:     field(text, "Details of Suspect'?s?", "Suspect Details", "Suspect"),
    evidence:           field(text, "Evidence \\(images, links, or attachments\\).*?", "Evidence"),
    officerName:        field(text, "Officer"),
  };
}

function isFirMessage(text: string): boolean {
  return /new fir submission|fir submission/i.test(text) ||
    (/complainant/i.test(text) && /description of event/i.test(text));
}

function stripDiscordMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

async function processFirMessage(msg: Message): Promise<boolean> {
  const allTexts: string[] = [];
  if (msg.content) allTexts.push(msg.content);
  for (const embed of msg.embeds) {
    const parts: string[] = [];
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    for (const f of embed.fields ?? []) parts.push(`${f.name}: ${f.value}`);
    if (parts.length) allTexts.push(parts.join("\n"));
  }

  const rawCombined = allTexts.join("\n");
  const combined = stripDiscordMarkdown(rawCombined);
  if (!isFirMessage(combined)) return false;

  const parsed = parseFir(combined);

  const hasData = !!(parsed.complainantName || parsed.complainantCid || parsed.eventDescription || parsed.suspectDetails);
  if (!hasData) return false;

  const threadReplies = await fetchFirThreadReplies(msg);
  const threadId = msg.thread?.id ?? null;

  try {
    let changed = false;
    if (isMysqlDatabaseUrl) {
      const existing = await mysqlQuery<{ id: number }>(
        `SELECT id FROM pd_fir WHERE discord_message_id = ? LIMIT 1`,
        [msg.id],
      );
      if (existing.length > 0) {
        await mysqlExecute(
          `UPDATE pd_fir
           SET thread_id = ?, thread_replies = ?
           WHERE discord_message_id = ?`,
          [threadId, threadReplies.length > 0 ? JSON.stringify(threadReplies) : null, msg.id],
        );
        changed = true;
      } else {
        const nextId = await getNextMysqlId("pd_fir");
        await mysqlExecute(
          `INSERT INTO pd_fir
            (id, discord_message_id, complainant_name, complainant_cid, complainant_contact, event_description,
             suspect_details, evidence, officer_name, raw_content, thread_id, thread_replies, posted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            nextId,
            msg.id,
            parsed.complainantName,
            parsed.complainantCid,
            parsed.complainantContact,
            parsed.eventDescription,
            parsed.suspectDetails,
            parsed.evidence,
            parsed.officerName,
            rawCombined.slice(0, 4000),
            threadId,
            threadReplies.length > 0 ? JSON.stringify(threadReplies) : null,
            msg.createdAt,
          ],
        );
        changed = true;
      }
    } else {
      await db.insert(pdFirTable).values({
        discordMessageId:   msg.id,
        complainantName:    parsed.complainantName,
        complainantCid:     parsed.complainantCid,
        complainantContact: parsed.complainantContact,
        eventDescription:   parsed.eventDescription,
        suspectDetails:     parsed.suspectDetails,
        evidence:           parsed.evidence,
        officerName:        parsed.officerName,
        rawContent:         rawCombined.slice(0, 4000),
        threadId,
        threadReplies:      threadReplies.length > 0 ? threadReplies : null,
        postedAt:           msg.createdAt,
      }).onConflictDoUpdate({
        target: pdFirTable.discordMessageId,
        set: {
          threadId,
          threadReplies: threadReplies.length > 0 ? threadReplies : null,
        },
      });
      changed = true;
    }
    broadcastFirEvent("new_fir");
    return changed;
  } catch (err) {
    logger.error({ err, messageId: msg.id }, "Error saving FIR");
  }
  return false;
}

async function fetchFirThreadReplies(msg: Message): Promise<FirThreadMessage[]> {
  try {
    if (!msg.thread) return [];
    const threadMsgs = await msg.thread.messages.fetch({ limit: 100 });
    return [...threadMsgs.values()]
      .filter(m => !m.author.bot)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => ({
        author: m.author.globalName ?? m.author.username,
        authorId: m.author.id,
        content: m.content,
        attachments: [...m.attachments.values()].map(a => a.url),
        timestamp: m.createdAt.toISOString(),
      }));
  } catch (err) {
    logger.warn({ err, messageId: msg.id }, "Could not fetch FIR thread replies");
    return [];
  }
}

async function updateFirThreadByThreadId(threadId: string): Promise<void> {
  try {
    const fir = isMysqlDatabaseUrl
      ? await mysqlQuery<{ id: number; thread_id: string | null }>(
          `SELECT id, thread_id FROM pd_fir WHERE thread_id = ? LIMIT 1`,
          [threadId],
        ).then((rows) => rows[0] ?? null)
      : await db
          .select({ id: pdFirTable.id, threadId: pdFirTable.threadId })
          .from(pdFirTable)
          .where(eq(pdFirTable.threadId, threadId))
          .limit(1)
          .then((rows) => rows[0] ?? null);
    if (!fir) return;

    const thread = await (global as any).__discordClient?.channels.fetch(threadId).catch(() => null);
    if (!thread) return;

    const threadMsgs = await thread.messages.fetch({ limit: 100 });
    const replies: FirThreadMessage[] = [...threadMsgs.values()]
      .filter((m: Message) => !m.author.bot)
      .sort((a: Message, b: Message) => a.createdTimestamp - b.createdTimestamp)
      .map((m: Message) => ({
        author: m.author.globalName ?? m.author.username,
        authorId: m.author.id,
        content: m.content,
        attachments: [...m.attachments.values()].map((a: any) => a.url),
        timestamp: m.createdAt.toISOString(),
      }));

    if (isMysqlDatabaseUrl) {
      await mysqlExecute(
        `UPDATE pd_fir SET thread_replies = ? WHERE thread_id = ?`,
        [replies.length > 0 ? JSON.stringify(replies) : null, threadId],
      );
    } else {
      await db.update(pdFirTable)
        .set({ threadReplies: replies.length > 0 ? replies : null })
        .where(eq(pdFirTable.threadId, threadId));
    }
    broadcastFirEvent("thread_update");
  } catch (err) {
    logger.warn({ err, threadId }, "Could not update FIR thread replies");
  }
}

async function backfillFir(channel: TextChannel) {
  const cutoff = getBackfillCutoffDate();
  logger.info({ channelId: channel.id, backfillMonths: BACKFILL_MONTHS, cutoffAt: cutoff.toISOString() }, "Starting FIR backfill");
  const result = await forEachMessageSince(channel, cutoff, async (msg) => {
    await processFirMessage(msg);
  });

  logger.info({ channelId: channel.id, ...result, backfillMonths: BACKFILL_MONTHS }, "FIR backfill complete");
  await botLog("SYNC", "fir", "FIR Backfill", { ...result, backfillMonths: BACKFILL_MONTHS });
}

async function processCitationMessage(msg: Message): Promise<boolean> {
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
  if (!isCitationMessage(combined)) return false;

  const parsed = parseCitation(combined);

  try {
    let inserted = false;
    if (isMysqlDatabaseUrl) {
      const existing = await mysqlQuery<{ id: number }>(
        `SELECT id FROM pd_citations WHERE discord_message_id = ? LIMIT 1`,
        [msg.id],
      );
      if (existing.length === 0) {
        const nextId = await getNextMysqlId("pd_citations");
        await mysqlExecute(
          `INSERT INTO pd_citations
            (id, discord_message_id, title, incident, location, evidence, incident_report, suspect_name, suspect_cid,
             suspect_contact, charges, officer_name, raw_content, posted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            nextId,
            msg.id,
            parsed.title,
            parsed.incident,
            parsed.location,
            parsed.evidence,
            parsed.incidentReport,
            parsed.suspectName,
            parsed.suspectCid,
            parsed.suspectContact,
            parsed.charges,
            parsed.officerName,
            combined.slice(0, 4000),
            msg.createdAt,
          ],
        );
        inserted = true;
      }
    } else {
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
      inserted = true;
    }
    return inserted;
  } catch (err) {
    logger.error({ err, messageId: msg.id }, "Error saving citation");
  }
  return false;
}

async function backfillCitations(channel: TextChannel) {
  const cutoff = getBackfillCutoffDate();
  logger.info({ channelId: channel.id, backfillMonths: BACKFILL_MONTHS, cutoffAt: cutoff.toISOString() }, "Starting citation backfill");
  const result = await forEachMessageSince(channel, cutoff, async (msg) => {
    await processCitationMessage(msg);
  });

  logger.info({ channelId: channel.id, ...result, backfillMonths: BACKFILL_MONTHS }, "Citation backfill complete");
  await botLog("SYNC", "citation", "Citation Backfill", { ...result, backfillMonths: BACKFILL_MONTHS });
}

async function reconcileRecentCitationMessages(channel: TextChannel) {
  const msgs = await channel.messages.fetch({ limit: SECONDARY_RECENT_RESCAN_LIMIT });
  const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let inserted = 0;

  for (const msg of sorted) {
    if (await processCitationMessage(msg)) {
      inserted++;
    }
  }

  logger.info(
    { scanned: sorted.length, inserted, intervalMs: RECENT_RESCAN_INTERVAL_MS, recentScanLimit: SECONDARY_RECENT_RESCAN_LIMIT },
    "Recent citation reconcile complete",
  );
}

async function reconcileRecentFirMessages(channel: TextChannel) {
  const msgs = await channel.messages.fetch({ limit: SECONDARY_RECENT_RESCAN_LIMIT });
  const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let changed = 0;

  for (const msg of sorted) {
    if (await processFirMessage(msg)) {
      changed++;
    }
  }

  logger.info(
    { scanned: sorted.length, changed, intervalMs: RECENT_RESCAN_INTERVAL_MS, recentScanLimit: SECONDARY_RECENT_RESCAN_LIMIT },
    "Recent FIR reconcile complete",
  );
}

function startRecentCitationReconcileLoop(channel: TextChannel) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileRecentCitationMessages(channel);
    } catch (err) {
      logger.error({ err }, "Recent citation reconcile failed");
    } finally {
      running = false;
    }
  };

  setInterval(() => {
    void run();
  }, RECENT_RESCAN_INTERVAL_MS);

  logger.info(
    { intervalMs: RECENT_RESCAN_INTERVAL_MS, recentScanLimit: SECONDARY_RECENT_RESCAN_LIMIT },
    "Periodic citation reconcile enabled",
  );
}

function startRecentFirReconcileLoop(channel: TextChannel) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileRecentFirMessages(channel);
    } catch (err) {
      logger.error({ err }, "Recent FIR reconcile failed");
    } finally {
      running = false;
    }
  };

  setInterval(() => {
    void run();
  }, RECENT_RESCAN_INTERVAL_MS);

  logger.info(
    { intervalMs: RECENT_RESCAN_INTERVAL_MS, recentScanLimit: SECONDARY_RECENT_RESCAN_LIMIT },
    "Periodic FIR reconcile enabled",
  );
}

// ── Bot start ──────────────────────────────────────────────────────────────

export async function startDiscordBot() {
  if (!BOT_TOKEN) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot disabled");
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
    await botLog("CONNECT", "bot", client.user?.tag ?? "Discord Bot", null);

    if (!CHANNEL_ID) {
      dutySyncEnabled = false;
      logger.warn("DISCORD_TIMESTAMP_CHANNEL_ID not set — PD duty sync disabled until a PD timestamp channel is configured");
    } else {
      const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) {
        dutySyncEnabled = false;
        logger.error({ CHANNEL_ID }, "Could not find PD time-stamp channel");
      } else {
        if (!isSafePdDutyChannelName(channel.name)) {
          dutySyncEnabled = false;
          logger.error(
            { channelId: channel.id, channelName: channel.name },
            "Duty sync blocked because configured timestamp channel is not PD-safe",
          );
        } else {
          dutySyncEnabled = true;
          await backfillHistory(channel);
          logger.info("Duty history backfill complete. Live duty sync is now active");
          await reconcileRecentDutyMessages(channel);
          startRecentDutyReconcileLoop(channel);
        }
      }
    }

    if (CITATION_CHANNEL_ID) {
      const citationChannel = await client.channels.fetch(CITATION_CHANNEL_ID).catch(() => null);
      if (!citationChannel || !(citationChannel instanceof TextChannel)) {
        logger.warn({ CITATION_CHANNEL_ID }, "Could not find citation channel — set DISCORD_CITATION_CHANNEL_ID");
      } else {
        await backfillCitations(citationChannel);
        logger.info("Citation history backfill complete. Live citation sync is now active");
        await reconcileRecentCitationMessages(citationChannel);
        startRecentCitationReconcileLoop(citationChannel);
      }
    } else {
      logger.warn("DISCORD_CITATION_CHANNEL_ID not set — citation sync disabled");
    }

    if (FIR_CHANNEL_ID) {
      const firChannel = await client.channels.fetch(FIR_CHANNEL_ID).catch(() => null);
      if (!firChannel || !(firChannel instanceof TextChannel)) {
        logger.warn({ FIR_CHANNEL_ID }, "Could not find FIR channel — set DISCORD_FIR_CHANNEL_ID");
      } else {
        await backfillFir(firChannel);
        logger.info("FIR history backfill complete. Live FIR sync is now active");
        await reconcileRecentFirMessages(firChannel);
        startRecentFirReconcileLoop(firChannel);
      }
    } else {
      logger.warn("DISCORD_FIR_CHANNEL_ID not set — FIR sync disabled");
    }
  });

  client.on("messageCreate", async (msg) => {
    if (dutySyncEnabled && msg.channelId === CHANNEL_ID) {
      await processMessage(msg);
    } else if (CITATION_CHANNEL_ID && msg.channelId === CITATION_CHANNEL_ID) {
      await processCitationMessage(msg);
    } else if (FIR_CHANNEL_ID && msg.channelId === FIR_CHANNEL_ID) {
      await processFirMessage(msg);
    } else if (
      FIR_CHANNEL_ID &&
      msg.channel.type === ChannelType.PublicThread &&
      (msg.channel as any).parentId === FIR_CHANNEL_ID &&
      !msg.author.bot
    ) {
      await updateFirThreadByThreadId(msg.channelId);
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  (global as any).__discordClient = client;
  await client.login(BOT_TOKEN);
}
