import { pgTable, serial, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const staffRolesTable = pgTable("staff_roles", {
  id: serial("id").primaryKey(),
  discordUid: varchar("discord_uid", { length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isSeniorStaff: boolean("is_senior_staff").notNull().default(false),
  isStaff: boolean("is_staff").notNull().default(false),
  isTrusted: boolean("is_trusted").notNull().default(false),
  addedBy: varchar("added_by", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
