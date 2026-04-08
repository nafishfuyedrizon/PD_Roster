import type { Request, Response } from "express";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  isOwner?: boolean;
  isSuperAdmin?: boolean;
  isSeniorStaff?: boolean;
  isStaff?: boolean;
  isTrusted?: boolean;
}

export function getSessionUser(req: Request): SessionUser | null {
  return (req.session as any)?.user ?? null;
}

export function getUserLevel(user: SessionUser | null): number {
  if (!user) return 0;
  if (user.isOwner) return 5;
  if (user.isSuperAdmin) return 4;
  if (user.isSeniorStaff) return 3;
  if (user.isStaff) return 2;
  if (user.isTrusted) return 1;
  return 0;
}

/**
 * Returns true and sends an error response if the user does NOT meet minLevel.
 * Usage: if (guard(req, res, 3)) return;
 */
export function guard(req: Request, res: Response, minLevel: number): boolean {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return true;
  }
  const level = getUserLevel(user);
  if (level < minLevel) {
    const labels: Record<number, string> = {
      1: "FTO",
      2: "FTP Supervisor",
      3: "High Command",
      4: "Full Power",
      5: "Owner",
    };
    res.status(403).json({ error: `${labels[minLevel] ?? `Level ${minLevel}`} or above required` });
    return true;
  }
  return false;
}
