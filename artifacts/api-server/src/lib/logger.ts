import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const shouldUsePrettyLogs =
  !isProduction &&
  process.stdout.isTTY &&
  process.env.PINO_PRETTY !== "false";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(shouldUsePrettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
