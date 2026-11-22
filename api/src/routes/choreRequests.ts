import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdminMode } from "../middleware/admin.js";

export const choreRequestsRouter = Router();

const REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

// numeric(10,2) column limit
const MAX_AMOUNT = 99_999_999.99;

const createChoreRequestSchema = z.object({
  kid_id: z.string().uuid(),
  enc_name: z.string().min(1).max(20000),
  requested_amount: z.number().nonnegative().max(MAX_AMOUNT).optional(),
});

const listChoreRequestsSchema = z.object({
  status: z.enum(REQUEST_STATUSES).default("pending"),
  kid_id: z.string().uuid().optional(),
});

const approveChoreRequestSchema = z.object({
  amount: z.number().nonnegative().max(MAX_AMOUNT).optional(),
});

const uuidSchema = z.string().uuid();

type ChoreRequestRow = {
  id: string;
  household_id: string;
  kid_id: string;
  enc_name: string;
  requested_amount: string | null;
  status: (typeof REQUEST_STATUSES)[number];
  approved_amount: string | null;
  created_at: string;
  resolved_at: string | null;
};

const RETURNING_COLUMNS = `id, household_id, kid_id, enc_name, requested_amount, status,
                 approved_amount, created_at, resolved_at`;

function firstZodError(error: z.ZodError) {
  const flat = error.flatten();
  return (
    flat.formErrors[0] ??
    Object.values(flat.fieldErrors).flat()[0] ??
    "Invalid request"
  );
}

function roundToCents(value: number) {
  return Math.round(value * 100) / 100;
}

// Kid-facing: no admin mode, same as POST /chores/:id/complete
choreRequestsRouter.post("/", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = createChoreRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: firstZodError(parsed.error) });
    return;
  }

  const { kid_id, enc_name, requested_amount } = parsed.data;

  const client = await pool.connect();
  try {
    const kidResult = await client.query<{ id: string }>(
      `SELECT id
       FROM kid_profiles
       WHERE id = $1 AND household_id = $2 AND is_active = true`,
      [kid_id, householdId],
    );
    if (!kidResult.rows[0]) {
      res.status(400).json({ error: "Kid profile not found." });
      return;
    }

    const result = await client.query<ChoreRequestRow>(
      `INSERT INTO chore_requests (household_id, kid_id, enc_name, requested_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING ${RETURNING_COLUMNS}`,
      [
        householdId,
        kid_id,
        enc_name,
        requested_amount === undefined ? null : roundToCents(requested_amount),
      ],
    );

    res.status(201).json(result.rows[0]);
  } finally {
    client.release();
  }
});

// Readable without admin mode so the kid dashboard can show "waiting for approval"
choreRequestsRouter.get("/", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = listChoreRequestsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: firstZodError(parsed.error) });
    return;
  }

  const { status, kid_id } = parsed.data;

  const client = await pool.connect();
  try {
    const result = await client.query<ChoreRequestRow>(
      `SELECT ${RETURNING_COLUMNS}
       FROM chore_requests
       WHERE household_id = $1
         AND status = $2
         AND ($3::uuid IS NULL OR kid_id = $3::uuid)
       ORDER BY created_at ASC
       LIMIT 200`,
      [householdId, status, kid_id ?? null],
    );

    res.status(200).json({ requests: result.rows });
  } finally {
    client.release();
  }
});

choreRequestsRouter.post("/:id/approve", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  if (!uuidSchema.safeParse(id).success) {
    res.status(404).json({ error: "Chore request not found." });
    return;
  }

  const parsed = approveChoreRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstZodError(parsed.error) });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requestResult = await client.query<ChoreRequestRow>(
      `SELECT ${RETURNING_COLUMNS}
       FROM chore_requests
       WHERE id = $1 AND household_id = $2
       FOR UPDATE`,
      [id, householdId],
    );

    const choreRequest = requestResult.rows[0];
    if (!choreRequest) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Chore request not found." });
      return;
    }

    if (choreRequest.status !== "pending") {
      await client.query("ROLLBACK");
      res
        .status(409)
        .json({ error: "This chore request has already been resolved." });
      return;
    }

    const rawAmount =
      parsed.data.amount ??
      (choreRequest.requested_amount === null
        ? undefined
        : Number(choreRequest.requested_amount));
    if (rawAmount === undefined) {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: "An amount is required since the kid didn't request one.",
      });
      return;
    }
    const amount = roundToCents(rawAmount);

    // Locks the kid row against concurrent completions/payouts touching balance
    const balanceResult = await client.query<{ balance: string }>(
      `UPDATE kid_profiles
       SET balance = balance + $3::numeric
       WHERE id = $1 AND household_id = $2 AND is_active = true
       RETURNING balance`,
      [choreRequest.kid_id, householdId, amount],
    );

    if (!balanceResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Kid profile not found." });
      return;
    }

    const updated = await client.query<ChoreRequestRow>(
      `UPDATE chore_requests
       SET status = 'approved', approved_amount = $3, resolved_at = NOW()
       WHERE id = $1 AND household_id = $2
       RETURNING ${RETURNING_COLUMNS}`,
      [id, householdId, amount],
    );

    await client.query("COMMIT");
    res
      .status(200)
      .json({ ...updated.rows[0], balance: balanceResult.rows[0].balance });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

choreRequestsRouter.post("/:id/reject", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  if (!uuidSchema.safeParse(id).success) {
    res.status(404).json({ error: "Chore request not found." });
    return;
  }

  const client = await pool.connect();
  try {
    // Single conditional UPDATE is atomic, so no explicit transaction/lock needed
    const result = await client.query<ChoreRequestRow>(
      `UPDATE chore_requests
       SET status = 'rejected', resolved_at = NOW()
       WHERE id = $1 AND household_id = $2 AND status = 'pending'
       RETURNING ${RETURNING_COLUMNS}`,
      [id, householdId],
    );

    if (result.rows[0]) {
      res.status(200).json(result.rows[0]);
      return;
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM chore_requests WHERE id = $1 AND household_id = $2`,
      [id, householdId],
    );
    if (existing.rows[0]) {
      res
        .status(409)
        .json({ error: "This chore request has already been resolved." });
    } else {
      res.status(404).json({ error: "Chore request not found." });
    }
  } finally {
    client.release();
  }
});
