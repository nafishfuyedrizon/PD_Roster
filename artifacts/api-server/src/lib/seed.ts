import { pool } from "@workspace/db";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";

const PD_REGISTRAR_TABLES = {
  dutyHourTotals: "pd_duty_hour_totals",
  discordDutyEvents: "pd_discord_duty_events",
  shiftConfigs: "pd_shift_configs",
  dutyAdjustments: "pd_duty_adjustments",
} as const;

const LEGACY_PD_REGISTRAR_TABLES = {
  dutyHourTotals: "ems_duty_logs",
  discordDutyEvents: "discord_duty_events",
  shiftConfigs: "shift_configs",
  dutyAdjustments: "duty_adjustments",
} as const;

function val(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

type DbClient = Awaited<ReturnType<typeof pool.connect>>;

async function tableExists(client: DbClient, table: string): Promise<boolean> {
  const r = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = $1
          AND c.relkind = 'r'
      ) AS exists
    `,
    [table],
  );
  return !!r.rows[0]?.exists;
}

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

async function ensurePdRegistrarTables(client: DbClient): Promise<void> {
  const createStatements = [
    `
      CREATE TABLE IF NOT EXISTS "${PD_REGISTRAR_TABLES.dutyHourTotals}" (
        "id" serial PRIMARY KEY,
        "cs_number" text NOT NULL,
        "name" text NOT NULL,
        "status" text NOT NULL DEFAULT 'Active',
        "rank" text NOT NULL,
        "week_period" text NOT NULL,
        "duty_year" text,
        "duty_hours" text,
        "shift_type" text NOT NULL DEFAULT 'ALL',
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS "${PD_REGISTRAR_TABLES.discordDutyEvents}" (
        "id" serial PRIMARY KEY,
        "license_id" text NOT NULL,
        "officer_name" text NOT NULL,
        "rank" text,
        "event_type" text NOT NULL,
        "event_at" timestamptz NOT NULL,
        "discord_message_id" text NOT NULL UNIQUE,
        "week_period" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS "${PD_REGISTRAR_TABLES.shiftConfigs}" (
        "key" text PRIMARY KEY,
        "label" text NOT NULL,
        "sub" text NOT NULL DEFAULT '',
        "icon" text NOT NULL DEFAULT '●',
        "start_hour" integer NOT NULL,
        "end_hour" integer NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS "${PD_REGISTRAR_TABLES.dutyAdjustments}" (
        "id" serial PRIMARY KEY,
        "officer_cs" text NOT NULL,
        "officer_name" text,
        "duty_month" text NOT NULL,
        "duty_year" text NOT NULL,
        "shift_type" text NOT NULL DEFAULT 'ALL',
        "adjustment_seconds" integer NOT NULL,
        "note" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `,
  ];

  for (const statement of createStatements) {
    await client.query(statement);
  }

  const migrations: Array<{
    from: string;
    to: string;
    cols: string[];
    sequence?: string;
  }> = [
    {
      from: LEGACY_PD_REGISTRAR_TABLES.dutyHourTotals,
      to: PD_REGISTRAR_TABLES.dutyHourTotals,
      cols: ["id", "cs_number", "name", "status", "rank", "week_period", "duty_year", "duty_hours", "shift_type", "created_at"],
      sequence: "id",
    },
    {
      from: LEGACY_PD_REGISTRAR_TABLES.discordDutyEvents,
      to: PD_REGISTRAR_TABLES.discordDutyEvents,
      cols: ["id", "license_id", "officer_name", "rank", "event_type", "event_at", "discord_message_id", "week_period", "created_at"],
      sequence: "id",
    },
    {
      from: LEGACY_PD_REGISTRAR_TABLES.shiftConfigs,
      to: PD_REGISTRAR_TABLES.shiftConfigs,
      cols: ["key", "label", "sub", "icon", "start_hour", "end_hour", "sort_order"],
    },
    {
      from: LEGACY_PD_REGISTRAR_TABLES.dutyAdjustments,
      to: PD_REGISTRAR_TABLES.dutyAdjustments,
      cols: ["id", "officer_cs", "officer_name", "duty_month", "duty_year", "shift_type", "adjustment_seconds", "note", "created_at"],
      sequence: "id",
    },
  ];

  for (const migration of migrations) {
    if (!(await tableExists(client, migration.from))) continue;

    const cols = migration.cols.map((col) => `"${col}"`).join(", ");
    await client.query(`
      INSERT INTO "${migration.to}" (${cols})
      SELECT ${cols}
      FROM "${migration.from}"
      ON CONFLICT DO NOTHING
    `);

    if (migration.sequence) {
      await resetSeq(client, migration.to);
    }

    await client.query(`DROP TABLE "${migration.from}"`);
    logger.info({ from: migration.from, to: migration.to }, "Migrated PD registrar table to prefixed name");
  }

  const compatibilityViews = [
    `CREATE OR REPLACE VIEW "${LEGACY_PD_REGISTRAR_TABLES.dutyHourTotals}" AS SELECT * FROM "${PD_REGISTRAR_TABLES.dutyHourTotals}"`,
    `CREATE OR REPLACE VIEW "${LEGACY_PD_REGISTRAR_TABLES.discordDutyEvents}" AS SELECT * FROM "${PD_REGISTRAR_TABLES.discordDutyEvents}"`,
    `CREATE OR REPLACE VIEW "${LEGACY_PD_REGISTRAR_TABLES.shiftConfigs}" AS SELECT * FROM "${PD_REGISTRAR_TABLES.shiftConfigs}"`,
    `CREATE OR REPLACE VIEW "${LEGACY_PD_REGISTRAR_TABLES.dutyAdjustments}" AS SELECT * FROM "${PD_REGISTRAR_TABLES.dutyAdjustments}"`,
  ];

  for (const statement of compatibilityViews) {
    await client.query(statement);
  }
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
    await ensurePdRegistrarTables(client);

    // Seed each table independently if empty — runs even when main seed is skipped
    await seedTableIfEmpty(client, "fto_doc_items", path.join(base, "fto-seed.json"));
    await seedTableIfEmpty(client, "ex_pd_officers", path.join(base, "ex-pd-seed.json"));
    await seedTableIfEmpty(client, PD_REGISTRAR_TABLES.dutyAdjustments, path.join(base, "duty-adjustments-seed.json"));
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

    const tables: Array<{ dumpKey: string; table: string; type: "insert" | "upsert"; conflict?: string; update?: string }> = [
      { dumpKey: "officers", table: "officers", type: "upsert", conflict: '"id"', update: officerUpdate },
      { dumpKey: "ems_duty_logs", table: PD_REGISTRAR_TABLES.dutyHourTotals, type: "insert" },
      { dumpKey: "discord_duty_events", table: PD_REGISTRAR_TABLES.discordDutyEvents, type: "upsert", conflict: '"discord_message_id"' },
      { dumpKey: "shift_configs", table: PD_REGISTRAR_TABLES.shiftConfigs, type: "upsert", conflict: '"key"', update: "label=EXCLUDED.label,sub=EXCLUDED.sub,icon=EXCLUDED.icon,start_hour=EXCLUDED.start_hour,end_hour=EXCLUDED.end_hour,sort_order=EXCLUDED.sort_order" },
      { dumpKey: "site_settings", table: "site_settings", type: "upsert", conflict: '"key"', update: "value=EXCLUDED.value,updated_at=EXCLUDED.updated_at" },
      { dumpKey: "pd_duty_logs", table: "pd_duty_logs", type: "insert" },
      { dumpKey: "duty_adjustments", table: PD_REGISTRAR_TABLES.dutyAdjustments, type: "insert" },
      { dumpKey: "qualification_chart", table: "qualification_chart", type: "insert" },
      { dumpKey: "admin_logs", table: "admin_logs", type: "insert" },
      { dumpKey: "staff_roles", table: "staff_roles", type: "upsert", conflict: '"discord_uid"' },
      { dumpKey: "pd_citations", table: "pd_citations", type: "insert" },
      { dumpKey: "pd_fir", table: "pd_fir", type: "upsert", conflict: '"discord_message_id"' },
      { dumpKey: "citation_deletion_logs", table: "citation_deletion_logs", type: "insert" },
      { dumpKey: "student_progressions", table: "student_progressions", type: "insert" },
      { dumpKey: "ex_pd_officers", table: "ex_pd_officers", type: "insert" },
      { dumpKey: "fto_doc_items", table: "fto_doc_items", type: "insert" },
    ];

    for (const t of tables) {
      const rows = dump[t.dumpKey] || [];
      let n: number;
      if (t.type === "upsert") {
        n = await upsertRows(client, t.table, rows, t.conflict!, t.update);
      } else {
        n = await insertRows(client, t.table, rows);
      }
      await resetSeq(client, t.table);
      logger.info({ table: t.table, dumpKey: t.dumpKey, inserted: n, total: rows.length }, "Seeded table");
    }

    logger.info("Seed complete");
  } finally {
    client.release();
  }
}
