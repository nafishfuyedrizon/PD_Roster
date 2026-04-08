import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { officersTable, emsDutyLogsTable } from "@workspace/db/schema";
import { or, eq, desc, and, inArray } from "drizzle-orm";

const router = Router();

const SHIFT_TYPES = ["NORMAL", "TRAINING", "UNDERCOVER", "EXTRA", "ALL"];

function calcDaysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return 0;
  const d = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/profile", async (req: Request, res: Response) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const conditions = [];
    if (sessionUser.id) conditions.push(eq(officersTable.discordUid, sessionUser.id));
    if (sessionUser.username) conditions.push(eq(officersTable.discordUsername, sessionUser.username));

    const officers = conditions.length
      ? await db.select().from(officersTable).where(or(...conditions)).limit(1)
      : [];

    const officer = officers[0] ?? null;

    if (!officer) {
      res.json({
        officer: null,
        weeks: [],
        duties: {},
        discordUser: {
          id: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          avatar: sessionUser.avatar,
          isOwner: sessionUser.isOwner,
        },
      });
      return;
    }

    const recentWeeks = await db
      .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
      .from(emsDutyLogsTable)
      .where(eq(emsDutyLogsTable.csNumber, officer.callSign))
      .orderBy(desc(emsDutyLogsTable.weekPeriod))
      .limit(5);

    const weeks = recentWeeks.map((r) => r.weekPeriod);

    const duties: Record<string, Record<string, string>> = {};
    for (const week of weeks) {
      duties[week] = {};
      for (const shiftType of SHIFT_TYPES) {
        duties[week][shiftType] = "00:00";
      }
    }

    if (weeks.length > 0) {
      const nonNullWeeks = weeks.filter((w): w is string => w !== null);
      const logs = await db
        .select()
        .from(emsDutyLogsTable)
        .where(
          and(
            eq(emsDutyLogsTable.csNumber, officer.callSign),
            inArray(emsDutyLogsTable.weekPeriod, nonNullWeeks),
          ),
        );

      for (const log of logs) {
        if (log.weekPeriod && log.shiftType && weeks.includes(log.weekPeriod)) {
          duties[log.weekPeriod][log.shiftType.toUpperCase()] = log.dutyHours ?? "00:00";
        }
      }
    }

    const days = calcDaysSince(officer.dateOfJoining);

    res.json({
      officer: {
        id: officer.id,
        callSign: officer.callSign,
        citizenId: officer.citizenId ?? null,
        name: officer.name,
        rank: officer.rank,
        department: officer.department,
        division: officer.division,
        status: officer.status,
        dateOfJoining: officer.dateOfJoining,
        lastPromotion: officer.lastPromotion,
        daysSinceJoining: days,
        strikesMajor: officer.strikesMajor ?? "0/4",
        strikesMinor: officer.strikesMinor ?? "0/2",
        discordUsername: officer.discordUsername,
        discordUid: officer.discordUid,
      },
      weeks,
      duties,
      discordUser: {
        id: sessionUser.id,
        username: sessionUser.username,
        displayName: sessionUser.displayName,
        avatar: sessionUser.avatar,
        isOwner: sessionUser.isOwner,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// GET /api/profile/view — view any officer's profile by officerId or discordUid (admin use from logs)
router.get("/profile/view", async (req: Request, res: Response) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const officerId = req.query.officerId ? parseInt(String(req.query.officerId), 10) : null;
  const discordUid = req.query.uid ? String(req.query.uid) : null;

  if (!officerId && !discordUid) { res.status(400).json({ error: "officerId or uid required" }); return; }

  try {
    const conditions = [];
    if (officerId) conditions.push(eq(officersTable.id, officerId));
    if (discordUid) conditions.push(eq(officersTable.discordUid, discordUid));

    const officers = await db.select().from(officersTable).where(or(...conditions)).limit(1);
    const officer = officers[0] ?? null;

    if (!officer) { res.json({ officer: null, weeks: [], duties: {} }); return; }

    const recentWeeks = await db
      .selectDistinct({ weekPeriod: emsDutyLogsTable.weekPeriod })
      .from(emsDutyLogsTable)
      .where(eq(emsDutyLogsTable.csNumber, officer.callSign))
      .orderBy(desc(emsDutyLogsTable.weekPeriod))
      .limit(5);

    const weeks = recentWeeks.map((r) => r.weekPeriod);
    const duties: Record<string, Record<string, string>> = {};
    const SHIFT_TYPES_V = ["NORMAL", "TRAINING", "UNDERCOVER", "EXTRA", "ALL"];
    for (const week of weeks) {
      duties[week] = {};
      for (const s of SHIFT_TYPES_V) duties[week][s] = "00:00";
    }
    if (weeks.length > 0) {
      const nonNullWeeks = weeks.filter((w): w is string => w !== null);
      const logs = await db.select().from(emsDutyLogsTable).where(
        and(
          eq(emsDutyLogsTable.csNumber, officer.callSign),
          inArray(emsDutyLogsTable.weekPeriod, nonNullWeeks),
        ),
      );
      for (const log of logs) {
        if (log.weekPeriod && log.shiftType && weeks.includes(log.weekPeriod)) {
          duties[log.weekPeriod][log.shiftType.toUpperCase()] = log.dutyHours ?? "00:00";
        }
      }
    }

    res.json({
      officer: {
        id: officer.id, callSign: officer.callSign, citizenId: officer.citizenId ?? null,
        name: officer.name, rank: officer.rank,
        department: officer.department, division: officer.division, status: officer.status,
        dateOfJoining: officer.dateOfJoining, lastPromotion: officer.lastPromotion,
        daysSinceJoining: calcDaysSince(officer.dateOfJoining),
        strikesMajor: officer.strikesMajor ?? "0/4", strikesMinor: officer.strikesMinor ?? "0/2",
        discordUsername: officer.discordUsername, discordUid: officer.discordUid,
      },
      weeks,
      duties,
    });
  } catch (err) {
    console.error("Profile view error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PATCH /api/profile/dates — update dateOfJoining and lastPromotion for an officer
router.patch("/profile/dates", async (req: Request, res: Response) => {
  const sessionUser = (req.session as any)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!sessionUser.isOwner && !sessionUser.isSeniorStaff && !sessionUser.isStaff) {
    res.status(403).json({ error: "FTP Supervisor or above required" });
    return;
  }

  const { officerId, dateOfJoining, lastPromotion } = req.body;
  if (!officerId) {
    res.status(400).json({ error: "officerId required" });
    return;
  }

  try {
    const updates: Record<string, string | null> = {};
    if (dateOfJoining !== undefined) updates.dateOfJoining = dateOfJoining || null;
    if (lastPromotion !== undefined) updates.lastPromotion = lastPromotion || null;

    await db
      .update(officersTable)
      .set(updates as any)
      .where(eq(officersTable.id, officerId));

    res.json({ ok: true });
  } catch (err) {
    console.error("Profile dates update error:", err);
    res.status(500).json({ error: "Failed to update dates" });
  }
});

export default router;
