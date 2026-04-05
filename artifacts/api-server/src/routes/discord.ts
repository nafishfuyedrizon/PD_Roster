import { Router } from "express";
import { recomputeAllDutyHours } from "../lib/discord-bot";

const router = Router();

router.post("/discord/recompute", async (req, res): Promise<void> => {
  const result = await recomputeAllDutyHours();
  res.json({ ok: true, ...result });
});

export default router;
