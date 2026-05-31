import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdminMode } from '../middleware/admin.js'

export const choresRouter = Router()

const RECURRENCE_TYPES = ['ad-hoc', 'completion-based'] as const

const createChoreSchema = z.object({
  enc_name: z.string().min(1),
  enc_description: z.string().optional(),
  reward_amount: z.number().nonnegative(),
  recurrence_type: z.enum(RECURRENCE_TYPES),
  enc_recurrence_rule: z.string().optional(),
  eligible_kids: z.array(z.string().uuid()).optional(),
})

const updateChoreSchema = z
  .object({
    enc_name: z.string().min(1).optional(),
    enc_description: z.string().nullable().optional(),
    reward_amount: z.number().nonnegative().optional(),
    recurrence_type: z.enum(RECURRENCE_TYPES).optional(),
    enc_recurrence_rule: z.string().nullable().optional(),
    eligible_kids: z.array(z.string().uuid()).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enc_name !== undefined ||
      value.enc_description !== undefined ||
      value.reward_amount !== undefined ||
      value.recurrence_type !== undefined ||
      value.enc_recurrence_rule !== undefined ||
      value.eligible_kids !== undefined ||
      value.is_active !== undefined,
    { message: 'At least one field is required.' }
  )

type ChoreRow = {
  id: string
  household_id: string
  enc_name: string
  enc_description: string | null
  reward_amount: string
  recurrence_type: string
  enc_recurrence_rule: string | null
  eligible_kids: string[]
  is_active: boolean
  is_available: boolean
  last_completed_at: string | null
  created_at: string
}

type ChoreAvailabilityRow = {
  id: string
  household_id: string
  reward_amount: string
  recurrence_type: string
  enc_recurrence_rule: string | null
  eligible_kids: string[]
  is_active: boolean
  last_completed_at: string | null
}

const completeChoreSchema = z.object({
  kid_id: z.string().uuid(),
})

function getRecurrenceDays(rule: string | null) {
  if (!rule) return null
  const parsed = Number.parseInt(rule, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null
  }
  return parsed
}

function isChoreCurrentlyAvailable(chore: {
  recurrence_type: string
  enc_recurrence_rule: string | null
  last_completed_at: string | null
}) {
  if (!chore.last_completed_at) {
    return true
  }

  if (chore.recurrence_type === 'one-time') {
    return false
  }

  if (chore.recurrence_type === 'completion-based') {
    const recurrenceDays = getRecurrenceDays(chore.enc_recurrence_rule)
    if (!recurrenceDays) {
      return false
    }
    const completedAt = new Date(chore.last_completed_at)
    const nextEligibleAt = new Date(completedAt.getTime() + recurrenceDays * 24 * 60 * 60 * 1000)
    return new Date() >= nextEligibleAt
  }

  return true
}

async function allKidsExistInHousehold(
  client: { query: (text: string, values: unknown[]) => Promise<{ rows: Array<{ count: string }> }> },
  kidIds: string[],
  householdId: string
) {
  if (kidIds.length === 0) return true
  const result = await client.query(
    `SELECT COUNT(*) AS count
     FROM kid_profiles
     WHERE id = ANY($1::uuid[]) AND household_id = $2`,
    [kidIds, householdId]
  )
  return Number(result.rows[0].count) === kidIds.length
}

choresRouter.get('/', async (_req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = await pool.connect()
  try {
    const result = await client.query<ChoreRow>(
      `SELECT cd.id, cd.household_id, cd.enc_name, cd.enc_description, cd.reward_amount,
              cd.recurrence_type, cd.enc_recurrence_rule, cd.is_active, cd.created_at,
              COALESCE(
                (SELECT ARRAY_AGG(cek.kid_id) FROM chore_eligible_kids cek WHERE cek.chore_id = cd.id),
                '{}'
              ) AS eligible_kids,
              lc.completed_at AS last_completed_at,
              CASE
                WHEN cd.is_active = false THEN false
                WHEN cd.recurrence_type = 'completion-based'
                  THEN lc.completed_at IS NULL OR (
                    CASE
                      WHEN cd.enc_recurrence_rule ~ '^[1-9][0-9]*$'
                        THEN NOW() >= lc.completed_at + ((cd.enc_recurrence_rule::int) * INTERVAL '1 day')
                      ELSE false
                    END
                  )
                ELSE true
              END AS is_available
       FROM chore_definitions cd
       LEFT JOIN LATERAL (
         SELECT completed_at
         FROM chore_completions
         WHERE chore_id = cd.id
         ORDER BY completed_at DESC
         LIMIT 1
       ) lc ON true
       WHERE cd.household_id = $1
       ORDER BY lc.completed_at DESC NULLS LAST, cd.created_at ASC`,
      [householdId]
    )

    res.status(200).json({ chores: result.rows })
  } finally {
    client.release()
  }
})

choresRouter.post('/', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = createChoreSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule, eligible_kids } =
    parsed.data

  const client = await pool.connect()
  try {
    if (eligible_kids && eligible_kids.length > 0) {
      const allExist = await allKidsExistInHousehold(client, eligible_kids, householdId)
      if (!allExist) {
        res.status(400).json({ error: 'eligible_kids must reference kids in this household.' })
        return
      }
    }

    await client.query('BEGIN')
    const result = await client.query<Omit<ChoreRow, 'eligible_kids'>>(
      `INSERT INTO chore_definitions
         (household_id, enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, household_id, enc_name, enc_description, reward_amount,
                 recurrence_type, enc_recurrence_rule, is_active, created_at`,
      [
        householdId,
        enc_name,
        enc_description ?? null,
        reward_amount,
        recurrence_type,
        enc_recurrence_rule ?? null,
      ]
    )

    const chore = result.rows[0]

    if (eligible_kids && eligible_kids.length > 0) {
      const placeholders = eligible_kids.map((_, i) => `($1, $${i + 2})`).join(', ')
      await client.query(
        `INSERT INTO chore_eligible_kids (chore_id, kid_id) VALUES ${placeholders}`,
        [chore.id, ...eligible_kids]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ ...chore, eligible_kids: eligible_kids ?? [] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

choresRouter.patch('/:id', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = updateChoreSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { id } = req.params
  const { enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule, eligible_kids, is_active } =
    parsed.data

  const client = await pool.connect()
  try {
    if (eligible_kids && eligible_kids.length > 0) {
      const allExist = await allKidsExistInHousehold(client, eligible_kids, householdId)
      if (!allExist) {
        res.status(400).json({ error: 'eligible_kids must reference kids in this household.' })
        return
      }
    }

    await client.query('BEGIN')

    const result = await client.query<Omit<ChoreRow, 'eligible_kids'>>(
      `UPDATE chore_definitions
       SET enc_name             = COALESCE($3, enc_name),
           enc_description      = CASE WHEN $4::boolean THEN $5 ELSE enc_description END,
           reward_amount        = COALESCE($6, reward_amount),
           recurrence_type      = COALESCE($7, recurrence_type),
           enc_recurrence_rule  = CASE WHEN $8::boolean THEN $9 ELSE enc_recurrence_rule END,
           is_active            = COALESCE($10, is_active)
       WHERE id = $1 AND household_id = $2
       RETURNING id, household_id, enc_name, enc_description, reward_amount,
                 recurrence_type, enc_recurrence_rule, is_active, created_at`,
      [
        id,
        householdId,
        enc_name ?? null,
        enc_description !== undefined,
        enc_description ?? null,
        reward_amount ?? null,
        recurrence_type ?? null,
        enc_recurrence_rule !== undefined,
        enc_recurrence_rule ?? null,
        is_active ?? null,
      ]
    )

    const chore = result.rows[0]
    if (!chore) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Chore definition not found.' })
      return
    }

    let finalEligibleKids: string[]
    if (eligible_kids !== undefined) {
      await client.query(`DELETE FROM chore_eligible_kids WHERE chore_id = $1`, [id])
      if (eligible_kids.length > 0) {
        const placeholders = eligible_kids.map((_, i) => `($1, $${i + 2})`).join(', ')
        await client.query(
          `INSERT INTO chore_eligible_kids (chore_id, kid_id) VALUES ${placeholders}`,
          [id, ...eligible_kids]
        )
      }
      finalEligibleKids = eligible_kids
    } else {
      const ekResult = await client.query<{ kid_id: string }>(
        `SELECT kid_id FROM chore_eligible_kids WHERE chore_id = $1`,
        [id]
      )
      finalEligibleKids = ekResult.rows.map((r) => r.kid_id)
    }

    await client.query('COMMIT')
    res.status(200).json({ ...chore, eligible_kids: finalEligibleKids })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

choresRouter.delete('/:id', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { id } = req.params

  const client = await pool.connect()
  try {
    const result = await client.query<ChoreRow>(
      `UPDATE chore_definitions
       SET is_active = false
       WHERE id = $1 AND household_id = $2
       RETURNING id`,
      [id, householdId]
    )

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Chore definition not found.' })
      return
    }

    res.status(204).send()
  } finally {
    client.release()
  }
})

choresRouter.post('/:id/complete', async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = completeChoreSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { id } = req.params
  const { kid_id } = parsed.data

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

    const choreResult = await client.query<ChoreAvailabilityRow>(
      `SELECT cd.id, cd.household_id, cd.reward_amount, cd.recurrence_type, cd.enc_recurrence_rule, cd.is_active,
              COALESCE(
                (SELECT ARRAY_AGG(cek.kid_id) FROM chore_eligible_kids cek WHERE cek.chore_id = cd.id),
                '{}'
              ) AS eligible_kids,
              lc.completed_at AS last_completed_at
       FROM chore_definitions cd
       LEFT JOIN LATERAL (
         SELECT completed_at
         FROM chore_completions
         WHERE chore_id = cd.id
         ORDER BY completed_at DESC
         LIMIT 1
       ) lc ON true
       WHERE cd.id = $1 AND cd.household_id = $2
      FOR UPDATE OF cd`,
      [id, householdId]
    )

    const chore = choreResult.rows[0]
    if (!chore) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Chore definition not found.' })
      return
    }

    if (!chore.is_active) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'This chore is not active.' })
      return
    }

    if (chore.eligible_kids.length > 0 && !chore.eligible_kids.includes(kid_id)) {
      await client.query('ROLLBACK')
      res.status(403).json({ error: 'This kid is not eligible for the chore.' })
      return
    }

    if (!isChoreCurrentlyAvailable(chore)) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'This chore is not available yet.' })
      return
    }

    const completionResult = await client.query<{ completed_at: string }>(
      `INSERT INTO chore_completions (household_id, chore_id, kid_id, reward_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING completed_at`,
      [householdId, chore.id, kid_id, chore.reward_amount]
    )

    const balanceResult = await client.query<{ balance: string }>(
      `UPDATE kid_profiles
       SET balance = balance + $3::numeric
       WHERE id = $1 AND household_id = $2
       RETURNING balance`,
      [kid_id, householdId, chore.reward_amount]
    )

    await client.query('COMMIT')
    res.status(200).json({
      chore_id: chore.id,
      kid_id,
      reward_amount: chore.reward_amount,
      balance: balanceResult.rows[0]?.balance,
      completed_at: completionResult.rows[0]?.completed_at,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
