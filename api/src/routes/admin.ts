import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { pool } from '../db.js'
import { issueAdminModeToken } from '../auth.js'

export const adminRouter = Router()

const enterAdminSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
})

adminRouter.post('/enter', async (req, res) => {
  const parsed = enterAdminSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'PIN must be 4-8 digits.' })
    return
  }

  const userId = res.locals.auth?.userId as string | undefined
  const householdId = res.locals.auth?.householdId as string | undefined
  if (!userId || !householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = await pool.connect()
  try {
    const result = await client.query<{ admin_pin_hash: string | null }>(
      `SELECT admin_pin_hash
       FROM users
       WHERE id = $1 AND household_id = $2
       LIMIT 1`,
      [userId, householdId]
    )
    const user = result.rows[0]
    if (!user?.admin_pin_hash) {
      res.status(403).json({ error: 'Admin PIN is not configured.' })
      return
    }

    const isValidPin = await bcrypt.compare(parsed.data.pin, user.admin_pin_hash)
    if (!isValidPin) {
      res.status(403).json({ error: 'Incorrect PIN.' })
      return
    }

    const adminModeToken = issueAdminModeToken(userId, householdId)
    res.status(200).json({ adminModeToken, expiresInSeconds: 600 })
  } finally {
    client.release()
  }
})

adminRouter.post('/exit', (_req, res) => {
  res.status(204).send()
})
