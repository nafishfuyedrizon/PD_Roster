import { Router, type IRouter } from "express";
import { db, ftoDocItemsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { auditLog } from "../lib/audit.js";
import {
  getMysqlFtoDocItems,
  isMysqlDatabaseUrl,
  mysqlExecute,
} from "../lib/pd-mysql-read.js";

const router: IRouter = Router();

function callerLevel(req: any): number {
  const u = (req.session as any)?.user;
  if (!u) return 0;
  if (u.isOwner) return 5;
  if (u.isSuperAdmin) return 4;
  if (u.isSeniorStaff) return 3;
  if (u.isStaff) return 2;
  if (u.isTrusted) return 1;
  return 0;
}

// GET /api/fto-docs — all items ordered by sort_order
router.get("/fto-docs", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (isMysqlDatabaseUrl) {
    try {
      res.json(await getMysqlFtoDocItems());
    } catch {
      res.json([]);
    }
    return;
  }
  const items = await db
    .select()
    .from(ftoDocItemsTable)
    .orderBy(asc(ftoDocItemsTable.docId), asc(ftoDocItemsTable.sortOrder), asc(ftoDocItemsTable.id));
  res.json(items);
});

// POST /api/fto-docs — add item (level >= 2)
router.post("/fto-docs", async (req, res): Promise<void> => {
  const lvl = callerLevel(req);
  if (lvl < 3) { res.status(403).json({ error: "High Command or above required" }); return; }

  const { docId, sectionId, itemText, itemType, isImportant, isHighlight, sortOrder } = req.body;
  if (!docId || !sectionId || !itemText) {
    res.status(400).json({ error: "docId, sectionId, itemText required" }); return;
  }

  if (isMysqlDatabaseUrl) {
    const result = await mysqlExecute(
      `INSERT INTO pd_fto_doc_items
        (doc_id, section_id, item_text, item_type, is_important, is_highlight, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        docId,
        sectionId,
        itemText,
        itemType ?? "bullet",
        isImportant ? 1 : 0,
        isHighlight ? 1 : 0,
        sortOrder ?? 0,
      ],
    );
    const row = {
      id: Number(result.insertId),
      docId,
      sectionId,
      itemText,
      itemType: itemType ?? "bullet",
      isImportant: !!isImportant,
      isHighlight: !!isHighlight,
      sortOrder: Number(sortOrder ?? 0),
      createdAt: new Date(),
    };
    await auditLog(req, "CREATE", "fto-doc-item", row.id, `${docId}/${sectionId}`, { itemText, itemType });
    res.status(201).json(row);
    return;
  }

  const [row] = await db.insert(ftoDocItemsTable).values({
    docId,
    sectionId,
    itemText,
    itemType: itemType ?? "bullet",
    isImportant: isImportant ?? false,
    isHighlight: isHighlight ?? false,
    sortOrder: sortOrder ?? 0,
  }).returning();

  await auditLog(req, "CREATE", "fto-doc-item", row.id, `${docId}/${sectionId}`, { itemText, itemType });
  res.status(201).json(row);
});

// PATCH /api/fto-docs/:id — update item text/flags (level >= 3)
router.patch("/fto-docs/:id", async (req, res): Promise<void> => {
  const lvl = callerLevel(req);
  if (lvl < 3) { res.status(403).json({ error: "High Command or above required" }); return; }

  const id = parseInt(req.params.id, 10);
  const allowed = ["itemText", "itemType", "isImportant", "isHighlight", "sortOrder"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) updates[k] = req.body[k];
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }

  if (isMysqlDatabaseUrl) {
    const assignments: string[] = [];
    const params: unknown[] = [];
    if ("itemText" in updates) { assignments.push("item_text = ?"); params.push(updates.itemText); }
    if ("itemType" in updates) { assignments.push("item_type = ?"); params.push(updates.itemType); }
    if ("isImportant" in updates) { assignments.push("is_important = ?"); params.push(updates.isImportant ? 1 : 0); }
    if ("isHighlight" in updates) { assignments.push("is_highlight = ?"); params.push(updates.isHighlight ? 1 : 0); }
    if ("sortOrder" in updates) { assignments.push("sort_order = ?"); params.push(updates.sortOrder); }
    await mysqlExecute(
      `UPDATE pd_fto_doc_items SET ${assignments.join(", ")} WHERE id = ?`,
      [...params, id],
    );
    const row = (await getMysqlFtoDocItems()).find((item) => item.id === id) ?? null;
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    await auditLog(req, "UPDATE", "fto-doc-item", id, null, updates);
    res.json(row);
    return;
  }

  const [row] = await db.update(ftoDocItemsTable).set(updates as any).where(eq(ftoDocItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await auditLog(req, "UPDATE", "fto-doc-item", id, null, updates);
  res.json(row);
});

// DELETE /api/fto-docs/:id — delete item (level >= 3)
router.delete("/fto-docs/:id", async (req, res): Promise<void> => {
  const lvl = callerLevel(req);
  if (lvl < 3) { res.status(403).json({ error: "High Command or above required" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isMysqlDatabaseUrl) {
    await mysqlExecute(`DELETE FROM pd_fto_doc_items WHERE id = ?`, [id]);
    await auditLog(req, "DELETE", "fto-doc-item", id, null, null);
    res.status(204).end();
    return;
  }
  const [row] = await db.delete(ftoDocItemsTable).where(eq(ftoDocItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await auditLog(req, "DELETE", "fto-doc-item", id, null, null);
  res.status(204).end();
});

export default router;
