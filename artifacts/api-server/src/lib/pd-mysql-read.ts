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

export async function mysqlExecute(
  query: string,
  params: unknown[] = [],
): Promise<mysql.ResultSetHeader> {
  const [result] = await getMysqlPool().execute(query, params);
  return result as mysql.ResultSetHeader;
}

const NEXT_ID_TABLES = new Set([
  "pd_officers",
  "pd_duty_logs",
  "pd_duty_adjustments",
  "pd_fto_doc_items",
  "pd_ex_pd_officers",
  "pd_staff_roles",
  "pd_qualification_chart",
  "pd_admin_logs",
  "pd_discord_duty_events",
  "pd_citations",
  "pd_fir",
  "pd_student_progressions",
  "pd_duty_hour_totals",
  "pd_discord_channels",
  "pd_citation_deletion_logs",
]);

export async function getNextMysqlId(tableName: string): Promise<number> {
  if (!NEXT_ID_TABLES.has(tableName)) {
    throw new Error(`Table ${tableName} is not allowed for next-id lookup.`);
  }
  const rows = await mysqlQuery<{ nextId: number | string | null }>(
    `SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM ${tableName}`,
  );
  return Number(rows[0]?.nextId ?? 1);
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

function asBangladeshWallTimeDate(value: unknown): Date {
  const offsetMinutes = 6 * 60;

  if (value instanceof Date) {
    return new Date(value.getTime() - offsetMinutes * 60_000);
  }

  const text = asString(value)?.trim();
  if (text) {
    const match = text.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (match) {
      const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
      return new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
          0,
        ) - offsetMinutes * 60_000,
      );
    }
  }

  return asDate(value);
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function parseTimeHours(value: unknown): number {
  const text = asString(value)?.trim();
  if (!text) return 0;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.length === 2) {
    return (parts[0] ?? 0) + (parts[1] ?? 0) / 60;
  }
  if (parts.length === 3) {
    return (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function parseJsonObject(value: unknown): Record<string, string> | null {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [
          key,
          asString(item) ?? "",
        ]),
      );
    }
  } catch {
    return {};
  }
  return {};
}

