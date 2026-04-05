import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";

export const pdDutyLogsTable = pgTable("pd_duty_logs", {
  id: serial("id").primaryKey(),
  logDate: date("log_date").notNull(),
  csNumber: text("cs_number").notNull(),
  officerName: text("officer_name").notNull(),
  rank: text("rank").notNull().default(""),
  shiftType: text("shift_type").notNull().default("Full"),
  duration: text("duration").notNull().default("00:00:00"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PdDutyLog = typeof pdDutyLogsTable.$inferSelect;
export type InsertPdDutyLog = typeof pdDutyLogsTable.$inferInsert;
