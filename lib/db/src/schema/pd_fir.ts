import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pdFirTable = pgTable("pd_fir", {
  id: serial("id").primaryKey(),
  discordMessageId: text("discord_message_id").unique(),
  complainantName: text("complainant_name"),
  complainantCid: text("complainant_cid"),
  complainantContact: text("complainant_contact"),
  eventDescription: text("event_description"),
  suspectDetails: text("suspect_details"),
  evidence: text("evidence"),
  officerName: text("officer_name"),
  rawContent: text("raw_content"),
  postedAt: timestamp("posted_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PdFir = typeof pdFirTable.$inferSelect;
