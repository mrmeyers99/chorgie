import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdminMode } from '../middleware/admin.js'

export const kidsRouter = Router()

const createKidSchema = z.object({
  enc_display_name: z.string().min(1),
  avatar_id: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
})

const updateKidSchema = z
  .object({
    enc_display_name: z.string().min(1).optional(),
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
    { message: 'At least one field is required.' }
  )

kidsRouter.get('/', async (_req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      enc_display_name: string
      avatar_id: string
      sort_order: number
      balance: string
      is_active: boolean
      created_at: string
    }>(
      `SELECT id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at
       FROM kid_profiles
       WHERE household_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [householdId]
    )

    res.status(200).json({ kids: result.rows })
  } finally {
    client.release()
  }
})

kidsRouter.post('/', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = createKidSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const client = await pool.connect()
  try {
    const { enc_display_name, avatar_id, sort_order } = parsed.data
    const result = await client.query<{
      id: string
      enc_display_name: string
      avatar_id: string
      sort_order: number
      balance: string
      is_active: boolean
      created_at: string
    }>(
      `INSERT INTO kid_profiles (household_id, enc_display_name, avatar_id, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at`,
      [householdId, enc_display_name, avatar_id, sort_order]
    )

    res.status(201).json(result.rows[0])
  } finally {
    client.release()
  }
})

kidsRouter.delete('/:id', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { id } = req.params
  const client = await pool.connect()
  try {
    const result = await client.query<{ id: string }>(
      `UPDATE kid_profiles
       SET is_active = false
       WHERE id = $1 AND household_id = $2
       RETURNING id`,
      [id, householdId]
    )

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Kid profile not found.' })
      return
    }

    res.status(204).send()
  } finally {
    client.release()
  }
})

kidsRouter.get('/:id/completions', async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { id } = req.params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    res.status(400).json({ error: 'Invalid kid ID format.' })
    return
  }

  const client = await pool.connect()
  try {
    // Verify kid exists in household
    const kidResult = await client.query<{ id: string }>(
      `SELECT id FROM kid_profiles WHERE id = $1 AND household_id = $2`,
      [id, householdId]
    )

    if (!kidResult.rows[0]) {
      res.status(404).json({ error: 'Kid profile not found.' })
      return
    }

    const result = await client.query<{
      id: string
      chore_id: string
      chore_name: string
      reward_amount: string
      completed_at: string
      paid_at: string | null
      payout_id: string | null
    }>(
      `SELECT
        cc.id,
        cc.chore_id,
        cd.enc_name as chore_name,
        cc.reward_amount,
        cc.completed_at,
        cc.paid_at,
        cc.payout_id
       FROM chore_completions cc
       JOIN chore_definitions cd ON cc.chore_id = cd.id AND cc.household_id = cd.household_id
       WHERE cc.kid_id = $1 AND cc.household_id = $2
       ORDER BY cc.completed_at DESC`,
      [id, householdId]
    )

    res.status(200).json({ completions: result.rows })
  } finally {
    client.release()
  }
})

kidsRouter.patch('/:id/avatar', async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const avatarSchema = z.object({
    avatar_id: z.string().min(1).max(100),
  })

  const parsed = avatarSchema.safeParse(req.body)
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
  const { avatar_id } = parsed.data
  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      enc_display_name: string
      avatar_id: string
      sort_order: number
      balance: string
      is_active: boolean
      created_at: string
    }>(
      `UPDATE kid_profiles
       SET avatar_id = $3
       WHERE id = $1 AND household_id = $2
       RETURNING id, enc_display_name, avatar_id, sort_order, balance, is_active, created_at`,
      [id, householdId, avatar_id]
    )

    const kid = result.rows[0]
    if (!kid) {
      res.status(404).json({ error: 'Kid profile not found.' })
      return
    }

    res.status(200).json(kid)
  } finally {
    client.release()
  }
})

kidsRouter.patch('/:id', requireAdminMode, async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = updateKidSchema.safeParse(req.body)
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
  const { enc_display_name, avatar_id, sort_order, is_active } = parsed.data
  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      enc_display_name: string
      avatar_id: string
      sort_order: number
      balance: string
      is_active: boolean
      created_at: string
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
      ]
    )

    const kid = result.rows[0]
    if (!kid) {
      res.status(404).json({ error: 'Kid profile not found.' })
      return
    }

    res.status(200).json(kid)
  } finally {
    client.release()
  }
})
