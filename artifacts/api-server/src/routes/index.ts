import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rosterRouter from "./roster";
import emsRouter from "./ems";
import discordRouter from "./discord";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rosterRouter);
router.use(emsRouter);
router.use(discordRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(settingsRouter);

export default router;
