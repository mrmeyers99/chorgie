import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'

export const householdRouter = Router()

const updateHouseholdSchema = z
  .object({
    timezone: z.string().min(1).optional(),
    currency_code: z.string().min(1).max(10).optional(),
  })
  .refine(
    (value) => value.timezone !== undefined || value.currency_code !== undefined,
    { message: 'At least one field is required.' }
  )

householdRouter.get('/', async (_req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      timezone: string
      currency_code: string
      enc_salt: string
    }>(
      `SELECT id, timezone, currency_code, enc_salt
       FROM households
       WHERE id = $1
       LIMIT 1`,
      [householdId]
    )

    const household = result.rows[0]
    if (!household) {
      res.status(404).json({ error: 'Household not found.' })
      return
    }

    res.status(200).json({
      id: household.id,
      timezone: household.timezone,
      currency_code: household.currency_code,
      enc_salt: household.enc_salt,
    })
  } finally {
    client.release()
  }
})

householdRouter.patch('/', async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = updateHouseholdSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { timezone, currency_code } = parsed.data

  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      timezone: string
      currency_code: string
      enc_salt: string
    }>(
      `UPDATE households
       SET timezone = COALESCE($2, timezone),
           currency_code = COALESCE($3, currency_code)
       WHERE id = $1
       RETURNING id, timezone, currency_code, enc_salt`,
      [householdId, timezone ?? null, currency_code ?? null]
    )

    const household = result.rows[0]
    if (!household) {
      res.status(404).json({ error: 'Household not found.' })
      return
    }

    res.status(200).json({
      id: household.id,
      timezone: household.timezone,
      currency_code: household.currency_code,
      enc_salt: household.enc_salt,
    })
  } finally {
    client.release()
  }
})
