import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdminMode } from '../middleware/admin.js'

export const payoutsRouter = Router()

const createPayoutSchema = z.object({
  kid_id: z.string().uuid(),
  enc_notes: z.string().optional(),
})

type PayoutRow = {
  id: string
  household_id: string
  kid_id: string
  enc_notes: string | null
  paid_at: string
  created_at: string
}

type CompletionRow = {
  id: string
  chore_id: string
  kid_id: string
  reward_amount: string
  completed_at: string
  paid_at: string | null
  payout_id: string | null
}

payoutsRouter.post('/', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = createPayoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { kid_id, enc_notes } = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const kidResult = await client.query<{ id: string }>(
      `SELECT id
       FROM kid_profiles
       WHERE id = $1 AND household_id = $2 AND is_active = true`,
      [kid_id, householdId]
    )

    if (!kidResult.rows[0]) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'Kid profile not found.' })
      return
    }

    const unpaidCompletions = await client.query<CompletionRow>(
      `SELECT id, chore_id, kid_id, reward_amount, completed_at, paid_at, payout_id
       FROM chore_completions
       WHERE household_id = $1 AND kid_id = $2 AND paid_at IS NULL
       ORDER BY completed_at ASC`,
      [householdId, kid_id]
    )

    if (unpaidCompletions.rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'No unpaid chore completions for this kid.' })
      return
    }

    const payoutResult = await client.query<PayoutRow>(
      `INSERT INTO payouts (household_id, kid_id, enc_notes)
       VALUES ($1, $2, $3)
       RETURNING id, household_id, kid_id, enc_notes, paid_at, created_at`,
      [householdId, kid_id, enc_notes ?? null]
    )

    const payout = payoutResult.rows[0]

    await client.query(
      `UPDATE chore_completions
       SET payout_id = $1, paid_at = $2
       WHERE household_id = $3 AND kid_id = $4 AND paid_at IS NULL`,
      [payout.id, payout.paid_at, householdId, kid_id]
    )

    await client.query(
      `UPDATE kid_profiles
       SET balance = 0
       WHERE id = $1 AND household_id = $2`,
      [kid_id, householdId]
    )

    await client.query('COMMIT')
    res.status(201).json({
      ...payout,
      completion_count: unpaidCompletions.rows.length,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

payoutsRouter.get('/', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const kidIdFilter = req.query.kid_id as string | undefined

  const client = await pool.connect()
  try {
    let query = `SELECT id, household_id, kid_id, enc_notes, paid_at, created_at
                 FROM payouts
                 WHERE household_id = $1`
    const params: unknown[] = [householdId]

    if (kidIdFilter) {
      query += ` AND kid_id = $2`
      params.push(kidIdFilter)
    }

    query += ` ORDER BY paid_at DESC`

    const result = await client.query<PayoutRow>(query, params)

    res.status(200).json({ payouts: result.rows })
  } finally {
    client.release()
  }
})

payoutsRouter.get('/:id', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { id } = req.params

  const client = await pool.connect()
  try {
    const payoutResult = await client.query<PayoutRow>(
      `SELECT id, household_id, kid_id, enc_notes, paid_at, created_at
       FROM payouts
       WHERE id = $1 AND household_id = $2`,
      [id, householdId]
    )

    const payout = payoutResult.rows[0]
    if (!payout) {
      res.status(404).json({ error: 'Payout not found.' })
      return
    }

    const completionsResult = await client.query<CompletionRow>(
      `SELECT id, chore_id, kid_id, reward_amount, completed_at, paid_at, payout_id
       FROM chore_completions
       WHERE payout_id = $1
       ORDER BY completed_at ASC`,
      [id]
    )

    res.status(200).json({
      ...payout,
      completions: completionsResult.rows,
    })
  } finally {
    client.release()
  }
})
