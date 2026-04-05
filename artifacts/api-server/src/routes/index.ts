import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rosterRouter from "./roster";
import emsRouter from "./ems";
import discordRouter from "./discord";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rosterRouter);
router.use(emsRouter);
router.use(discordRouter);

export default router;
