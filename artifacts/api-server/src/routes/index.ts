import { Router, type IRouter } from "express";
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

// Start Google Sheet auto-sync on boot
startSheetAutoSync();

const router: IRouter = Router();

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

export default router;
