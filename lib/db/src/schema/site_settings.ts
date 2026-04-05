import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  org_name: "Police Department",
  org_acronym: "PD",
  org_subtitle: "Shift Roster",
  departments: [
    "SASP","BCSO","SAHP","IA","FTP","Management","SWAT","FIB","Game Wardens",
  ],
  divisions: [
    "High Command",
    "Low Command (HR)",
    "Field Training Supervisor",
    "Field Training Officer",
    "Field Training Trainee",
    "Training Academy",
  ],
  ranks: [
    "CHIEF","ASSISTANT CHIEF","SHERIFF","COLONEL",
    "SENIOR DEPUTY CHIEF","UNDERSHERIFF","ASSISTANT COLONEL",
    "DEPUTY CHIEF","ASSISTANT SHERIFF","DEPUTY COLONEL",
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR STATE TROOPER","SENIOR TROOPER","SENIOR DEPUTY",
    "STATE TROOPER FIRST CLASS","TROOPER FIRST CLASS","DEPUTY FIRST CLASS",
    "STATE TROOPER","TROOPER","DEPUTY","CADET","TRAINEE","RECRUIT",
  ],
};
