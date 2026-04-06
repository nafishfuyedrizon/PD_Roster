import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  changedBy: text("changed_by").notNull(),
  changedByUid: text("changed_by_uid"),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogsTable.$inferSelect;
