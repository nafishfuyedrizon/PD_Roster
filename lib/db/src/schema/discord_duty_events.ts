import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discordDutyEventsTable = pgTable("discord_duty_events", {
  id: serial("id").primaryKey(),
  licenseId: text("license_id").notNull(),
  officerName: text("officer_name").notNull(),
  rank: text("rank"),
  eventType: text("event_type").notNull(),
  eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
  discordMessageId: text("discord_message_id").notNull().unique(),
  weekPeriod: text("week_period").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDiscordDutyEventSchema = createInsertSchema(discordDutyEventsTable).omit({ id: true, createdAt: true });
export type InsertDiscordDutyEvent = z.infer<typeof insertDiscordDutyEventSchema>;
export type DiscordDutyEvent = typeof discordDutyEventsTable.$inferSelect;
