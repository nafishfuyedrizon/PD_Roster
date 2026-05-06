import { Router } from "express";
import type { Request, Response } from "express";
import { createHmac, randomBytes } from "crypto";
import { db, adminLogsTable, staffRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "1286283853186596904";
const DISCORD_OWNER_ID = process.env.DISCORD_OWNER_ID || "1286283853186596904";
const DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
const LOCAL_DEV_LOGIN = process.env.LOCAL_DEV_LOGIN === "true";
const DEV_LOGIN_ID = process.env.DEV_LOGIN_ID || "463587754471718923";
const DEV_LOGIN_USERNAME = process.env.DEV_LOGIN_USERNAME || "localadmin";
const DEV_LOGIN_DISPLAY_NAME = process.env.DEV_LOGIN_DISPLAY_NAME || "Local Admin";

// Temporary access store: discordUserId → expiry timestamp (ms)
const tempAccessStore = new Map<string, number>();

function grantTempAccess(userId: string, durationMs: number) {
  tempAccessStore.set(userId, Date.now() + durationMs);
  console.log(`[auth] Temp access granted to ${userId} for ${durationMs / 3600000}h, expires ${new Date(Date.now() + durationMs).toISOString()}`);
}

function hasTempAccess(userId: string): boolean {
  const expiry = tempAccessStore.get(userId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    tempAccessStore.delete(userId);
    return false;
  }
  return true;
}

// Pre-grant 24h access for requested user
grantTempAccess("463587754471718923", 24 * 60 * 60 * 1000);
grantTempAccess("413256770119663616", 24 * 60 * 60 * 1000);

function getRedirectUri(req: Request) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || DEV_DOMAIN;
  return `${proto}://${host}/api/auth/discord/callback`;
}

const STATE_SECRET = process.env.SESSION_SECRET || "fallback-dev-secret-change-in-prod";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function createState(): string {
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(8).toString("hex");
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, nonce, sig] = parts;
  const payload = `${timestamp}.${nonce}`;
  const expected = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  if (sig !== expected) return false;
  const ts = parseInt(timestamp, 36);
  if (isNaN(ts) || Date.now() - ts > STATE_TTL_MS) return false;
  return true;
}

function setSessionUser(req: Request, user: {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  roles: string[];
  guildId: string;
  isOwner: boolean;
  isSuperAdmin: boolean;
  isSeniorStaff: boolean;
  isStaff: boolean;
  isTrusted: boolean;
}) {
  (req.session as any).user = user;
}

router.get("/auth/dev-login", async (req: Request, res: Response) => {
  if (!LOCAL_DEV_LOGIN) {
    res.status(404).json({ error: "Local dev login is disabled." });
    return;
  }

  setSessionUser(req, {
    id: DEV_LOGIN_ID,
    username: DEV_LOGIN_USERNAME,
    displayName: DEV_LOGIN_DISPLAY_NAME,
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    roles: ["local-dev"],
    guildId: DISCORD_GUILD_ID,
    isOwner: true,
    isSuperAdmin: true,
    isSeniorStaff: true,
    isStaff: true,
    isTrusted: true,
  });

  try {
    await db.insert(adminLogsTable).values({
      actionType: "LOGIN",
      entityType: "session",
      entityId: DEV_LOGIN_ID,
      entityName: DEV_LOGIN_DISPLAY_NAME,
      changedBy: DEV_LOGIN_DISPLAY_NAME,
      changedByUid: DEV_LOGIN_ID,
      changes: { mode: "local-dev" } as any,
    });
  } catch {}

  res.redirect("/shift-roster/dashboard");
});

router.get("/auth/discord", (req: Request, res: Response) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    res.status(503).json({ error: "Discord OAuth not configured." });
    return;
  }

  const redirectUri = getRedirectUri(req);
  const state = createState();

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

