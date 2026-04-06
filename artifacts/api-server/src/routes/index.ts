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

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(rosterRouter);
router.use(emsRouter);
router.use(discordRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(settingsRouter);
router.use(qualificationRouter);

export default router;
