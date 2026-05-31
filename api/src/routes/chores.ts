import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdminMode } from '../middleware/admin.js'

export const choresRouter = Router()

const RECURRENCE_TYPES = ['one-time', 'ad-hoc', 'completion-based'] as const

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
  created_at: string
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
              COALESCE(ARRAY_AGG(cek.kid_id) FILTER (WHERE cek.kid_id IS NOT NULL), '{}') AS eligible_kids
       FROM chore_definitions cd
       LEFT JOIN chore_eligible_kids cek ON cek.chore_id = cd.id
       WHERE cd.household_id = $1
       GROUP BY cd.id
       ORDER BY cd.created_at ASC`,
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
