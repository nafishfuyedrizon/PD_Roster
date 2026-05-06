import app from "./app";
import { isPostgresDatabaseUrl } from "@workspace/db";
import { logger } from "./lib/logger";
import { startDiscordBot } from "./lib/discord-bot";
import { startPdMariaMirror } from "./lib/pd-maria-mirror";
import { seedDatabase } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedDatabase()
  .catch((err) => logger.error({ err }, "Seed failed — continuing anyway"))
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");

      if (isPostgresDatabaseUrl) {
        startPdMariaMirror();
      } else {
        logger.warn("MariaDB mirror disabled because PostgreSQL primary DB is not configured");
      }

      const shouldStartDiscordBot =
        process.env.RUN_DISCORD_BOT === "true" ||
        (process.env.RUN_DISCORD_BOT !== "false" && process.env.RENDER !== "true");

      if (shouldStartDiscordBot) {
        startDiscordBot().catch((err) => {
          logger.error({ err }, "Discord bot failed to start");
        });
      } else {
        logger.info("Discord bot disabled for this API process");
      }
    });
  });
