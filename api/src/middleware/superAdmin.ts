import type { Request, Response, NextFunction } from "express";
import { pool } from "../db.js";

// Layered on top of requireAuth. The flag is looked up on every request rather
// than baked into the JWT so that revoking it (UPDATE users SET is_super_admin =
// false) takes effect immediately instead of after the access token expires.
export async function requireSuperAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth as
    { userId?: string; householdId?: string } | undefined;
  if (!auth?.userId || !auth.householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const client = await pool.connect();
  let isSuperAdmin: boolean;
  try {
    const result = await client.query<{ is_super_admin: boolean }>(
      `SELECT is_super_admin
       FROM users
       WHERE id = $1 AND household_id = $2
       LIMIT 1`,
      [auth.userId, auth.householdId],
    );
    isSuperAdmin = result.rows[0]?.is_super_admin === true;
  } finally {
    client.release();
  }

  if (!isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required." });
    return;
  }
  next();
}
