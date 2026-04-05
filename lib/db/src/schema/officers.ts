import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officersTable = pgTable("officers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  discordId: text("discord_id").notNull(),
  rank: text("rank").notNull(),
  department: text("department").notNull(),
  status: text("status").notNull().default("Active"),
  dutyHours: text("duty_hours"),
  completionStatus: text("completion_status"),
  appointedFto: text("appointed_fto"),
  weekPeriod: text("week_period").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOfficerSchema = createInsertSchema(officersTable).omit({ id: true, createdAt: true });
export type InsertOfficer = z.infer<typeof insertOfficerSchema>;
export type Officer = typeof officersTable.$inferSelect;
