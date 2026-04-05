import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officersTable = pgTable("officers", {
  id: serial("id").primaryKey(),
  callSign: text("call_sign").notNull(),
  citizenId: text("citizen_id"),
  name: text("name"),
  phoneNumber: text("phone_number"),
  department: text("department").notNull(),
  rank: text("rank").notNull(),
  division: text("division"),
  status: text("status").notNull().default("Vacant"),
  timezone: text("timezone"),
  dateOfJoining: text("date_of_joining"),
  lastPromotion: text("last_promotion"),
  pilot: boolean("pilot").default(false),
  mdt: boolean("mdt").default(false),
  seu: boolean("seu").default(false),
  smg: boolean("smg").default(false),
  rifle: boolean("rifle").default(false),
  shotgun: boolean("shotgun").default(false),
  rifleTierII: boolean("rifle_tier_ii").default(false),
  ftp: boolean("ftp").default(false),
  isManagement: boolean("is_management").default(false),
  strikesMajor: text("strikes_major").default("0/4"),
  strikesMinor: text("strikes_minor").default("0/2"),
  discordUsername: text("discord_username"),
  discordUid: text("discord_uid"),
  discordId: text("discord_id").notNull().default(""),
  rockstarLicenseId: text("rockstar_license_id"),
  dutyHours: text("duty_hours"),
  completionStatus: text("completion_status"),
  appointedFto: text("appointed_fto"),
  weekPeriod: text("week_period").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOfficerSchema = createInsertSchema(officersTable).omit({ id: true, createdAt: true });
export type InsertOfficer = z.infer<typeof insertOfficerSchema>;
export type Officer = typeof officersTable.$inferSelect;
