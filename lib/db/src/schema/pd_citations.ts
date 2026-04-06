import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pdCitationsTable = pgTable("pd_citations", {
  id: serial("id").primaryKey(),
  discordMessageId: text("discord_message_id").unique(),
  title: text("title"),
  incident: text("incident"),
  location: text("location"),
  evidence: text("evidence"),
  incidentReport: text("incident_report"),
  suspectName: text("suspect_name"),
  suspectCid: text("suspect_cid"),
  suspectContact: text("suspect_contact"),
  charges: text("charges"),
  officerName: text("officer_name"),
  rawContent: text("raw_content"),
  postedAt: timestamp("posted_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PdCitation = typeof pdCitationsTable.$inferSelect;
