import { logger } from "./lib/logger";
import { startDiscordBot } from "./lib/discord-bot";
import { seedDatabase } from "./lib/seed";

async function main() {
  if (process.env.RUN_DISCORD_BOT === "false") {
    logger.warn("RUN_DISCORD_BOT=false, bot-only runner is disabled");
    return;
  }

  logger.info(
    {
      backfillMonths: process.env.PD_REGISTRAR_BACKFILL_MONTHS ?? "3",
      databaseUrl: process.env.DATABASE_URL ? "configured" : "missing",
    },
    "Starting Discord bot-only service",
  );

  await seedDatabase().catch((err) =>
    logger.error({ err }, "Seed failed — continuing anyway"),
  );

  await startDiscordBot();
}

main().catch((err) => {
  logger.error({ err }, "Discord bot-only service failed");
  process.exit(1);
});
