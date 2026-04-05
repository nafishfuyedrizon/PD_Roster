import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shiftConfigsTable = pgTable("shift_configs", {
  key:       text("key").primaryKey(),
  label:     text("label").notNull(),
  sub:       text("sub").notNull().default(""),
  icon:      text("icon").notNull().default("●"),
  startHour: integer("start_hour").notNull(),
  endHour:   integer("end_hour").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertShiftConfigSchema = createInsertSchema(shiftConfigsTable);
export type InsertShiftConfig = z.infer<typeof insertShiftConfigSchema>;
export type ShiftConfig = typeof shiftConfigsTable.$inferSelect;
