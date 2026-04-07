import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const ftoDocItemsTable = pgTable("fto_doc_items", {
  id: serial("id").primaryKey(),
  docId: text("doc_id").notNull(),
  sectionId: text("section_id").notNull(),
  itemText: text("item_text").notNull(),
  itemType: text("item_type").notNull().default("bullet"),
  isImportant: boolean("is_important").notNull().default(false),
  isHighlight: boolean("is_highlight").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
