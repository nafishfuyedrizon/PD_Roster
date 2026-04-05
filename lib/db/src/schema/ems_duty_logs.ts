import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emsDutyLogsTable = pgTable("ems_duty_logs", {
  id: serial("id").primaryKey(),
  csNumber: text("cs_number").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("Active"),
  rank: text("rank").notNull(),
  weekPeriod: text("week_period").notNull(),
  dutyHours: text("duty_hours"),
  shiftType: text("shift_type").notNull().default("ALL"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmsDutyLogSchema = createInsertSchema(emsDutyLogsTable).omit({ id: true, createdAt: true });
export type InsertEmsDutyLog = z.infer<typeof insertEmsDutyLogSchema>;
export type EmsDutyLog = typeof emsDutyLogsTable.$inferSelect;
