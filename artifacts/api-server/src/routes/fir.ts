import { Router } from "express";
import { db, pdFirTable } from "@workspace/db";
import { desc, ilike, or, sql } from "drizzle-orm";

const router = Router();

router.get("/fir", async (req, res): Promise<void> => {
  const { search, limit: lim } = req.query as Record<string, string>;
  const limit = lim ? Math.min(parseInt(lim, 10) || 10000, 10000) : 10000;
  let query = db.select().from(pdFirTable).orderBy(desc(pdFirTable.postedAt)).$dynamic();
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.where(or(
      ilike(pdFirTable.complainantName, q),
      ilike(pdFirTable.complainantCid, q),
      ilike(pdFirTable.officerName, q),
      ilike(pdFirTable.suspectDetails, q),
      ilike(pdFirTable.eventDescription, q),
    ));
  }
  res.json(await query.limit(limit));
});

router.get("/fir/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdFirTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS firs FROM pd_fir WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY firs DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

export default router;
