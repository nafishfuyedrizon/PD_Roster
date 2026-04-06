import type { Request } from "express";
import { db, adminLogsTable } from "@workspace/db";

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