function toMysqlDateOnly(value: unknown): string {
  return asDate(value).toISOString().slice(0, 10);
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

type MysqlStaffRoleJoinedRow = {
  id: number;
  isSuperAdmin: unknown;
  isSeniorStaff: unknown;
  isStaff: unknown;
  isTrusted: unknown;
  discord_uid: string | null;
  display_name: string | null;
  added_by: string | null;
  created_at: unknown;
};

type MysqlPanelLogRow = {
  id: number;
  action_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  changed_by: string | null;
  changed_by_uid: string | null;
  changes: string | null;
  created_at: unknown;
};

type MysqlRawDutyLogRow = {
  id: number;
  log_date: unknown;
  start_time: string | null;
  end_time: string | null;
  cs_number: string | null;
  officer_name: string | null;
  rank: string | null;
  shift_type: string | null;
  duration: string | null;
  notes: string | null;
  created_at: unknown;
};

type MysqlExPdOfficerRow = {
  id: number;
  call_sign: string | null;
  character_id: string | null;
  name: string | null;
  phone_no: string | null;
  division: string | null;
  rank: string | null;
  discord_username: string | null;
  discord_uid: string | null;
  rockstar_license_id: string | null;
  steam_profile: string | null;
  steam_64_hex_id: string | null;
  steam_2_id: string | null;
  insurance: string | null;
  status: string | null;
  exit_date: string | null;
  date_of_joining: string | null;
  last_promotion: string | null;
  air1: unknown;
  speed: unknown;
  notes: string | null;
  created_at: unknown;
  updated_at: unknown;
};

type MysqlCitationRow = {
  id: number;
  discord_message_id: string | null;
  title: string | null;
  incident: string | null;
  location: string | null;
  evidence: string | null;
  incident_report: string | null;
  suspect_name: string | null;
  suspect_cid: string | null;
  suspect_contact: string | null;
  charges: string | null;
  officer_name: string | null;
  raw_content: string | null;
  posted_at: unknown;
  created_at: unknown;
};

type MysqlCitationTopOfficerRow = {
  officer_name: string | null;
  citations: number | string | null;
};

type MysqlStudentProgressionRow = {
  id: number;
  badge_number: string | null;
  discord_id: string | null;
  discord_name: string | null;
  name: string | null;
  timezone: string | null;
  current_phase: string | null;
  status: string | null;
  strikes: string | null;
  hire_date: string | null;
  loa_end_date: string | null;
  discord_interview: unknown;
  in_city_interview: unknown;
  basic_training: unknown;
  obs_h2: unknown;
  obs_h4: unknown;
  obs_h6: unknown;
  obs_h8: unknown;
  obs_h10: unknown;
  obs_h12: unknown;
  obs_h14: unknown;
  mdt: unknown;
  advance_training: unknown;
  neg_pri: unknown;
  neg_sec: unknown;
  neg_ter: unknown;
  neg_par: unknown;
  inc_pri: unknown;
  inc_sec: unknown;
  inc_ter: unknown;
  inc_par: unknown;
  evi_pri: unknown;
  evi_sec: unknown;
  evi_ter: unknown;
  evi_par: unknown;
  sus_pri: unknown;
  sus_sec: unknown;
  sus_ter: unknown;
  sus_par: unknown;
  drv_pri: unknown;
  drv_sec: unknown;
  drv_ter: unknown;
  drv_par: unknown;
  t11_pri: unknown;
  t11_sec: unknown;
  t11_ter: unknown;
  t11_par: unknown;
  pit: unknown;
  pit_sec: unknown;
  pit_ter: unknown;
  calls_911: unknown;
  drv_solo: unknown;
  t11_solo: unknown;
  pit_par: unknown;
  solo_ready: unknown;
  solo_start_date: string | null;
  eligible_trooper_date: string | null;
  cleared_trooper: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type MysqlQualificationRow = {
  id: number;
  name: string | null;
  discord_uid: string | null;
  rank: string | null;
  department: string | null;
  days_in_rank: number | string | null;
  hours_in_rank: number | string | null;
  citation_count: number | string | null;
  fir_count: number | string | null;
  last_promotion: string | null;
  strikes_major: string | null;
  strikes_minor: string | null;
  qual_status: string | null;
  notes: string | null;
  ftb_votes: string | null;
  hc_votes: string | null;
};

type MysqlFtoDocItemRow = {
  id: number;
  doc_id: string | null;
  section_id: string | null;
  item_text: string | null;
  item_type: string | null;
  is_important: unknown;
  is_highlight: unknown;
  sort_order: number | null;
  created_at: unknown;
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
    eventAt: asBangladeshWallTimeDate(row.event_at),
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
  const updated = await mysqlExecute(
    `UPDATE pd_site_settings SET value = ?, updated_at = NOW() WHERE \`key\` = ?`,
    [serialized, key],
  );
  if (updated.affectedRows > 0) return;
  await mysqlExecute(
    `INSERT INTO pd_site_settings (\`key\`, value, updated_at) VALUES (?, ?, NOW())`,
    [key, serialized],
  );
}

export async function getMysqlOfficersList() {
  const rows = await mysqlQuery<MysqlOfficerRow>(
    `SELECT id, call_sign, name, rank, discord_uid, discord_username
     FROM pd_officers
     ORDER BY call_sign ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    callSign: row.call_sign ?? "",
    name: row.name ?? null,
    rank: row.rank ?? null,
    discordUid: row.discord_uid ?? null,
    discordUsername: row.discord_username ?? null,
  }));
}

export async function searchMysqlOfficers(query: string, limit = 10) {
  const like = `%${query.trim()}%`;
  const rows = await mysqlQuery<MysqlOfficerRow>(
    `SELECT id, call_sign, name, rank, discord_uid, discord_username
     FROM pd_officers
     WHERE name LIKE ? OR call_sign LIKE ?
     ORDER BY call_sign ASC, id ASC
     LIMIT ?`,
    [like, like, limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    callSign: row.call_sign ?? "",
    name: row.name ?? null,
    rank: row.rank ?? null,
    discordUid: row.discord_uid ?? null,
    discordUsername: row.discord_username ?? null,
  }));
}

export async function getMysqlStaffRoles() {
  const rows = await mysqlQuery<MysqlStaffRoleJoinedRow>(
    `SELECT *
     FROM pd_staff_roles
     ORDER BY created_at ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    isSuperAdmin: asBool(row.isSuperAdmin),
    isSeniorStaff: asBool(row.isSeniorStaff),
    isStaff: asBool(row.isStaff),
    isTrusted: asBool(row.isTrusted),
    discordUid: row.discord_uid ?? "",
    displayName: row.display_name ?? null,
    addedBy: row.added_by ?? null,
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlAdminDutyLogs(filters: {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  shiftType?: string;
}) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters.shiftType && filters.shiftType !== "All") {
    conditions.push("shift_type = ?");
    params.push(filters.shiftType);
  }
  if (filters.dateFrom) {
    conditions.push("DATE(log_date) >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("DATE(log_date) <= ?");
    params.push(filters.dateTo);
  }
  if (filters.search?.trim()) {
    conditions.push("(officer_name LIKE ? OR cs_number LIKE ?)");
    const like = `%${filters.search.trim()}%`;
    params.push(like, like);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await mysqlQuery<MysqlRawDutyLogRow>(
    `SELECT *
     FROM pd_duty_logs
     ${whereClause}
     ORDER BY log_date DESC, created_at DESC, id DESC`,
    params,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    logDate: toMysqlDateOnly(row.log_date),
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    csNumber: row.cs_number ?? "",
    officerName: row.officer_name ?? "",
    rank: row.rank ?? "",
    shiftType: row.shift_type ?? "Full",
    duration: row.duration ?? "00:00:00",
    notes: row.notes ?? null,
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlPanelLogs(limit = 100, offset = 0) {
  const rows = await mysqlQuery<MysqlPanelLogRow>(
    `SELECT *
     FROM pd_admin_logs
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    actionType: row.action_type ?? "UNKNOWN",
    entityType: row.entity_type ?? "panel",
    entityId: row.entity_id ?? null,
    entityName: row.entity_name ?? null,
    changedBy: row.changed_by ?? "Unknown",
    changedByUid: row.changed_by_uid ?? null,
    changes: parseJsonObject(row.changes),
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlExPdOfficers(filters: {
  search?: string;
  division?: string;
  status?: string;
}) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (filters.division && filters.division !== "ALL") {
    conditions.push("division = ?");
    params.push(filters.division);
  }
  if (filters.status && filters.status !== "ALL") {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.search?.trim()) {
    const like = `%${filters.search.trim()}%`;
    conditions.push(
      `(name LIKE ? OR call_sign LIKE ? OR character_id LIKE ? OR discord_username LIKE ? OR division LIKE ? OR rank LIKE ?)`,
    );
    params.push(like, like, like, like, like, like);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await mysqlQuery<MysqlExPdOfficerRow>(
    `SELECT *
     FROM pd_ex_pd_officers
     ${whereClause}
     ORDER BY id ASC`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    callSign: row.call_sign ?? null,
    characterId: row.character_id ?? null,
    name: row.name ?? "",
    phoneNo: row.phone_no ?? null,
    division: row.division ?? null,
    rank: row.rank ?? null,
    discordUsername: row.discord_username ?? null,
    discordUid: row.discord_uid ?? null,
    rockstarLicenseId: row.rockstar_license_id ?? null,
    steamProfile: row.steam_profile ?? null,
    steam64HexId: row.steam_64_hex_id ?? null,
    steam2Id: row.steam_2_id ?? null,
    insurance: row.insurance ?? null,
    status: row.status ?? null,
    exitDate: row.exit_date ?? null,
    dateOfJoining: row.date_of_joining ?? null,
    lastPromotion: row.last_promotion ?? null,
    air1: asBool(row.air1),
    speed: asBool(row.speed),
    notes: row.notes ?? null,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  }));
}

export async function getMysqlCitations(filters: {
  search?: string;
  officer?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(filters.limit ?? 1000), 1), 10000);
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (filters.search?.trim()) {
    const like = `%${filters.search.trim()}%`;
    conditions.push(
      `(suspect_name LIKE ? OR suspect_cid LIKE ? OR charges LIKE ? OR officer_name LIKE ? OR title LIKE ? OR incident LIKE ?)`,
    );
    params.push(like, like, like, like, like, like);
  } else if (filters.officer?.trim()) {
    conditions.push("officer_name LIKE ?");
    params.push(`%${filters.officer.trim()}%`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);
  const rows = await mysqlQuery<MysqlCitationRow>(
    `SELECT *
     FROM pd_citations
     ${whereClause}
     ORDER BY posted_at DESC, id DESC
     LIMIT ?`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    discordMessageId: row.discord_message_id ?? null,
    title: row.title ?? null,
    incident: row.incident ?? null,
    location: row.location ?? null,
    evidence: row.evidence ?? null,
    incidentReport: row.incident_report ?? null,
    suspectName: row.suspect_name ?? null,
    suspectCid: row.suspect_cid ?? null,
    suspectContact: row.suspect_contact ?? null,
    charges: row.charges ?? null,
    officerName: row.officer_name ?? null,
    rawContent: row.raw_content ?? null,
    postedAt: asDate(row.posted_at),
    createdAt: asDate(row.created_at),
  }));
}

export async function getMysqlCitationStats() {
  const totalRows = await mysqlQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pd_citations`,
  );
  const topOfficers = await mysqlQuery<MysqlCitationTopOfficerRow>(
    `SELECT officer_name, COUNT(*) AS citations
     FROM pd_citations
     WHERE officer_name IS NOT NULL AND officer_name <> ''
     GROUP BY officer_name
     ORDER BY citations DESC
     LIMIT 10`,
  );
  return {
    total: Number(totalRows[0]?.count ?? 0),
    topOfficers: topOfficers.map((row) => ({
      officer_name: row.officer_name ?? "Unknown",
      citations: Number(row.citations ?? 0),
    })),
  };
}

export async function getMysqlStudentProgressions() {
  const rows = await mysqlQuery<MysqlStudentProgressionRow>(
    `SELECT * FROM pd_student_progressions ORDER BY id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    badgeNumber: row.badge_number ?? null,
    discordId: row.discord_id ?? null,
    discordName: row.discord_name ?? null,
    name: row.name ?? "",
    timezone: row.timezone ?? null,
    currentPhase: row.current_phase ?? "Phase 1",
    status: row.status ?? "Active",
    strikes: row.strikes ?? "0/4",
    hireDate: row.hire_date ?? null,
    loaEndDate: row.loa_end_date ?? null,
    discordInterview: asBool(row.discord_interview),
    inCityInterview: asBool(row.in_city_interview),
    basicTraining: asBool(row.basic_training),
    obsH2: asBool(row.obs_h2),
    obsH4: asBool(row.obs_h4),
    obsH6: asBool(row.obs_h6),
    obsH8: asBool(row.obs_h8),
    obsH10: asBool(row.obs_h10),
    obsH12: asBool(row.obs_h12),
    obsH14: asBool(row.obs_h14),
    mdt: asBool(row.mdt),
    advanceTraining: asBool(row.advance_training),
    negPri: asBool(row.neg_pri),
    negSec: asBool(row.neg_sec),
    negTer: asBool(row.neg_ter),
    negPar: asBool(row.neg_par),
    incPri: asBool(row.inc_pri),
    incSec: asBool(row.inc_sec),
    incTer: asBool(row.inc_ter),
    incPar: asBool(row.inc_par),
    eviPri: asBool(row.evi_pri),
    eviSec: asBool(row.evi_sec),
    eviTer: asBool(row.evi_ter),
    eviPar: asBool(row.evi_par),
    susPri: asBool(row.sus_pri),
    susSec: asBool(row.sus_sec),
    susTer: asBool(row.sus_ter),
    susPar: asBool(row.sus_par),
    drvPri: asBool(row.drv_pri),
    drvSec: asBool(row.drv_sec),
    drvTer: asBool(row.drv_ter),
    drvPar: asBool(row.drv_par),
    t11Pri: asBool(row.t11_pri),
    t11Sec: asBool(row.t11_sec),
    t11Ter: asBool(row.t11_ter),
    t11Par: asBool(row.t11_par),
    pit: asBool(row.pit),
    pitSec: asBool(row.pit_sec),
    pitTer: asBool(row.pit_ter),
    calls911: asBool(row.calls_911),
    drvSolo: asBool(row.drv_solo),
    t11Solo: asBool(row.t11_solo),
    pitPar: asBool(row.pit_par),
    soloReady: asBool(row.solo_ready),
    soloStartDate: row.solo_start_date ?? null,
    eligibleTrooperDate: row.eligible_trooper_date ?? null,
    clearedTrooper: asBool(row.cleared_trooper),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  }));
}

export async function getMysqlQualificationEntries() {
  const rows = await mysqlQuery<MysqlQualificationRow>(
    `SELECT *
     FROM pd_qualification_chart
     ORDER BY department ASC, rank ASC, name ASC, id ASC`,
  );
  const allowedStatuses = new Set([
    "QUALIFIED",
    "QUALIFIED Sergeant Exam",
    "NOT QUALIFIED",
    "DUTY HOURS NOT COMPLETED",
    "DAYS NOT COMPLETED",
    "PROMOTION ON HOLD",
    "Sergeant Exam",
    "Deputy exam",
    "Trooper Exam",
  ]);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name ?? "",
    discordUid: row.discord_uid ?? null,
    rank: row.rank ?? null,
    department: row.department ?? null,
    daysInRank: row.days_in_rank != null ? Number(row.days_in_rank) || 0 : null,
    hoursInRank: row.hours_in_rank != null ? Number(row.hours_in_rank) || 0 : 0,
    citationCount: Number(row.citation_count ?? 0),
    citationAutoCount: 0,
    firCount: Number(row.fir_count ?? 0),
    acceptedFirCount: 0,
    lastPromotion: row.last_promotion ?? null,
    joiningDate: null,
    strikesMajor: row.strikes_major ?? "0/4",
    strikesMinor: row.strikes_minor ?? "0/2",
    qualStatus: row.qual_status && allowedStatuses.has(row.qual_status) ? row.qual_status : null,
    notes: row.notes ?? null,
    ftbVotes: parseJsonObject(row.ftb_votes),
    hcVotes: parseJsonObject(row.hc_votes),
    rosterLinked: true,
  }));
}

export async function getMysqlFtpMembers() {
  const rows = await mysqlQuery<MysqlOfficerRow>(
    `SELECT name, rank, call_sign
     FROM pd_officers
     WHERE ftp = 1 OR is_management = 1
     ORDER BY rank ASC, call_sign ASC`,
  );
  return {
    members: rows.map((row) => ({
      name: row.name ?? row.call_sign ?? "",
      rank: row.rank ?? "",
    })),
  };
}

export async function getMysqlFtoDocItems() {
  const rows = await mysqlQuery<MysqlFtoDocItemRow>(
    `SELECT *
     FROM pd_fto_doc_items
     ORDER BY doc_id ASC, sort_order ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    docId: row.doc_id ?? "",
    sectionId: row.section_id ?? "",
    itemText: row.item_text ?? "",
    itemType: row.item_type ?? "bullet",
    isImportant: asBool(row.is_important),
    isHighlight: asBool(row.is_highlight),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: asDate(row.created_at),
  }));
}