router.get("/auth/discord/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`/shift-roster/?auth_error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!state || !verifyState(String(state))) {
    console.warn("[auth] HMAC state verification failed. state:", state);
    res.redirect("/shift-roster/?auth_error=invalid_state");
    return;
  }

  if (!code) {
    res.redirect("/shift-roster/?auth_error=no_code");
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Discord token exchange failed:", errText);
      res.redirect("/shift-roster/?auth_error=token_failed");
      return;
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      token_type: string;
      scope: string;
    };

    const authHeader = `${tokenData.token_type} ${tokenData.access_token}`;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: authHeader },
    });

    if (!userRes.ok) {
      res.redirect("/shift-roster/?auth_error=user_fetch_failed");
      return;
    }

    const discordUser = await userRes.json() as {
      id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
      discriminator: string;
    };

    const isTempAllowed = hasTempAccess(discordUser.id);

    // Check staff roles table
    const staffRows = await db.select().from(staffRolesTable).where(eq(staffRolesTable.discordUid, discordUser.id)).limit(1);
    const isStaffRole = staffRows.length > 0;

    // Use bot token to fetch guild member info — avoids needing guilds/guilds.members.read from user
    const botAuthHeader = DISCORD_BOT_TOKEN ? `Bot ${DISCORD_BOT_TOKEN}` : null;
    let botMemberData: { nick: string | null; roles: string[]; avatar: string | null } | null = null;
    let isOwner = discordUser.id === DISCORD_OWNER_ID;

    if (botAuthHeader) {
      try {
        const memberRes = await fetch(
          `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUser.id}`,
          { headers: { Authorization: botAuthHeader } }
        );
        if (memberRes.ok) {
          botMemberData = await memberRes.json() as { nick: string | null; roles: string[]; avatar: string | null };
        }
        // Also check guild owner via bot
        if (!isOwner) {
          const guildRes = await fetch(
            `https://discord.com/api/guilds/${DISCORD_GUILD_ID}`,
            { headers: { Authorization: botAuthHeader } }
          );
          if (guildRes.ok) {
            const guildData = await guildRes.json() as { owner_id: string };
            if (guildData.owner_id === discordUser.id) {
              isOwner = true;
              console.log(`[auth] Guild owner detected: ${discordUser.username} (${discordUser.id})`);
            }
          }
        }
      } catch (e) {
        console.warn("[auth] Bot member fetch failed:", e);
      }
    }

    let displayName = discordUser.global_name || discordUser.username;
    let roles: string[] = [];
    let avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || "0") % 5}.png`;

    if (isOwner) {
      // Owner always gets in
      console.log(`[auth] Owner login: ${discordUser.username} (${discordUser.id})`);
      if (botMemberData) {
        displayName = botMemberData.nick || discordUser.global_name || discordUser.username;
        roles = botMemberData.roles;
        if (botMemberData.avatar) {
          avatarUrl = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${botMemberData.avatar}.png`;
        }
      }
    } else if (isTempAllowed) {
      // Temporary access
      const expiry = tempAccessStore.get(discordUser.id)!;
      console.log(`[auth] Temp access login: ${discordUser.username} (${discordUser.id}), expires ${new Date(expiry).toISOString()}`);
      if (botMemberData) {
        displayName = botMemberData.nick || discordUser.global_name || discordUser.username;
        roles = botMemberData.roles;
        if (botMemberData.avatar) {
          avatarUrl = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${botMemberData.avatar}.png`;
        }
      }
    } else if (isStaffRole) {
      // Staff role — granted via Staff Roles panel
      console.log(`[auth] Staff role login: ${discordUser.username} (${discordUser.id})`);
      if (botMemberData) {
        displayName = botMemberData.nick || discordUser.global_name || discordUser.username;
        roles = botMemberData.roles;
        if (botMemberData.avatar) {
          avatarUrl = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${botMemberData.avatar}.png`;
        }
      }
    } else {
      // Regular users must be guild members
      if (!botMemberData) {
        console.warn(`[auth] Guild check failed for user ${discordUser.id} — not a member or bot unavailable`);
        res.redirect("/shift-roster/?auth_error=not_member");
        return;
      }
      displayName = botMemberData.nick || discordUser.global_name || discordUser.username;
      roles = botMemberData.roles;
      if (botMemberData.avatar) {
        avatarUrl = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${botMemberData.avatar}.png`;
      }
    }

    const staffRole = staffRows[0] ?? null;
    const isHC  = isStaffRole && (staffRole?.isSeniorStaff ?? false); // High Command
    const isFTP = isStaffRole && (staffRole?.isStaff ?? false);       // FTP Supervisor
    setSessionUser(req, {
      id: discordUser.id,
      username: discordUser.username,
      displayName,
      avatar: avatarUrl,
      roles,
      guildId: DISCORD_GUILD_ID,
      isOwner,
      isSuperAdmin: isOwner,
      isSeniorStaff: isOwner || isHC,
      isStaff: isOwner || isHC || isFTP,
      isTrusted: isOwner || isStaffRole,
    });

    try {
      await db.insert(adminLogsTable).values({
        actionType: "LOGIN",
        entityType: "session",
        entityId: discordUser.id,
        entityName: displayName,
        changedBy: displayName,
        changedByUid: discordUser.id,
        changes: null,
      });
    } catch (_) {}

    res.redirect("/shift-roster/dashboard");
  } catch (err) {
    console.error("Discord OAuth error:", err);
    res.redirect("/shift-roster/?auth_error=server_error");
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  const user = (req.session as any)?.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  // Refresh staff roles from DB so role changes take effect without re-login
  try {
    const freshStaff = await db
      .select()
      .from(staffRolesTable)
      .where(eq(staffRolesTable.discordUid, user.id))
      .limit(1);
    const sr = freshStaff[0] ?? null;
    const isSuperAdmin = user.isOwner || (sr?.isSuperAdmin ?? false);
    const isSeniorStaff = isSuperAdmin || (sr?.isSeniorStaff ?? false);
    const isStaff = isSeniorStaff || (sr?.isStaff ?? false);
    const isTrusted = isStaff || (sr?.isTrusted ?? false);
    res.json({
      user: {
        ...user,
        isSuperAdmin,
        isSeniorStaff,
        isStaff,
        isTrusted,
      },
    });
  } catch {
    res.json({ user });
  }
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) console.error("Session destroy error:", err);
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

router.get("/auth/config", (_req: Request, res: Response) => {
  res.json({
    configured: !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
    localDevLogin: LOCAL_DEV_LOGIN,
    guildId: DISCORD_GUILD_ID,
  });
});

export default router;
