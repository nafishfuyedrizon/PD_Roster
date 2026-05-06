import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PD_REGISTRAR_TABLES = {
  dutyHourTotals: "pd_duty_hour_totals",
  discordDutyEvents: "pd_discord_duty_events",
  shiftConfigs: "pd_shift_configs",
  dutyAdjustments: "pd_duty_adjustments",
};

const dumpPath = resolve(__dirname, "../attached_assets/database_dump_1775473575672.json");
const raw = readFileSync(dumpPath, "utf-8");
const dump = JSON.parse(raw);

async function run(sql, params) {
  return pool.query(sql, params);
}

async function insertChunk(tableName, rows, columns, values) {
  if (rows.length === 0) return;
  const colList = columns.join(", ");
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = [];
    const params = [];
    let idx = 1;
    for (const row of chunk) {
      const rowPlaceholders = values(row).map(() => `$${idx++}`);
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
      params.push(...values(row));
    }
    await pool.query(
      `INSERT INTO ${tableName} (${colList}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
      params
    );
  }
}

async function main() {
  console.log("Starting database import...\n");

  // 1. site_settings
  const settings = dump.site_settings ?? [];
  if (settings.length > 0) {
    console.log(`  [import] site_settings — ${settings.length} records`);
    await insertChunk("site_settings", settings, ["key", "value", "updated_at"], (r) => [
      r.key,
      r.value,
      r.updated_at ? new Date(r.updated_at) : new Date(),
    ]);
    console.log("  [done] site_settings");
  }

  // 2. pd_shift_configs
  const shiftConfigs = dump.shift_configs ?? [];
  if (shiftConfigs.length > 0) {
    console.log(`  [import] ${PD_REGISTRAR_TABLES.shiftConfigs} — ${shiftConfigs.length} records`);
    await insertChunk(PD_REGISTRAR_TABLES.shiftConfigs, shiftConfigs, ["key", "label", "sub", "icon", "start_hour", "end_hour", "sort_order"], (r) => [
      r.key,
      r.label,
      r.sub ?? "",
      r.icon ?? "●",
      r.start_hour,
      r.end_hour,
      r.sort_order ?? 0,
    ]);
    console.log(`  [done] ${PD_REGISTRAR_TABLES.shiftConfigs}`);
  }

  // 3. officers
  const officers = dump.officers ?? [];
  if (officers.length > 0) {
    console.log(`  [truncate+import] officers — ${officers.length} records`);
    await pool.query(`TRUNCATE TABLE officers RESTART IDENTITY CASCADE`);
    await insertChunk(
      "officers",
      officers,
      [
        "id", "call_sign", "citizen_id", "name", "phone_number", "department", "rank",
        "division", "status", "timezone", "date_of_joining", "last_promotion",
        "pilot", "mdt", "seu", "smg", "rifle", "shotgun", "rifle_tier_ii", "ftp",
        "is_management", "strikes_major", "strikes_minor", "discord_username",
        "discord_uid", "discord_id", "rockstar_license_id", "duty_hours",
        "completion_status", "appointed_fto", "week_period", "created_at"
      ],
      (r) => [
        r.id,
        r.call_sign,
        r.citizen_id ?? null,
        r.name ?? null,
        r.phone_number ?? null,
        r.department,
        r.rank,
        r.division ?? null,
        r.status ?? "Vacant",
        r.timezone ?? null,
        r.date_of_joining ?? null,
        r.last_promotion ?? null,
        r.pilot ?? false,
        r.mdt ?? false,
        r.seu ?? false,
        r.smg ?? false,
        r.rifle ?? false,
        r.shotgun ?? false,
        r.rifle_tier_ii ?? false,
        r.ftp ?? false,
        r.is_management ?? false,
        r.strikes_major ?? "0/4",
        r.strikes_minor ?? "0/2",
        r.discord_username ?? null,
        r.discord_uid ?? null,
        r.discord_id ?? "",
        r.rockstar_license_id ?? null,
        r.duty_hours ?? null,
        r.completion_status ?? null,
        r.appointed_fto ?? null,
        r.week_period ?? "",
        r.created_at ? new Date(r.created_at) : new Date(),
      ]
    );
    // Update sequence so new inserts get correct IDs
    await pool.query(`SELECT setval('officers_id_seq', (SELECT MAX(id) FROM officers))`);
    console.log("  [done] officers");
  }

  // 4. pd_duty_logs
  const pdLogs = dump.pd_duty_logs ?? [];
  if (pdLogs.length > 0) {
    console.log(`  [truncate+import] pd_duty_logs — ${pdLogs.length} records`);
    await pool.query(`TRUNCATE TABLE pd_duty_logs RESTART IDENTITY`);
    await insertChunk(
      "pd_duty_logs",
      pdLogs,
      ["id", "log_date", "start_time", "end_time", "cs_number", "officer_name", "rank", "shift_type", "duration", "notes", "created_at"],
      (r) => [
        r.id,
        r.log_date,
        r.start_time ?? null,
        r.end_time ?? null,
        r.cs_number,
        r.officer_name,
        r.rank ?? "",
        r.shift_type ?? "Full",
        r.duration ?? "00:00:00",
        r.notes ?? null,
        r.created_at ? new Date(r.created_at) : new Date(),
      ]
    );
    await pool.query(`SELECT setval('pd_duty_logs_id_seq', (SELECT MAX(id) FROM pd_duty_logs))`);
    console.log("  [done] pd_duty_logs");
  }

  // 5. pd_duty_hour_totals
  const emsLogs = dump.ems_duty_logs ?? [];
  if (emsLogs.length > 0) {
    console.log(`  [truncate+import] ${PD_REGISTRAR_TABLES.dutyHourTotals} — ${emsLogs.length} records`);
    await pool.query(`TRUNCATE TABLE ${PD_REGISTRAR_TABLES.dutyHourTotals} RESTART IDENTITY`);
    await insertChunk(
      PD_REGISTRAR_TABLES.dutyHourTotals,
      emsLogs,
      ["id", "cs_number", "name", "status", "rank", "week_period", "duty_year", "duty_hours", "shift_type", "created_at"],
      (r) => [
        r.id,
        r.cs_number,
        r.name,
        r.status ?? "Active",
        r.rank,
        r.week_period,
        r.duty_year ?? null,
        r.duty_hours ?? null,
        r.shift_type ?? "ALL",
        r.created_at ? new Date(r.created_at) : new Date(),
      ]
    );
    await pool.query(`SELECT setval(pg_get_serial_sequence('${PD_REGISTRAR_TABLES.dutyHourTotals}', 'id'), (SELECT MAX(id) FROM ${PD_REGISTRAR_TABLES.dutyHourTotals}))`);
    console.log(`  [done] ${PD_REGISTRAR_TABLES.dutyHourTotals}`);
  }

  // 6. pd_discord_duty_events
  const discordEvents = dump.discord_duty_events ?? [];
  if (discordEvents.length > 0) {
    console.log(`  [truncate+import] ${PD_REGISTRAR_TABLES.discordDutyEvents} — ${discordEvents.length} records`);
    await pool.query(`TRUNCATE TABLE ${PD_REGISTRAR_TABLES.discordDutyEvents} RESTART IDENTITY`);
    await insertChunk(
      PD_REGISTRAR_TABLES.discordDutyEvents,
      discordEvents,
      ["id", "license_id", "officer_name", "rank", "event_type", "event_at", "discord_message_id", "week_period", "created_at"],
      (r) => [
        r.id,
        r.license_id,
        r.officer_name,
        r.rank ?? null,
        r.event_type,
        new Date(r.event_at),
        r.discord_message_id,
        r.week_period,
        r.created_at ? new Date(r.created_at) : new Date(),
      ]
    );
    await pool.query(`SELECT setval(pg_get_serial_sequence('${PD_REGISTRAR_TABLES.discordDutyEvents}', 'id'), (SELECT MAX(id) FROM ${PD_REGISTRAR_TABLES.discordDutyEvents}))`);
    console.log(`  [done] ${PD_REGISTRAR_TABLES.discordDutyEvents}`);
  }

  // 7. pd_duty_adjustments
  const adjustments = dump.duty_adjustments ?? [];
  if (adjustments.length > 0) {
    console.log(`  [truncate+import] ${PD_REGISTRAR_TABLES.dutyAdjustments} — ${adjustments.length} records`);
    await pool.query(`TRUNCATE TABLE ${PD_REGISTRAR_TABLES.dutyAdjustments} RESTART IDENTITY`);
    await insertChunk(
      PD_REGISTRAR_TABLES.dutyAdjustments,
      adjustments,
      ["id", "officer_cs", "officer_name", "duty_month", "duty_year", "shift_type", "adjustment_seconds", "note", "created_at"],
      (r) => [
        r.id,
        r.officer_cs,
        r.officer_name ?? null,
        r.duty_month,
        r.duty_year,
        r.shift_type ?? "ALL",
        r.adjustment_seconds,
        r.note ?? null,
        r.created_at ? new Date(r.created_at) : new Date(),
      ]
    );
    await pool.query(`SELECT setval(pg_get_serial_sequence('${PD_REGISTRAR_TABLES.dutyAdjustments}', 'id'), (SELECT MAX(id) FROM ${PD_REGISTRAR_TABLES.dutyAdjustments}))`);
    console.log(`  [done] ${PD_REGISTRAR_TABLES.dutyAdjustments}`);
  }

  console.log("\nImport complete!");
  await pool.end();
}

main().catch(async (err) => {
  console.error("Import failed:", err);
  await pool.end();
  process.exit(1);
});
