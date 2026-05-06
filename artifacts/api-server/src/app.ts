import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import { isPostgresDatabaseUrl, databaseConfigMessage } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSession = connectPgSimple(session);

const app: Express = express();
const shouldUsePgSession =
  isPostgresDatabaseUrl && process.env.SESSION_STORE !== "memory";
const isProduction = process.env.NODE_ENV === "production";
const crossSiteCookies = isProduction;

if (!shouldUsePgSession) {
  logger.warn(
    {
      reason: databaseConfigMessage ?? "SESSION_STORE=memory",
    },
    "Using in-memory session store",
  );
}

app.set("trust proxy", 1);
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "fallback-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    store: shouldUsePgSession
      ? new PgSession({
          conString: process.env.DATABASE_URL,
          ttl: 7 * 24 * 60 * 60, // 7 days in seconds
        })
      : undefined,
    cookie: {
      httpOnly: true,
      secure: crossSiteCookies,
      sameSite: crossSiteCookies ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    },
  }),
);

app.use("/api", router);

export default app;
