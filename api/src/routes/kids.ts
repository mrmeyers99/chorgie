import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdminMode } from "../middleware/admin.js";

export const kidsRouter = Router();

const createKidSchema = z.object({
  enc_display_name: z.string().min(1).max(20000),
  avatar_id: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
});

const updateKidSchema = z
  .object({
    enc_display_name: z.string().min(1).max(20000).optional(),
    avatar_id: z.string().min(1).max(100).optional(),
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enc_display_name !== undefined ||
      value.avatar_id !== undefined ||
      value.sort_order !== undefined ||
      value.is_active !== undefined,
    { message: "At least one field is required." },
  );

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const kidIdUuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Matches the exact `to_char(... , 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` shape the
// history query produces — validated by regex rather than Date.parse, since
// Date only has millisecond precision and would misvalidate/mangle this
const cursorTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function encodeHistoryCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`).toString("base64url");
}

function decodeHistoryCursor(
  cursor: string,
): { occurredAt: string; id: string } | null {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const sepIndex = decoded.lastIndexOf("|");
  if (sepIndex === -1) return null;
  const occurredAt = decoded.slice(0, sepIndex);
  const cursorId = decoded.slice(sepIndex + 1);
  if (
    !cursorTimestampRegex.test(occurredAt) ||
    !kidIdUuidRegex.test(cursorId)
  ) {
    return null;
  }
  return { occurredAt, id: cursorId };
}

kidsRouter.get("/", async (_req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string;
      enc_display_name: string;
      avatar_id: string;
      sort_order: number;
      balance: string;
      is_active: boolean;
      created_at: string;
    }>(
      `SELECT id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at
       FROM kid_profiles
       WHERE household_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [householdId],
    );

    res.status(200).json({ kids: result.rows });
  } finally {
    client.release();
  }
});

kidsRouter.post("/", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = createKidSchema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      "Invalid request";
    res.status(400).json({ error: message });
    return;
  }

  const client = await pool.connect();
  try {
    const { enc_display_name, avatar_id, sort_order } = parsed.data;
    const result = await client.query<{
      id: string;
      enc_display_name: string;
      avatar_id: string;
      sort_order: number;
      balance: string;
      is_active: boolean;
      created_at: string;
    }>(
      `INSERT INTO kid_profiles (household_id, enc_display_name, avatar_id, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at`,
      [householdId, enc_display_name, avatar_id, sort_order],
    );

    res.status(201).json(result.rows[0]);
  } finally {
    client.release();
  }
});

kidsRouter.delete("/:id", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query<{ id: string }>(
      `UPDATE kid_profiles
       SET is_active = false
       WHERE id = $1 AND household_id = $2
       RETURNING id`,
      [id, householdId],
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    res.status(204).send();
  } finally {
    client.release();
  }
});

kidsRouter.get("/:id/history", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  if (!kidIdUuidRegex.test(id)) {
    res.status(400).json({ error: "Invalid kid ID format." });
    return;
  }

  const parsedQuery = historyQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Invalid limit or cursor parameter." });
    return;
  }
  const { limit } = parsedQuery.data;

  const cursor = parsedQuery.data.cursor
    ? decodeHistoryCursor(parsedQuery.data.cursor)
    : null;
  if (parsedQuery.data.cursor && !cursor) {
    res.status(400).json({ error: "Invalid cursor." });
    return;
  }

  const client = await pool.connect();
  try {
    // Verify kid exists in household
    const kidResult = await client.query<{ id: string }>(
      `SELECT id FROM kid_profiles WHERE id = $1 AND household_id = $2`,
      [id, householdId],
    );

    if (!kidResult.rows[0]) {
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    // payouts aren't tied to specific completions (PRD §6.7), so this has to be a
    // UNION ALL of two independent logs, not a join
    //
    // occurred_at_raw carries full microsecond precision as text so the cursor never
    // round-trips through a JS Date (millisecond precision), which would let two rows
    // landing in the same millisecond permanently vanish from the ledger
    const result = await client.query<{
      id: string;
      type: "completion" | "payout";
      occurred_at: string;
      occurred_at_raw: string;
      amount: string;
      chore_id: string | null;
      chore_name: string | null;
      enc_notes: string | null;
    }>(
      `SELECT * FROM (
         SELECT cc.id, 'completion' AS type, cc.completed_at AS occurred_at,
                to_char(cc.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_raw,
                cc.reward_amount AS amount, cc.chore_id,
                cd.enc_name AS chore_name, NULL AS enc_notes
         FROM chore_completions cc
         JOIN chore_definitions cd ON cc.chore_id = cd.id AND cc.household_id = cd.household_id
         WHERE cc.kid_id = $1 AND cc.household_id = $2
           AND ($3::timestamptz IS NULL OR (cc.completed_at, cc.id) < ($3::timestamptz, $4::uuid))
         UNION ALL
         SELECT p.id, 'payout' AS type, p.paid_at AS occurred_at,
                to_char(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_raw,
                p.amount, NULL AS chore_id,
                NULL AS chore_name, p.enc_notes
         FROM payouts p
         WHERE p.kid_id = $1 AND p.household_id = $2
           AND ($3::timestamptz IS NULL OR (p.paid_at, p.id) < ($3::timestamptz, $4::uuid))
       ) combined
       ORDER BY occurred_at DESC, id DESC
       LIMIT $5`,
      [
        id,
        householdId,
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );

    const hasMore = result.rows.length > limit;
    const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor =
      hasMore && pageRows.length > 0
        ? encodeHistoryCursor(
            pageRows[pageRows.length - 1].occurred_at_raw,
            pageRows[pageRows.length - 1].id,
          )
        : null;
    const entries = pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      occurred_at: row.occurred_at,
      amount: row.amount,
      chore_id: row.chore_id,
      chore_name: row.chore_name,
      enc_notes: row.enc_notes,
    }));

    res.status(200).json({ entries, next_cursor: nextCursor });
  } finally {
    client.release();
  }
});

kidsRouter.patch("/:id", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = updateKidSchema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      "Invalid request";
    res.status(400).json({ error: message });
    return;
  }

  const { id } = req.params;
  const { enc_display_name, avatar_id, sort_order, is_active } = parsed.data;
  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string;
      enc_display_name: string;
      avatar_id: string;
      sort_order: number;
      balance: string;
      is_active: boolean;
      created_at: string;
    }>(
      `UPDATE kid_profiles
       SET enc_display_name = COALESCE($3, enc_display_name),
           avatar_id = COALESCE($4, avatar_id),
           sort_order = COALESCE($5, sort_order),
           is_active = COALESCE($6, is_active)
       WHERE id = $1 AND household_id = $2
       RETURNING id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at`,
      [
        id,
        householdId,
        enc_display_name ?? null,
        avatar_id ?? null,
        sort_order ?? null,
        is_active ?? null,
      ],
    );

    const kid = result.rows[0];
    if (!kid) {
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    res.status(200).json(kid);
  } finally {
    client.release();
  }
});
