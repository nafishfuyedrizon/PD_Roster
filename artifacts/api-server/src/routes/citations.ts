import { Router } from "express";
import { db, pdCitationsTable } from "@workspace/db";
import { desc, ilike, or, sql } from "drizzle-orm";

const router = Router();

router.get("/citations", async (req, res): Promise<void> => {
  const { search, officer, limit: lim } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(lim ?? "100", 10) || 100, 500);

  let query = db.select().from(pdCitationsTable).orderBy(desc(pdCitationsTable.postedAt)).$dynamic();

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.where(
      or(
        ilike(pdCitationsTable.suspectName, q),
        ilike(pdCitationsTable.suspectCid, q),
        ilike(pdCitationsTable.charges, q),
        ilike(pdCitationsTable.officerName, q),
        ilike(pdCitationsTable.title, q),
        ilike(pdCitationsTable.incident, q),
      )
    );
  } else if (officer?.trim()) {
    query = query.where(ilike(pdCitationsTable.officerName, `%${officer.trim()}%`));
  }

  const rows = await query.limit(limit);
  res.json(rows);
});

router.get("/citations/stats", async (_req, res): Promise<void> => {
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(pdCitationsTable);
  const topOfficers = await db.execute(
    sql`SELECT officer_name, count(*)::int AS citations FROM pd_citations WHERE officer_name IS NOT NULL GROUP BY officer_name ORDER BY citations DESC LIMIT 10`
  );
  res.json({ total: total?.count ?? 0, topOfficers: topOfficers.rows });
});

export default router;
