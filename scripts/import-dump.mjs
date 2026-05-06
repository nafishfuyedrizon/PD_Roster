import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpPath = process.argv[2];

if (!dumpPath) {
  console.error("Usage: node scripts/import-dump.mjs <path-to-dump.json>");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(path.resolve(dumpPath), "utf-8"));

const PD_REGISTRAR_TABLES = {
  dutyHourTotals: "pd_duty_hour_totals",
  discordDutyEvents: "pd_discord_duty_events",
  shiftConfigs: "pd_shift_configs",
  dutyAdjustments: "pd_duty_adjustments",
};

function val(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function upsertRows(client, table, rows, conflictCol, conflictAction = "DO NOTHING") {
  if (!rows || rows.length === 0) {
    console.log(`  ${table}: no rows`);
    return;
  }
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((c) => val(row[c]));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (${conflictCol}) ${conflictAction}`;
    try {
      const result = await client.query(sql, values);
      if (result.rowCount > 0) inserted++;
      else skipped++;
    } catch (err) {
      console.error(`  [${table}] Error on row`, JSON.stringify(row).substring(0, 120), err.message);
      skipped++;
    }
  }
  console.log(`  ${table}: ${inserted} inserted, ${skipped} skipped`);
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ${table}: no rows`);
    return;
  }
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const cols = Object.keys(chunk[0]);
    for (const row of chunk) {
      const values = cols.map((c) => val(row[c]));
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
        VALUES (${placeholders.join(", ")})
        ON CONFLICT DO NOTHING`;
      try {
        const result = await client.query(sql, values);
        if (result.rowCount > 0) total++;
      } catch (err) {
        console.error(`  [${table}] Error:`, err.message.substring(0, 120));
      }
    }
  }
  console.log(`  ${table}: ${total} inserted (of ${rows.length})`);
}

async function resetSequence(client, table, col = "id") {
  await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), COALESCE(MAX("${col}"), 1)) FROM "${table}"`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("Starting import...\n");

    console.log("--- officers ---");
    await upsertRows(client, "officers", dump.officers, '"id"',
      `DO UPDATE SET
        call_sign = EXCLUDED.call_sign,
        citizen_id = EXCLUDED.citizen_id,
        name = EXCLUDED.name,
        phone_number = EXCLUDED.phone_number,
        department = EXCLUDED.department,
        rank = EXCLUDED.rank,
        division = EXCLUDED.division,
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        date_of_joining = EXCLUDED.date_of_joining,
        last_promotion = EXCLUDED.last_promotion,
        pilot = EXCLUDED.pilot,
        mdt = EXCLUDED.mdt,
        seu = EXCLUDED.seu,
        smg = EXCLUDED.smg,
        rifle = EXCLUDED.rifle,
        shotgun = EXCLUDED.shotgun,
        rifle_tier_ii = EXCLUDED.rifle_tier_ii,
        ftp = EXCLUDED.ftp,
        is_management = EXCLUDED.is_management,
        strikes_major = EXCLUDED.strikes_major,
        strikes_minor = EXCLUDED.strikes_minor,
        discord_username = EXCLUDED.discord_username,
        discord_uid = EXCLUDED.discord_uid,
        discord_id = EXCLUDED.discord_id,
        rockstar_license_id = EXCLUDED.rockstar_license_id,
        fivem_name = EXCLUDED.fivem_name,
        duty_hours = EXCLUDED.duty_hours,
        completion_status = EXCLUDED.completion_status,
        appointed_fto = EXCLUDED.appointed_fto,
        week_period = EXCLUDED.week_period`
    );
    await resetSequence(client, "officers");

    console.log(`\n--- ${PD_REGISTRAR_TABLES.dutyHourTotals} ---`);
    await insertRows(client, PD_REGISTRAR_TABLES.dutyHourTotals, dump.ems_duty_logs);
    await resetSequence(client, PD_REGISTRAR_TABLES.dutyHourTotals);

    console.log(`\n--- ${PD_REGISTRAR_TABLES.discordDutyEvents} ---`);
    await upsertRows(client, PD_REGISTRAR_TABLES.discordDutyEvents, dump.discord_duty_events, '"discord_message_id"', "DO NOTHING");
    await resetSequence(client, PD_REGISTRAR_TABLES.discordDutyEvents);

    console.log(`\n--- ${PD_REGISTRAR_TABLES.shiftConfigs} ---`);
    await upsertRows(client, PD_REGISTRAR_TABLES.shiftConfigs, dump.shift_configs, '"key"',
      `DO UPDATE SET
        label = EXCLUDED.label,
        sub = EXCLUDED.sub,
        icon = EXCLUDED.icon,
        start_hour = EXCLUDED.start_hour,
        end_hour = EXCLUDED.end_hour,
        sort_order = EXCLUDED.sort_order`
    );

    console.log("\n--- site_settings ---");
    await upsertRows(client, "site_settings", dump.site_settings, '"key"',
      `DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`
    );

    console.log("\n--- pd_duty_logs ---");
    await insertRows(client, "pd_duty_logs", dump.pd_duty_logs);
    await resetSequence(client, "pd_duty_logs");

    console.log(`\n--- ${PD_REGISTRAR_TABLES.dutyAdjustments} ---`);
    await insertRows(client, PD_REGISTRAR_TABLES.dutyAdjustments, dump.duty_adjustments);
    await resetSequence(client, PD_REGISTRAR_TABLES.dutyAdjustments);

    console.log("\n--- qualification_chart ---");
    await insertRows(client, "qualification_chart", dump.qualification_chart);
    await resetSequence(client, "qualification_chart");

    console.log("\n--- admin_logs ---");
    await insertRows(client, "admin_logs", dump.admin_logs);
    await resetSequence(client, "admin_logs");

    console.log("\n--- staff_roles ---");
    await upsertRows(client, "staff_roles", dump.staff_roles, '"discord_uid"', "DO NOTHING");
    await resetSequence(client, "staff_roles");

    console.log("\n--- pd_citations ---");
    await upsertRows(client, "pd_citations", dump.pd_citations, '"discord_message_id"', "DO NOTHING");
    await resetSequence(client, "pd_citations");

    console.log("\n--- pd_fir ---");
    await upsertRows(client, "pd_fir", dump.pd_fir, '"discord_message_id"', "DO NOTHING");
    await resetSequence(client, "pd_fir");

    console.log("\n--- citation_deletion_logs ---");
    await insertRows(client, "citation_deletion_logs", dump.citation_deletion_logs);
    await resetSequence(client, "citation_deletion_logs");

    console.log("\n--- student_progressions ---");
    await insertRows(client, "student_progressions", dump.student_progressions);
    await resetSequence(client, "student_progressions");

    console.log("\n--- ex_pd_officers ---");
    await insertRows(client, "ex_pd_officers", dump.ex_pd_officers);
    await resetSequence(client, "ex_pd_officers");

    console.log("\n--- fto_doc_items ---");
    await insertRows(client, "fto_doc_items", dump.fto_doc_items);
    await resetSequence(client, "fto_doc_items");

    console.log("\nImport complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
