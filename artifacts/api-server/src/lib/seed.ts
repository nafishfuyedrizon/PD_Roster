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

async function seedFtoDocsIfEmpty(client: DbClient, baseDir: string): Promise<void> {
  const ftoCount = await tableCount(client, "fto_doc_items");
  if (ftoCount > 0) {
    logger.info({ ftoCount }, "fto_doc_items already has data — skipping FTO seed");
    return;
  }

  const ftoFile = path.resolve(baseDir, "../fto-seed.json");
  if (!existsSync(ftoFile)) {
    logger.info("No fto-seed.json found — skipping FTO seed");
    return;
  }

  const rows = JSON.parse(readFileSync(ftoFile, "utf-8")) as Record<string, unknown>[];
  const n = await insertRows(client, "fto_doc_items", rows);
  await resetSeq(client, "fto_doc_items");
  logger.info({ inserted: n, total: rows.length }, "Seeded fto_doc_items");
}

export async function seedDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // seed-data.json lives at artifacts/api-server/seed-data.json
  // esbuild bundles everything into dist/index.mjs, so __dirname resolves to dist/
  // One level up from dist/ lands at artifacts/api-server/
  const seedFile = path.resolve(__dirname, "../seed-data.json");

  const client = await pool.connect();

  try {
    // Always seed FTO docs independently — they can be empty even on live servers
    await seedFtoDocsIfEmpty(client, __dirname);

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
