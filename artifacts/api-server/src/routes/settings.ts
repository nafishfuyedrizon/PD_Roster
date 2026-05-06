import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, siteSettingsTable, DEFAULT_SETTINGS } from "@workspace/db";
import { auditLog } from "../lib/audit.js";
import { guard } from "../lib/auth-guard.js";
import {
  getMysqlSettings,
  isMysqlDatabaseUrl,
  setMysqlSetting,
} from "../lib/pd-mysql-read.js";

const router: IRouter = Router();

async function ensureDefaults(): Promise<void> {
  const existing = await db.select({ key: siteSettingsTable.key }).from(siteSettingsTable);
  const existingKeys = new Set(existing.map((r) => r.key));
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!existingKeys.has(key)) {
      await db.insert(siteSettingsTable).values({ key, value: JSON.stringify(value) });
    }
  }
}

async function getAllSettings(): Promise<Record<string, unknown>> {
  if (isMysqlDatabaseUrl) {
    return getMysqlSettings();
  }
  await ensureDefaults();
  const rows = await db.select().from(siteSettingsTable);
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getAllSettings();
  res.json(settings);
});

router.put("/admin/settings", async (req, res): Promise<void> => {
  if (guard(req, res, 4)) return;
  const { key, value } = req.body as { key: string; value: unknown };
  if (!key) { res.status(400).json({ error: "key is required" }); return; }
  const serialized = JSON.stringify(value);
  if (isMysqlDatabaseUrl) {
    await setMysqlSetting(key, value);
    await auditLog(req, "UPDATE", "site-setting", null, key, { old: null, new: serialized });
    res.json({ ok: true, key, value });
    return;
  }
  const [existing] = await db.select({ value: siteSettingsTable.value }).from(siteSettingsTable).where(eq(siteSettingsTable.key, key)).limit(1);
  await db
    .insert(siteSettingsTable)
    .values({ key, value: serialized })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: serialized, updatedAt: new Date() } });
  await auditLog(req, "UPDATE", "site-setting", null, key, { old: existing?.value, new: serialized });
  res.json({ ok: true, key, value });
});

export default router;
export { getAllSettings };
