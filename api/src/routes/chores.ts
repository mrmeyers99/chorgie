import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdminMode } from '../middleware/admin.js'

export const choresRouter = Router()

const RECURRENCE_TYPES = ['one-time', 'fixed', 'completion-based'] as const

const createChoreSchema = z.object({
  enc_name: z.string().min(1),
  enc_description: z.string().optional(),
  reward_amount: z.number().nonnegative(),
  recurrence_type: z.enum(RECURRENCE_TYPES),
  enc_recurrence_rule: z.string().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

const updateChoreSchema = z
  .object({
    enc_name: z.string().min(1).optional(),
    enc_description: z.string().nullable().optional(),
    reward_amount: z.number().nonnegative().optional(),
    recurrence_type: z.enum(RECURRENCE_TYPES).optional(),
    enc_recurrence_rule: z.string().nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enc_name !== undefined ||
      value.enc_description !== undefined ||
      value.reward_amount !== undefined ||
      value.recurrence_type !== undefined ||
      value.enc_recurrence_rule !== undefined ||
      value.assigned_to !== undefined ||
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
  assigned_to: string | null
  is_active: boolean
  created_at: string
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
      `SELECT id, household_id, enc_name, enc_description, reward_amount,
              recurrence_type, enc_recurrence_rule, assigned_to, is_active, created_at
       FROM chore_definitions
       WHERE household_id = $1
       ORDER BY created_at ASC`,
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

  const { enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule, assigned_to } =
    parsed.data

  const client = await pool.connect()
  try {
    const result = await client.query<ChoreRow>(
      `INSERT INTO chore_definitions
         (household_id, enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, household_id, enc_name, enc_description, reward_amount,
                 recurrence_type, enc_recurrence_rule, assigned_to, is_active, created_at`,
      [
        householdId,
        enc_name,
        enc_description ?? null,
        reward_amount,
        recurrence_type,
        enc_recurrence_rule ?? null,
        assigned_to ?? null,
      ]
    )

    res.status(201).json(result.rows[0])
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
  const { enc_name, enc_description, reward_amount, recurrence_type, enc_recurrence_rule, assigned_to, is_active } =
    parsed.data

  const client = await pool.connect()
  try {
    const result = await client.query<ChoreRow>(
      `UPDATE chore_definitions
       SET enc_name             = COALESCE($3, enc_name),
           enc_description      = CASE WHEN $4::boolean THEN $5 ELSE enc_description END,
           reward_amount        = COALESCE($6, reward_amount),
           recurrence_type      = COALESCE($7, recurrence_type),
           enc_recurrence_rule  = CASE WHEN $8::boolean THEN $9 ELSE enc_recurrence_rule END,
           assigned_to          = CASE WHEN $10::boolean THEN $11 ELSE assigned_to END,
           is_active            = COALESCE($12, is_active)
       WHERE id = $1 AND household_id = $2
       RETURNING id, household_id, enc_name, enc_description, reward_amount,
                 recurrence_type, enc_recurrence_rule, assigned_to, is_active, created_at`,
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
        assigned_to !== undefined,
        assigned_to ?? null,
        is_active ?? null,
      ]
    )

    const chore = result.rows[0]
    if (!chore) {
      res.status(404).json({ error: 'Chore definition not found.' })
      return
    }

    res.status(200).json(chore)
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
