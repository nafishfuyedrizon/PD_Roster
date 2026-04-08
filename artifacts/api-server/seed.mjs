import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.log("[seed] DATABASE_URL not set — skipping seed");
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.join(__dirname, "seed-data.json");

let dump;
try {
  dump = JSON.parse(readFileSync(seedFile, "utf-8"));
} catch {
  console.log("[seed] seed-data.json not found — skipping seed");
  process.exit(0);
}

function val(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function tableCount(client, table) {
  const r = await client.query(`SELECT COUNT(*) FROM "${table}"`);
  return parseInt(r.rows[0].count, 10);
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((c) => val(row[c]));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT DO NOTHING`;
    try {
      const result = await client.query(sql, values);
      if (result.rowCount > 0) inserted++;
    } catch {
      // skip
    }
  }
  return inserted;
}

async function upsertRows(client, table, rows, conflictCol, updateSet) {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((c) => val(row[c]));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const action = updateSet
      ? `DO UPDATE SET ${updateSet}`
      : "DO NOTHING";
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (${conflictCol}) ${action}`;
    try {
      const result = await client.query(sql, values);
      if (result.rowCount > 0) inserted++;
    } catch {
      // skip
    }
  }
  return inserted;
}

async function resetSeq(client, table) {
  try {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX("id"), 1)) FROM "${table}"`
    );
  } catch {
    // no serial id
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const officerCount = await tableCount(client, "officers");
    if (officerCount > 0) {
      console.log(`[seed] Database already seeded (${officerCount} officers found) — skipping`);
      return;
    }

    console.log("[seed] Database is empty — seeding from seed-data.json...");

    const tables = [
      { table: "officers", type: "upsert", conflict: '"id"', update: `call_sign=EXCLUDED.call_sign,citizen_id=EXCLUDED.citizen_id,name=EXCLUDED.name,phone_number=EXCLUDED.phone_number,department=EXCLUDED.department,rank=EXCLUDED.rank,division=EXCLUDED.division,status=EXCLUDED.status,timezone=EXCLUDED.timezone,date_of_joining=EXCLUDED.date_of_joining,last_promotion=EXCLUDED.last_promotion,pilot=EXCLUDED.pilot,mdt=EXCLUDED.mdt,seu=EXCLUDED.seu,smg=EXCLUDED.smg,rifle=EXCLUDED.rifle,shotgun=EXCLUDED.shotgun,rifle_tier_ii=EXCLUDED.rifle_tier_ii,ftp=EXCLUDED.ftp,is_management=EXCLUDED.is_management,strikes_major=EXCLUDED.strikes_major,strikes_minor=EXCLUDED.strikes_minor,discord_username=EXCLUDED.discord_username,discord_uid=EXCLUDED.discord_uid,discord_id=EXCLUDED.discord_id,rockstar_license_id=EXCLUDED.rockstar_license_id,fivem_name=EXCLUDED.fivem_name,duty_hours=EXCLUDED.duty_hours,completion_status=EXCLUDED.completion_status,appointed_fto=EXCLUDED.appointed_fto,week_period=EXCLUDED.week_period` },
      { table: "ems_duty_logs", type: "insert" },
      { table: "discord_duty_events", type: "upsert", conflict: '"discord_message_id"' },
      { table: "shift_configs", type: "upsert", conflict: '"key"', update: `label=EXCLUDED.label,sub=EXCLUDED.sub,icon=EXCLUDED.icon,start_hour=EXCLUDED.start_hour,end_hour=EXCLUDED.end_hour,sort_order=EXCLUDED.sort_order` },
      { table: "site_settings", type: "upsert", conflict: '"key"', update: `value=EXCLUDED.value,updated_at=EXCLUDED.updated_at` },
      { table: "pd_duty_logs", type: "insert" },
      { table: "duty_adjustments", type: "insert" },
      { table: "qualification_chart", type: "insert" },
      { table: "admin_logs", type: "insert" },
      { table: "staff_roles", type: "upsert", conflict: '"discord_uid"' },
      { table: "pd_citations", type: "insert" },
      { table: "pd_fir", type: "upsert", conflict: '"discord_message_id"' },
      { table: "citation_deletion_logs", type: "insert" },
      { table: "student_progressions", type: "insert" },
      { table: "ex_pd_officers", type: "insert" },
      { table: "fto_doc_items", type: "insert" },
    ];

    for (const t of tables) {
      const rows = dump[t.table];
      let n;
      if (t.type === "upsert") {
        n = await upsertRows(client, t.table, rows, t.conflict, t.update || null);
      } else {
        n = await insertRows(client, t.table, rows);
      }
      await resetSeq(client, t.table);
      console.log(`[seed]   ${t.table}: ${n} rows`);
    }

    console.log("[seed] Done!");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed] Error:", err.message);
  process.exit(1);
});
