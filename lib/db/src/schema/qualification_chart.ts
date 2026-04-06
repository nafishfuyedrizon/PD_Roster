import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";

export const qualificationChartTable = pgTable("qualification_chart", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  discordUid: text("discord_uid"),
  rank: text("rank"),
  department: text("department"),
  daysInRank: real("days_in_rank"),
  hoursInRank: real("hours_in_rank"),
  citationCount: integer("citation_count").default(0).notNull(),
  firCount: integer("fir_count").default(0).notNull(),
  lastPromotion: text("last_promotion"),
  strikesMajor: text("strikes_major").default("0/4"),
  strikesMinor: text("strikes_minor").default("0/2"),
  qualStatus: text("qual_status"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type QualificationChart = typeof qualificationChartTable.$inferSelect;
