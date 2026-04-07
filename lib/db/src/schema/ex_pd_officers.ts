import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const exPdOfficersTable = pgTable("ex_pd_officers", {
  id: serial("id").primaryKey(),

  callSign: text("call_sign"),
  characterId: text("character_id"),
  name: text("name").notNull(),
  phoneNo: text("phone_no"),
  division: text("division"),
  rank: text("rank"),
  discordUsername: text("discord_username"),
  discordUid: text("discord_uid"),
  rockstarLicenseId: text("rockstar_license_id"),
  steamProfile: text("steam_profile"),
  steam64HexId: text("steam_64_hex_id"),
  steam2Id: text("steam_2_id"),
  insurance: text("insurance"),
  status: text("status"),
  exitDate: text("exit_date"),
  dateOfJoining: text("date_of_joining"),
  lastPromotion: text("last_promotion"),
  air1: boolean("air1").default(false).notNull(),
  speed: boolean("speed").default(false).notNull(),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ExPdOfficer = typeof exPdOfficersTable.$inferSelect;
export type NewExPdOfficer = typeof exPdOfficersTable.$inferInsert;
