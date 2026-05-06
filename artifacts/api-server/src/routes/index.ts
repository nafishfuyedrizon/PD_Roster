import { Router, type IRouter } from "express";
import { isPostgresDatabaseUrl } from "@workspace/db";
import healthRouter from "./health";
import rosterRouter from "./roster";
import emsRouter from "./ems";
import discordRouter from "./discord";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import settingsRouter from "./settings";
import qualificationRouter from "./qualification";
import authRouter from "./auth";
import profileRouter from "./profile";
import citationsRouter, { startSheetAutoSync } from "./citations";
import firRouter from "./fir";
import studentProgressionsRouter from "./student-progressions";
import exPdOfficersRouter from "./ex-pd-officers";
import fivemRouter from "./fivem";
import ftoDocsRouter from "./fto-docs";
import deptStatsRouter from "./dept-stats";

// Start Google Sheet auto-sync only when the primary API database is ready.
if (
  isPostgresDatabaseUrl &&
  process.env.START_CITATION_SHEET_SYNC !== "false"
) {
  startSheetAutoSync();
}

const router: IRouter = Router();

router.use((req, _res, next) => {
  if (req.url === "/pd" || req.url.startsWith("/pd/")) {
    req.url = `/ems${req.url.slice(3)}`;
  }
  next();
});

router.use(authRouter);
router.use(profileRouter);
router.use(healthRouter);
router.use(rosterRouter);
router.use(emsRouter);
router.use(discordRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(settingsRouter);
router.use(qualificationRouter);
router.use(citationsRouter);
router.use(firRouter);
router.use(studentProgressionsRouter);
router.use(exPdOfficersRouter);
router.use(fivemRouter);
router.use(ftoDocsRouter);
router.use(deptStatsRouter);

export default router;
