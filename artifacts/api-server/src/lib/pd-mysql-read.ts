import mysql from "mysql2/promise";
import { DEFAULT_SETTINGS } from "@workspace/db";

const databaseUrl = process.env.DATABASE_URL ?? "";

function getProtocol(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).protocol;
  } catch {
    return "invalid:";
  }
}

export const isMysqlDatabaseUrl =
  getProtocol(databaseUrl) === "mysql:" || getProtocol(databaseUrl) === "mariadb:";

let mysqlPool: mysql.Pool | null = null;

function getMysqlPool(): mysql.Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!isMysqlDatabaseUrl) {
    throw new Error("DATABASE_URL is not a MySQL/MariaDB URL.");
  }
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return mysqlPool;
}

export async function mysqlQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getMysqlPool().query(query, params);
  return rows as T[];
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

type MysqlOfficerRow = {
  id: number;
  call_sign: string | null;
  citizen_id: string | null;
  name: string | null;
  phone_number: string | null;
  department: string | null;
  rank: string | null;
  division: string | null;
  status: string | null;
  timezone: string | null;
  date_of_joining: string | null;
  last_promotion: string | null;
  pilot: unknown;
  mdt: unknown;
  seu: unknown;
  smg: unknown;
  rifle: unknown;
  shotgun: unknown;
  rifle_tier_ii: unknown;
  ftp: unknown;
  is_management: unknown;
  strikes_major: string | null;
  strikes_minor: string | null;
  discord_username: string | null;
  discord_uid: string | null;
  discord_id: string | null;
  rockstar_license_id: string | null;
  fivem_name: string | null;
  duty_hours: string | null;
  completion_status: string | null;
  appointed_fto: string | null;
  week_period: string | null;
  created_at: unknown;
};

type MysqlDutyLogRow = {
  id: number;
  cs_number: string | null;
  name: string | null;
  status: string | null;
  rank: string | null;
  week_period: string | null;
  duty_year: string | null;
  duty_hours: string | null;
  shift_type: string | null;
  created_at: unknown;
};

type MysqlDutyEventRow = {
  id: number;
  license_id: string | null;
  officer_name: string | null;
  rank: string | null;
  event_type: string | null;
  event_at: unknown;
  discord_message_id: string | null;
  week_period: string | null;
  created_at: unknown;
};

type MysqlDutyAdjustmentRow = {
  id: number;
  officer_cs: string | null;
  officer_name: string | null;
  duty_month: string | null;
  duty_year: string | null;
  shift_type: string | null;
  adjustment_seconds: number | null;
  note: string | null;
  created_at: unknown;
};

type MysqlShiftConfigRow = {
  key: string | null;
  label: string | null;
  sub: string | null;
  icon: string | null;
  start_hour: number | null;
  end_hour: number | null;
  sort_order: number | null;
};

type MysqlSiteSettingRow = {
  key: string;
  value: string;
  updated_at: unknown;
};

export async function getMysqlOfficers() {
  const rows = await mysqlQuery<MysqlOfficerRow>(
    `SELECT * FROM pd_officers ORDER BY rank ASC, call_sign ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    callSign: row.call_sign ?? "",
    citizenId: row.citizen_id ?? null,
    name: row.name ?? null,
    phoneNumber: row.phone_number ?? null,
    department: row.department ?? "",
    rank: row.rank ?? "",
    division: row.division ?? null,
    status: row.status ?? "Vacant",
    timezone: row.timezone ?? null,
    dateOfJoining: row.date_of_joining ?? null,
    lastPromotion: row.last_promotion ?? null,
    pilot: asBool(row.pilot),
    mdt: asBool(row.mdt),
    seu: asBool(row.seu),
    smg: asBool(row.smg),
    rifle: asBool(row.rifle),
    shotgun: asBool(row.shotgun),
    rifleTierII: asBool(row.rifle_tier_ii),
    ftp: asBool(row.ftp),
    isManagement: asBool(row.is_management),
    strikesMajor: row.strikes_major ?? "0/4",
    strikesMinor: row.strikes_minor ?? "0/2",
    discordUsername: row.discord_username ?? null,
    discordUid: row.discord_uid ?? null,
    discordId: row.discord_id ?? "",
    rockstarLicenseId: row.rockstar_license_id ?? null,
    fivemName: row.fivem_name ?? null,
    dutyHours: row.duty_hours ?? null,
    completionStatus: row.completion_status ?? null,
    appointedFto: row.appointed_fto ?? null,
    weekPeriod: row.week_period ?? "",
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlDutyLogs() {
  const rows = await mysqlQuery<MysqlDutyLogRow>(
    `SELECT * FROM pd_duty_hour_totals ORDER BY week_period DESC, cs_number ASC, id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    csNumber: row.cs_number ?? "",
    name: row.name ?? "",
    status: row.status ?? "Active",
    rank: row.rank ?? "",
    weekPeriod: row.week_period ?? "",
    dutyYear: row.duty_year ?? null,
    dutyHours: row.duty_hours ?? null,
    shiftType: row.shift_type ?? "ALL",
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlDutyEvents() {
  const rows = await mysqlQuery<MysqlDutyEventRow>(
    `SELECT * FROM pd_discord_duty_events ORDER BY event_at DESC, id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    licenseId: row.license_id ?? "",
    officerName: row.officer_name ?? "",
    rank: row.rank ?? null,
    eventType: row.event_type ?? "",
    eventAt: asDate(row.event_at),
    discordMessageId: row.discord_message_id ?? "",
    weekPeriod: row.week_period ?? "",
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlDutyAdjustments() {
  const rows = await mysqlQuery<MysqlDutyAdjustmentRow>(
    `SELECT * FROM pd_duty_adjustments ORDER BY created_at DESC, id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    officerCs: row.officer_cs ?? "",
    officerName: row.officer_name ?? null,
    dutyMonth: row.duty_month ?? "",
    dutyYear: row.duty_year ?? "",
    shiftType: row.shift_type ?? "ALL",
    adjustmentSeconds: Number(row.adjustment_seconds ?? 0),
    note: row.note ?? null,
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlShiftConfigs() {
  const rows = await mysqlQuery<MysqlShiftConfigRow>(
    `SELECT * FROM pd_shift_configs ORDER BY sort_order ASC, \`key\` ASC`,
  );
  return rows.map((row) => ({
    key: row.key ?? "",
    label: row.label ?? "",
    sub: row.sub ?? "",
    icon: row.icon ?? "●",
    startHour: Number(row.start_hour ?? 0),
    endHour: Number(row.end_hour ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function getMysqlSettings() {
  const rows = await mysqlQuery<MysqlSiteSettingRow>(
    `SELECT * FROM pd_site_settings ORDER BY \`key\` ASC`,
  );
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

export async function getMysqlSetting(key: string): Promise<string | null> {
  const rows = await mysqlQuery<MysqlSiteSettingRow>(
    `SELECT * FROM pd_site_settings WHERE \`key\` = ? LIMIT 1`,
    [key],
  );
  const value = rows[0]?.value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function setMysqlSetting(key: string, value: unknown): Promise<void> {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  await mysqlQuery(
    `INSERT INTO pd_site_settings (\`key\`, value, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
    [key, serialized],
  );
}
