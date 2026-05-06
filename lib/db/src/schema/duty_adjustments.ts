import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const dutyAdjustmentsTable = pgTable("pd_duty_adjustments", {
  id: serial("id").primaryKey(),
  officerCs: text("officer_cs").notNull(),
  officerName: text("officer_name"),
  dutyMonth: text("duty_month").notNull(),
  dutyYear: text("duty_year").notNull(),
  shiftType: text("shift_type").notNull().default("ALL"),
  adjustmentSeconds: integer("adjustment_seconds").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DutyAdjustment = typeof dutyAdjustmentsTable.$inferSelect;
export type InsertDutyAdjustment = typeof dutyAdjustmentsTable.$inferInsert;
