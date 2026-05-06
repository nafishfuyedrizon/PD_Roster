import { pool } from "@workspace/db";
import { createConnection } from "mysql2/promise";
import type { Connection } from "mysql2/promise";
import { logger } from "./logger";

type SourceColumn = {
  column_name: string;
  data_type: string;
  udt_name: string;
};

const MIRROR_URL = process.env.PD_MIRROR_DATABASE_URL ?? "";
const MIRROR_SYNC_SECONDS = Math.max(
  5,
  Number.parseInt(process.env.PD_MIRROR_SYNC_SECONDS ?? "10", 10) || 10,
);

const SOURCE_TABLES = [
  "admin_logs",
  "citation_deletion_logs",
  "discord_channels",
  "ex_pd_officers",
  "fto_doc_items",
  "officers",
  "pd_citations",
  "pd_discord_duty_events",
  "pd_duty_adjustments",
  "pd_duty_hour_totals",
  "pd_duty_logs",
  "pd_fir",
  "pd_shift_configs",
  "qualification_chart",
  "site_settings",
  "staff_roles",
  "student_progressions",
] as const;

let syncTimer: NodeJS.Timeout | null = null;
let syncInFlight = false;

function targetTableName(sourceTable: string): string {
  return sourceTable.startsWith("pd_") ? sourceTable : `pd_${sourceTable}`;
}

function quotePgIdent(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function quoteMyIdent(value: string): string {
  return `\`${value.replace(/`/g, "``")}\``;
}

function toMySqlType(column: SourceColumn): string {
  const dataType = column.data_type.toLowerCase();
  const udtName = column.udt_name.toLowerCase();

  if (dataType === "boolean") return "TINYINT(1)";
  if (dataType === "smallint") return "INT";
  if (dataType === "integer") return "INT";
  if (dataType === "bigint") return "BIGINT";
  if (dataType === "real" || dataType === "double precision") return "DOUBLE";
  if (dataType === "numeric" || dataType === "decimal") return "DECIMAL(30,10)";
  if (dataType === "date") return "DATE";
  if (dataType.startsWith("timestamp")) return "DATETIME";
  if (dataType.startsWith("time")) return "TIME";
  if (dataType === "json" || dataType === "jsonb") return "LONGTEXT";
  if (udtName === "uuid") return "VARCHAR(64)";
  return "LONGTEXT";
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function getSourceColumns(table: string): Promise<SourceColumn[]> {
  const result = await pool.query<SourceColumn>(
    `
      select column_name, data_type, udt_name
      from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position
    `,
    [table],
  );
  return result.rows;
}

async function createTargetTable(
  mysql: Connection,
  sourceTable: string,
  physicalTable: string,
  targetTable: string,
  columns: SourceColumn[],
): Promise<void> {
  const columnDefs = columns.map((column) => {
    return `${quoteMyIdent(column.column_name)} ${toMySqlType(column)} NULL`;
  });

  await mysql.query(`DROP TABLE IF EXISTS ${quoteMyIdent(physicalTable)}`);
  await mysql.query(
    `
      CREATE TABLE ${quoteMyIdent(physicalTable)} (
        ${columnDefs.join(",\n        ")}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  );

  logger.info({ sourceTable, targetTable, columnCount: columns.length }, "Recreated MariaDB mirror table");
}

async function swapStagedTable(
  mysql: Connection,
  targetTable: string,
  stagedTable: string,
): Promise<void> {
  const backupTable = `${targetTable}__old`;
  const [matches] = await mysql.query(`SHOW TABLES LIKE ?`, [targetTable]);
  const hasExistingTarget = Array.isArray(matches) && matches.length > 0;

  await mysql.query(`DROP TABLE IF EXISTS ${quoteMyIdent(backupTable)}`);

  if (hasExistingTarget) {
    await mysql.query(
      `RENAME TABLE ${quoteMyIdent(targetTable)} TO ${quoteMyIdent(backupTable)}, ${quoteMyIdent(stagedTable)} TO ${quoteMyIdent(targetTable)}`,
    );
    await mysql.query(`DROP TABLE ${quoteMyIdent(backupTable)}`);
    return;
  }

  await mysql.query(`RENAME TABLE ${quoteMyIdent(stagedTable)} TO ${quoteMyIdent(targetTable)}`);
}

async function copyTable(mysql: Connection, sourceTable: string): Promise<number> {
  const targetTable = targetTableName(sourceTable);
  const stagedTable = `${targetTable}__next`;
  const columns = await getSourceColumns(sourceTable);

  if (columns.length === 0) {
    logger.warn({ sourceTable }, "Skipping MariaDB mirror for table with no columns");
    return 0;
  }

  await createTargetTable(mysql, sourceTable, stagedTable, targetTable, columns);

  const selectSql = `select * from ${quotePgIdent(sourceTable)}`;
  const result = await pool.query<Record<string, unknown>>(selectSql);
  const rows = result.rows;

  if (rows.length === 0) {
    await swapStagedTable(mysql, targetTable, stagedTable);
    logger.info({ sourceTable, targetTable }, "MariaDB mirror table created with no rows");
    return 0;
  }

  const columnNames = columns.map((column) => column.column_name);
  const insertColumns = columnNames.map(quoteMyIdent).join(", ");
  const rowPlaceholder = `(${columnNames.map(() => "?").join(", ")})`;
  const chunkSize = 200;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    for (const row of chunk) {
      for (const columnName of columnNames) {
        values.push(normalizeValue(row[columnName]));
      }
    }

    const placeholders = chunk.map(() => rowPlaceholder).join(", ");
    await mysql.query(
      `INSERT INTO ${quoteMyIdent(stagedTable)} (${insertColumns}) VALUES ${placeholders}`,
      values,
    );
  }

  await swapStagedTable(mysql, targetTable, stagedTable);
  logger.info({ sourceTable, targetTable, rowCount: rows.length }, "MariaDB mirror table synced");
  return rows.length;
}

export async function runPdMariaMirrorOnce(): Promise<void> {
  if (!MIRROR_URL) {
    logger.warn("PD_MIRROR_DATABASE_URL not set — MariaDB mirror disabled");
    return;
  }

  if (syncInFlight) {
    logger.info("MariaDB mirror sync already in progress — skipping overlapping run");
    return;
  }

  syncInFlight = true;
  const mysql = await createConnection(MIRROR_URL);

  try {
    let totalRows = 0;
    for (const sourceTable of SOURCE_TABLES) {
      totalRows += await copyTable(mysql, sourceTable);
    }
    logger.info({ tableCount: SOURCE_TABLES.length, totalRows }, "MariaDB mirror sync complete");
  } finally {
    syncInFlight = false;
    await mysql.end();
  }
}

export function startPdMariaMirror(): void {
  if (!MIRROR_URL) {
    logger.warn("PD_MIRROR_DATABASE_URL not set — MariaDB mirror will not start");
    return;
  }

  void runPdMariaMirrorOnce().catch((err) => {
    logger.error({ err }, "Initial MariaDB mirror sync failed");
  });

  if (syncTimer) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(() => {
    void runPdMariaMirrorOnce().catch((err) => {
      logger.error({ err }, "Scheduled MariaDB mirror sync failed");
    });
  }, MIRROR_SYNC_SECONDS * 1000);

  logger.info({ syncSeconds: MIRROR_SYNC_SECONDS }, "MariaDB mirror started");
}
