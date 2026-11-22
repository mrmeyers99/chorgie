import { Router } from "express";
import { pool } from "../db.js";

// Cross-household, read-only operator view. This is the one router whose
// queries are intentionally NOT scoped by res.locals.auth.householdId -- access
// is gated instead by requireSuperAdmin (see app.ts). Only plaintext,
// non-household-content columns are exposed; nothing here can be decrypted
// server-side anyway.
export const superAdminRouter = Router();

type HouseholdSummaryRow = {
  id: string;
  created_at: Date;
  timezone: string;
  completion_count: string;
};

superAdminRouter.get("/households", async (_req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query<HouseholdSummaryRow>(
      `SELECT h.id,
              h.created_at,
              h.timezone,
              COUNT(cc.id) AS completion_count
       FROM households h
       LEFT JOIN chore_completions cc ON cc.household_id = h.id
       GROUP BY h.id
       ORDER BY h.created_at DESC`,
    );

    res.status(200).json({
      households: result.rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        timezone: row.timezone,
        // COUNT() is bigint, which pg returns as a string
        completion_count: Number(row.completion_count),
      })),
    });
  } finally {
    client.release();
  }
});
