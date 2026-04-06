import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "1286283853186596904";
const DISCORD_OWNER_ID = process.env.DISCORD_OWNER_ID || "1286283853186596904";
const DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;

function getRedirectUri(req: Request) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || DEV_DOMAIN;
  return `${proto}://${host}/api/auth/discord/callback`;
}

router.get("/auth/discord", (req: Request, res: Response) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    res.status(503).json({ error: "Discord OAuth not configured." });
    return;
  }

  const redirectUri = getRedirectUri(req);
  const state = Math.random().toString(36).slice(2);
  (req.session as any).oauthState = state;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds guilds.members.read",
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

  const storedState = (req.session as any).oauthState;
  if (!state || state !== storedState) {
    res.redirect("/shift-roster/?auth_error=invalid_state");
    return;
  }

  delete (req.session as any).oauthState;

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

    const isOwner = discordUser.id === DISCORD_OWNER_ID;

    let displayName = discordUser.global_name || discordUser.username;
    let roles: string[] = [];
    let avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || "0") % 5}.png`;

    if (isOwner) {
      // Owner always gets in — skip guild membership check
      console.log(`Owner login: ${discordUser.username} (${discordUser.id})`);
    } else {
      // Regular users must be guild members
      const memberRes = await fetch(
        `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
        { headers: { Authorization: authHeader } },
      );

      if (!memberRes.ok) {
        console.warn(`Guild check failed (${memberRes.status}) for user ${discordUser.id}`);
        res.redirect("/shift-roster/?auth_error=not_member");
        return;
      }

      const memberData = await memberRes.json() as {
        nick: string | null;
        roles: string[];
        avatar: string | null;
      };

      displayName = memberData.nick || discordUser.global_name || discordUser.username;
      roles = memberData.roles;

      if (memberData.avatar) {
        avatarUrl = `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${memberData.avatar}.png`;
      }
    }

    (req.session as any).user = {
      id: discordUser.id,
      username: discordUser.username,
      displayName,
      avatar: avatarUrl,
      roles,
      guildId: DISCORD_GUILD_ID,
      isOwner,
    };

    res.redirect("/shift-roster/roster");
  } catch (err) {
    console.error("Discord OAuth error:", err);
    res.redirect("/shift-roster/?auth_error=server_error");
  }
});

router.get("/auth/me", (req: Request, res: Response) => {
  const user = (req.session as any)?.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
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
    guildId: DISCORD_GUILD_ID,
  });
});

export default router;
