import type { Request } from "express";
import { db, adminLogsTable } from "@workspace/db";
import { getNextMysqlId, isMysqlDatabaseUrl, mysqlExecute } from "./pd-mysql-read.js";

function isDuplicateMysqlKey(err: unknown): boolean {
  return typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

export async function auditLog(
  req: Request,
  actionType: string,
  entityType: string,
  entityId: string | number | null,
  entityName: string | null,
  changes: Record<string, unknown> | null,
): Promise<void> {
  const sessionUser = (req.session as any)?.user;
  try {
    if (isMysqlDatabaseUrl) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nextId = await getNextMysqlId("pd_admin_logs");
          await mysqlExecute(
            `INSERT INTO pd_admin_logs
              (id, action_type, entity_type, entity_id, entity_name, changed_by, changed_by_uid, changes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              nextId,
              actionType,
              entityType,
              entityId != null ? String(entityId) : null,
              entityName,
              sessionUser?.displayName ?? sessionUser?.username ?? "System",
              sessionUser?.id ?? null,
              changes ? JSON.stringify(changes) : null,
            ],
          );
          return;
        } catch (err) {
          if (attempt < 2 && isDuplicateMysqlKey(err)) continue;
          throw err;
        }
      }
      return;
    }
    await db.insert(adminLogsTable).values({
      actionType,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      entityName,
      changedBy: sessionUser?.displayName ?? sessionUser?.username ?? "System",
      changedByUid: sessionUser?.id ?? null,
      changes: changes as any,
    });
  } catch (err) {
    console.error("[auditLog] failed:", err);
  }
}
