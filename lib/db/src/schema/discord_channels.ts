import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const discordChannelsTable = pgTable("discord_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  channelName: text("channel_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DiscordChannel = typeof discordChannelsTable.$inferSelect;
export type InsertDiscordChannel = typeof discordChannelsTable.$inferInsert;
