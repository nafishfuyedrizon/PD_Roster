import { pool } from "@workspace/db";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";

function val(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

type DbClient = Awaited<ReturnType<typeof pool.connect>>;

async function tableCount(client: DbClient, table: string): Promise<number> {
  const r = await client.query(`SELECT COUNT(*) FROM "${table}"`);
  return parseInt(r.rows[0].count, 10);
}

async function insertRows(client: DbClient, table: string, rows: Record<string, unknown>[]): Promise<number> {
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
      if (result.rowCount && result.rowCount > 0) inserted++;
    } catch {
      // skip duplicates/conflicts
    }
  }
  return inserted;
}

async function upsertRows(
  client: DbClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictCol: string,
  updateSet?: string
): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((c) => val(row[c]));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const action = updateSet ? `DO UPDATE SET ${updateSet}` : "DO NOTHING";
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (${conflictCol}) ${action}`;
    try {
      const result = await client.query(sql, values);
      if (result.rowCount && result.rowCount > 0) inserted++;
    } catch {
      // skip
    }
  }
  return inserted;
}

async function resetSeq(client: DbClient, table: string): Promise<void> {
  try {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX("id"), 1)) FROM "${table}"`
    );
  } catch {
    // no serial id column
  }
}

async function seedTableIfEmpty(
  client: DbClient,
  table: string,
  seedFile: string,
  type: "insert" | "upsert" = "insert",
  conflictCol?: string,
  updateSet?: string
): Promise<void> {
  const count = await tableCount(client, table);
  if (count > 0) {
    logger.info({ count }, `${table} already has data — skipping seed`);
    return;
  }
  if (!existsSync(seedFile)) {
    logger.info(`No seed file found for ${table} — skipping`);
    return;
  }
  const rows = JSON.parse(readFileSync(seedFile, "utf-8")) as Record<string, unknown>[];
  let n: number;
  if (type === "upsert" && conflictCol) {
    n = await upsertRows(client, table, rows, conflictCol, updateSet);
  } else {
    n = await insertRows(client, table, rows);
  }
  await resetSeq(client, table);
  logger.info({ inserted: n, total: rows.length }, `Seeded ${table}`);
}

async function syncStudentProgressions(client: DbClient, seedFile: string): Promise<void> {
  if (!existsSync(seedFile)) {
    logger.info("No student-progressions-seed.json found — skipping sync");
    return;
  }
  const rows = JSON.parse(readFileSync(seedFile, "utf-8")) as Record<string, unknown>[];
  if (!rows || rows.length === 0) return;

  // Build the SET clause for all columns except id and created_at
  const sampleCols = Object.keys(rows[0]).filter((c) => c !== "id" && c !== "created_at");
  const updateSet = sampleCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

  const n = await upsertRows(client, "student_progressions", rows, '"id"', updateSet);

  // Remove duplicate badge_numbers — for duplicates, keep the row that has current_phase set
  // (i.e. the seeded row with full data), remove the empty legacy rows
  await client.query(`
    DELETE FROM student_progressions sp
    WHERE badge_number IN (
      SELECT badge_number FROM student_progressions
      GROUP BY badge_number HAVING COUNT(*) > 1
    )
    AND (current_phase IS NULL OR current_phase = '')
  `);

  await resetSeq(client, "student_progressions");
  logger.info({ upserted: n, total: rows.length }, "Synced student_progressions from seed");
}

async function ensureDepartmentExists(client: DbClient, dept: string): Promise<void> {
  const r = await client.query(`SELECT value FROM site_settings WHERE key = 'departments' LIMIT 1`);
  if (r.rows.length === 0) return;
  let depts: string[] = [];
  try { depts = JSON.parse(r.rows[0].value as string); } catch { return; }
  if (!Array.isArray(depts) || depts.includes(dept)) return;
  depts.push(dept);
  await client.query(`UPDATE site_settings SET value = $1, updated_at = NOW() WHERE key = 'departments'`, [JSON.stringify(depts)]);
  logger.info({ dept }, `Added ${dept} to departments list`);
}

export async function seedDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // seed-data.json lives at artifacts/api-server/seed-data.json
  // esbuild bundles everything into dist/index.mjs, so __dirname resolves to dist/
  // One level up from dist/ lands at artifacts/api-server/
  const seedFile = path.resolve(__dirname, "../seed-data.json");
  const base = path.resolve(__dirname, "..");

  const client = await pool.connect();

  try {
    // Seed each table independently if empty — runs even when main seed is skipped
    await seedTableIfEmpty(client, "fto_doc_items", path.join(base, "fto-seed.json"));
    await seedTableIfEmpty(client, "ex_pd_officers", path.join(base, "ex-pd-seed.json"));
    await seedTableIfEmpty(client, "duty_adjustments", path.join(base, "duty-adjustments-seed.json"));
    await seedTableIfEmpty(client, "staff_roles", path.join(base, "staff-roles-seed.json"), "upsert", '"discord_uid"');

    // Always upsert student progressions — syncs progress fields even if rows already exist
    await syncStudentProgressions(client, path.join(base, "student-progressions-seed.json"));

    // Ensure PTA is in the departments list
    await ensureDepartmentExists(client, "PTA");

    if (!existsSync(seedFile)) {
      logger.info("No seed-data.json found — skipping main seed");
      return;
    }

    const officerCount = await tableCount(client, "officers");
    if (officerCount > 0) {
      logger.info({ officerCount }, "Database already seeded — skipping main seed");
      return;
    }

    logger.info("Database is empty — seeding initial data...");
    const dump = JSON.parse(readFileSync(seedFile, "utf-8")) as Record<string, Record<string, unknown>[]>;

    const officerUpdate = [
      "call_sign","citizen_id","name","phone_number","department","rank","division",
      "status","timezone","date_of_joining","last_promotion","pilot","mdt","seu",
      "smg","rifle","shotgun","rifle_tier_ii","ftp","is_management","strikes_major",
      "strikes_minor","discord_username","discord_uid","discord_id","rockstar_license_id",
      "fivem_name","duty_hours","completion_status","appointed_fto","week_period"
    ].map(c => `${c}=EXCLUDED.${c}`).join(",");

    const tables: Array<{ table: string; type: "insert" | "upsert"; conflict?: string; update?: string }> = [
      { table: "officers", type: "upsert", conflict: '"id"', update: officerUpdate },
      { table: "ems_duty_logs", type: "insert" },
      { table: "discord_duty_events", type: "upsert", conflict: '"discord_message_id"' },
      { table: "shift_configs", type: "upsert", conflict: '"key"', update: "label=EXCLUDED.label,sub=EXCLUDED.sub,icon=EXCLUDED.icon,start_hour=EXCLUDED.start_hour,end_hour=EXCLUDED.end_hour,sort_order=EXCLUDED.sort_order" },
      { table: "site_settings", type: "upsert", conflict: '"key"', update: "value=EXCLUDED.value,updated_at=EXCLUDED.updated_at" },
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
      const rows = dump[t.table] || [];
      let n: number;
      if (t.type === "upsert") {
        n = await upsertRows(client, t.table, rows, t.conflict!, t.update);
      } else {
        n = await insertRows(client, t.table, rows);
      }
      await resetSeq(client, t.table);
      logger.info({ table: t.table, inserted: n, total: rows.length }, "Seeded table");
    }

    logger.info("Seed complete");
  } finally {
    client.release();
  }
}
