import { pgTable, serial, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";

export const studentProgressionsTable = pgTable("student_progressions", {
  id: serial("id").primaryKey(),

  // Cadet info
  badgeNumber: text("badge_number"),
  discordId: text("discord_id"),
  discordName: text("discord_name"),
  name: text("name").notNull(),
  timezone: text("timezone"),
  currentPhase: text("current_phase"),
  status: text("status").default("Vacant"),
  strikes: text("strikes").default("0/4"),
  hireDate: text("hire_date"),
  loaEndDate: text("loa_end_date"),

  // Onboarding
  discordInterview: boolean("discord_interview").default(false).notNull(),
  inCityInterview: boolean("in_city_interview").default(false).notNull(),

  // Phase 1
  basicTraining: boolean("basic_training").default(false).notNull(),
  obsH2: boolean("obs_h2").default(false).notNull(),
  obsH4: boolean("obs_h4").default(false).notNull(),
  obsH6: boolean("obs_h6").default(false).notNull(),
  obsH8: boolean("obs_h8").default(false).notNull(),
  obsH10: boolean("obs_h10").default(false).notNull(),
  obsH12: boolean("obs_h12").default(false).notNull(),
  obsH14: boolean("obs_h14").default(false).notNull(),

  // Classroom (before Phase 2)
  mdt: boolean("mdt").default(false).notNull(),
  advanceTraining: boolean("advance_training").default(false).notNull(),

  // Phase 2 — 10-90 Negotiations
  negPri: boolean("neg_pri").default(false).notNull(),
  negSec: boolean("neg_sec").default(false).notNull(),
  negTer: boolean("neg_ter").default(false).notNull(),
  negPar: boolean("neg_par").default(false).notNull(),

  // Phase 2 — 10-90 Incident
  incPri: boolean("inc_pri").default(false).notNull(),
  incSec: boolean("inc_sec").default(false).notNull(),
  incTer: boolean("inc_ter").default(false).notNull(),
  incPar: boolean("inc_par").default(false).notNull(),

  // Phase 2 — 10-90 Evidences
  eviPri: boolean("evi_pri").default(false).notNull(),
  eviSec: boolean("evi_sec").default(false).notNull(),
  eviTer: boolean("evi_ter").default(false).notNull(),
  eviPar: boolean("evi_par").default(false).notNull(),

  // Phase 2 — Suspect Processing
  susPri: boolean("sus_pri").default(false).notNull(),
  susSec: boolean("sus_sec").default(false).notNull(),
  susTer: boolean("sus_ter").default(false).notNull(),
  susPar: boolean("sus_par").default(false).notNull(),

  // Phase 2 — 10-80 Drive & Comms
  drvPri: boolean("drv_pri").default(false).notNull(),
  drvSec: boolean("drv_sec").default(false).notNull(),
  drvTer: boolean("drv_ter").default(false).notNull(),
  drvPar: boolean("drv_par").default(false).notNull(),

  // Phase 2 — 10-11
  t11Pri: boolean("t11_pri").default(false).notNull(),
  t11Sec: boolean("t11_sec").default(false).notNull(),
  t11Ter: boolean("t11_ter").default(false).notNull(),
  t11Par: boolean("t11_par").default(false).notNull(),

  // Phase 2 — PIT
  pit: boolean("pit").default(false).notNull(),

  // Phase 2 — 911 Calls
  calls911: boolean("calls_911").default(false).notNull(),

  // Results
  soloReady: boolean("solo_ready").default(false).notNull(),
  soloStartDate: text("solo_start_date"),
  eligibleTrooperDate: text("eligible_trooper_date"),
  clearedTrooper: boolean("cleared_trooper").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StudentProgression = typeof studentProgressionsTable.$inferSelect;

// All 43 boolean training checkpoint fields (in spreadsheet order)
export const CHECKPOINT_FIELDS = [
  // Onboarding (2)
  "discordInterview", "inCityInterview",
  // Phase 1 (8)
  "basicTraining", "obsH2", "obsH4", "obsH6", "obsH8", "obsH10", "obsH12", "obsH14",
  // Classroom (2)
  "mdt", "advanceTraining",
  // Phase 2 — Negotiations (4)
  "negPri", "negSec", "negTer", "negPar",
  // Phase 2 — Incident (4)
  "incPri", "incSec", "incTer", "incPar",
  // Phase 2 — Evidences (4)
  "eviPri", "eviSec", "eviTer", "eviPar",
  // Phase 2 — Suspect Processing (4)
  "susPri", "susSec", "susTer", "susPar",
  // Phase 2 — Drive & Comms (4)
  "drvPri", "drvSec", "drvTer", "drvPar",
  // Phase 2 — 10-11 (4)
  "t11Pri", "t11Sec", "t11Ter", "t11Par",
  // Phase 2 — PIT (1)
  "pit",
  // Phase 2 — 911 Calls (1)
  "calls911",
] as const;

export type CheckpointField = typeof CHECKPOINT_FIELDS[number];
export const TOTAL_CHECKPOINTS = CHECKPOINT_FIELDS.length; // 38
