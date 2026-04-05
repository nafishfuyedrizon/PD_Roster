import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rosterRouter from "./roster";
import emsRouter from "./ems";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rosterRouter);
router.use(emsRouter);

export default router;
