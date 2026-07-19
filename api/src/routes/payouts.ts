import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdminMode } from "../middleware/admin.js";

export const payoutsRouter = Router();

const createPayoutSchema = z.object({
  kid_id: z.string().uuid(),
  amount: z.number().positive(),
  enc_notes: z.string().max(20000).optional(),
});

type PayoutRow = {
  id: string;
  household_id: string;
  kid_id: string;
  amount: string;
  enc_notes: string | null;
  paid_at: string;
  created_at: string;
};

payoutsRouter.post("/", requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = createPayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      "Invalid request";
    res.status(400).json({ error: message });
    return;
  }

  const { kid_id, enc_notes } = parsed.data;
  const amount = Math.round(parsed.data.amount * 100) / 100;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the kid_profiles row to prevent race conditions with concurrent chore completions
    const kidResult = await client.query<{ id: string; balance: string }>(
      `SELECT id, balance
       FROM kid_profiles
       WHERE id = $1 AND household_id = $2 AND is_active = true
       FOR UPDATE`,
      [kid_id, householdId],
    );

    if (!kidResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Kid profile not found." });
      return;
    }

    const balance = parseFloat(kidResult.rows[0].balance);

    if (amount > balance) {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: "Payout amount cannot exceed the kid's current balance.",
      });
      return;
    }

    const payoutResult = await client.query<PayoutRow>(
      `INSERT INTO payouts (household_id, kid_id, amount, enc_notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, household_id, kid_id, amount, enc_notes, paid_at, created_at`,
      [householdId, kid_id, amount, enc_notes ?? null],
    );

    const payout = payoutResult.rows[0];

    await client.query(
      `UPDATE kid_profiles
       SET balance = balance - $1
       WHERE id = $2 AND household_id = $3`,
      [amount, kid_id, householdId],
    );

    await client.query("COMMIT");
    res.status(201).json(payout);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

payoutsRouter.get("/:id", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  // Validate id parameter
  const idValidation = z.string().uuid().safeParse(id);
  if (!idValidation.success) {
    res.status(404).json({ error: "Payout not found." });
    return;
  }

  const client = await pool.connect();
  try {
    const payoutResult = await client.query<PayoutRow>(
      `SELECT id, household_id, kid_id, amount, enc_notes, paid_at, created_at
       FROM payouts
       WHERE id = $1 AND household_id = $2`,
      [id, householdId],
    );

    const payout = payoutResult.rows[0];
    if (!payout) {
      res.status(404).json({ error: "Payout not found." });
      return;
    }

    res.status(200).json(payout);
  } finally {
    client.release();
  }
});
