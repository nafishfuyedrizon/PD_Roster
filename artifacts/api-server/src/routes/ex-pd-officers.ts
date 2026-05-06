import { Router, type IRouter } from "express";
import { db, exPdOfficersTable } from "@workspace/db";
import { eq, ilike, or, sql } from "drizzle-orm";
import { auditLog } from "../lib/audit.js";
import { guard } from "../lib/auth-guard.js";
import {
  getMysqlExPdOfficers,
  isMysqlDatabaseUrl,
  mysqlExecute,
  mysqlQuery,
} from "../lib/pd-mysql-read.js";

const router: IRouter = Router();

router.get("/ex-pd-officers", async (req, res): Promise<void> => {
  const { search, division, status } = req.query as Record<string, string>;

  if (isMysqlDatabaseUrl) {
    res.json(await getMysqlExPdOfficers({ search, division, status }));
    return;
  }

  const conditions: ReturnType<typeof eq>[] = [];

  if (division && division !== "ALL") {
    conditions.push(eq(exPdOfficersTable.division, division));
  }
  if (status && status !== "ALL") {
    conditions.push(eq(exPdOfficersTable.status, status));
  }

  let rows = await db.select().from(exPdOfficersTable)
    .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions.reduce((acc, c) => sql`${acc} AND ${c}`)}`) : undefined)
    .orderBy(exPdOfficersTable.id);

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((r) =>
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.callSign ?? "").toLowerCase().includes(q) ||
      (r.characterId ?? "").toLowerCase().includes(q) ||
      (r.discordUsername ?? "").toLowerCase().includes(q) ||
      (r.division ?? "").toLowerCase().includes(q) ||
      (r.rank ?? "").toLowerCase().includes(q)
    );
  }

  res.json(rows);
});

router.get("/ex-pd-officers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(exPdOfficersTable).where(eq(exPdOfficersTable.id, id));
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.post("/ex-pd-officers", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const body = req.body;
  if (!body.name) { res.status(400).json({ error: "name required" }); return; }

  if (isMysqlDatabaseUrl) {
    const result = await mysqlExecute(
      `INSERT INTO pd_ex_pd_officers
        (call_sign, character_id, name, phone_no, division, rank, discord_username, discord_uid, rockstar_license_id,
         steam_profile, steam_64_hex_id, steam_2_id, insurance, status, date_of_joining, last_promotion, air1, speed, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        body.callSign ?? null,
        body.characterId ?? null,
        body.name,
        body.phoneNo ?? null,
        body.division ?? null,
        body.rank ?? null,
        body.discordUsername ?? null,
        body.discordUid ?? null,
        body.rockstarLicenseId ?? null,
        body.steamProfile ?? null,
        body.steam64HexId ?? null,
        body.steam2Id ?? null,
        body.insurance ?? null,
        body.status ?? null,
        body.dateOfJoining ?? null,
        body.lastPromotion ?? null,
        body.air1 ? 1 : 0,
        body.speed ? 1 : 0,
        body.notes ?? null,
      ],
    );
    const [row] = await mysqlQuery<Record<string, unknown>>(
      `SELECT * FROM pd_ex_pd_officers WHERE id = ? LIMIT 1`,
      [result.insertId],
    );
    await auditLog(req, "CREATE", "ex-pd-officer", Number(result.insertId), body.name, body);
    res.json(row);
    return;
  }

  const [row] = await db.insert(exPdOfficersTable).values({
    callSign: body.callSign ?? null,
    characterId: body.characterId ?? null,
    name: body.name,
    phoneNo: body.phoneNo ?? null,
    division: body.division ?? null,
    rank: body.rank ?? null,
    discordUsername: body.discordUsername ?? null,
    discordUid: body.discordUid ?? null,
    rockstarLicenseId: body.rockstarLicenseId ?? null,
    steamProfile: body.steamProfile ?? null,
    steam64HexId: body.steam64HexId ?? null,
    steam2Id: body.steam2Id ?? null,
    insurance: body.insurance ?? null,
    status: body.status ?? null,
    dateOfJoining: body.dateOfJoining ?? null,
    lastPromotion: body.lastPromotion ?? null,
    air1: body.air1 ?? false,
    speed: body.speed ?? false,
    notes: body.notes ?? null,
  }).returning();
  await auditLog(req, "CREATE", "ex-pd-officer", row.id, row.name, body);
  res.json(row);
});

router.put("/ex-pd-officers/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);
  const body = req.body;

  if (isMysqlDatabaseUrl) {
    await mysqlExecute(
      `UPDATE pd_ex_pd_officers
       SET call_sign = ?, character_id = ?, name = ?, phone_no = ?, division = ?, rank = ?, discord_username = ?,
           discord_uid = ?, rockstar_license_id = ?, steam_profile = ?, steam_64_hex_id = ?, steam_2_id = ?, insurance = ?,
           status = ?, date_of_joining = ?, last_promotion = ?, air1 = ?, speed = ?, notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        body.callSign ?? null,
        body.characterId ?? null,
        body.name,
        body.phoneNo ?? null,
        body.division ?? null,
        body.rank ?? null,
        body.discordUsername ?? null,
        body.discordUid ?? null,
        body.rockstarLicenseId ?? null,
        body.steamProfile ?? null,
        body.steam64HexId ?? null,
        body.steam2Id ?? null,
        body.insurance ?? null,
        body.status ?? null,
        body.dateOfJoining ?? null,
        body.lastPromotion ?? null,
        body.air1 ? 1 : 0,
        body.speed ? 1 : 0,
        body.notes ?? null,
        id,
      ],
    );
    const rows = await getMysqlExPdOfficers({});
    const row = rows.find((item) => item.id === id) ?? null;
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    await auditLog(req, "UPDATE", "ex-pd-officer", row.id, row.name, body);
    res.json(row);
    return;
  }

  const [row] = await db.update(exPdOfficersTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(exPdOfficersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await auditLog(req, "UPDATE", "ex-pd-officer", row.id, row.name, body);
  res.json(row);
});

router.delete("/ex-pd-officers/:id", async (req, res): Promise<void> => {
  if (guard(req, res, 2)) return;
  const id = Number(req.params.id);

  if (isMysqlDatabaseUrl) {
    const rows = await getMysqlExPdOfficers({});
    const row = rows.find((item) => item.id === id) ?? null;
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    await mysqlExecute(`DELETE FROM pd_ex_pd_officers WHERE id = ?`, [id]);
    await auditLog(req, "DELETE", "ex-pd-officer", row.id, row.name, {});
    res.json({ ok: true });
    return;
  }

  const [row] = await db.delete(exPdOfficersTable).where(eq(exPdOfficersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await auditLog(req, "DELETE", "ex-pd-officer", row.id, row.name, {});
  res.json({ ok: true });
});

export default router;
