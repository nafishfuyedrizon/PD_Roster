import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const citationDeletionLogsTable = pgTable("citation_deletion_logs", {
  id: serial("id").primaryKey(),
  citationId: integer("citation_id").notNull(),
  incident: text("incident"),
  officerName: text("officer_name"),
  deletedBy: text("deleted_by").notNull(),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

export type CitationDeletionLog = typeof citationDeletionLogsTable.$inferSelect;
