import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  issueTokens,
  getRefreshCookieOptions,
  verifyRefreshToken,
  getCsrfCookieOptions,
  issueCsrfToken,
} from '../auth.js'
import { requireCsrf } from '../middleware/csrf.js'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  admin_pin: z.string().regex(/^\d{4,8}$/),
  timezone: z.string().min(1),
  currency_code: z.string().min(1).max(10).default('USD'),
  enc_salt: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { email, password, admin_pin, timezone, currency_code, enc_salt } = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'An account with that email already exists.' })
      return
    }

    const householdResult = await client.query<{ id: string }>(
      `INSERT INTO households (timezone, currency_code, enc_salt)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [timezone, currency_code, enc_salt]
    )
    const householdId = householdResult.rows[0].id

    const passwordHash = await bcrypt.hash(password, 12)
    const adminPinHash = await bcrypt.hash(admin_pin, 12)

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (household_id, email, password_hash, admin_pin_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [householdId, email.toLowerCase(), passwordHash, adminPinHash]
    )
    const userId = userResult.rows[0].id

    await client.query('COMMIT')

    const { accessToken, refreshToken } = issueTokens(userId, householdId)
    const csrfToken = issueCsrfToken()

    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions())
    res.cookie('csrfToken', csrfToken, getCsrfCookieOptions())

    res.status(201).json({
      accessToken,
      csrfToken,
      user: { id: userId, email: email.toLowerCase() },
      household: { id: householdId, timezone, currency_code },
    })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback errors (e.g. if the transaction already committed)
    }
    throw err
  } finally {
    client.release()
  }
})

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.formErrors[0] ??
      Object.values(flat.fieldErrors).flat()[0] ??
      'Invalid request'
    res.status(400).json({ error: message })
    return
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  const client = await pool.connect()
  try {
    const userResult = await client.query<{
      id: string
      email: string
      password_hash: string
      household_id: string
    }>(
      `SELECT id, email, password_hash, household_id
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail]
    )

    const user = userResult.rows[0]
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    const { accessToken, refreshToken } = issueTokens(user.id, user.household_id)
    const csrfToken = issueCsrfToken()

    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions())
    res.cookie('csrfToken', csrfToken, getCsrfCookieOptions())

    res.status(200).json({
      accessToken,
      csrfToken,
      user: { id: user.id, email: user.email },
    })
  } finally {
    client.release()
  }
})

authRouter.post('/refresh', requireCsrf, async (req, res) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined
  if (!refreshToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  let claims: { sub: string; householdId: string }
  try {
    claims = verifyRefreshToken(refreshToken)
  } catch {
    res.clearCookie('refreshToken', getRefreshCookieOptions())
    res.clearCookie('csrfToken', getCsrfCookieOptions())
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const client = await pool.connect()
  try {
    const userResult = await client.query<{
      id: string
      household_id: string
    }>(
      `SELECT id, household_id
       FROM users
       WHERE id = $1 AND household_id = $2
       LIMIT 1`,
      [claims.sub, claims.householdId]
    )

    const user = userResult.rows[0]
    if (!user) {
      res.clearCookie('refreshToken', getRefreshCookieOptions())
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { accessToken, refreshToken: nextRefreshToken } = issueTokens(
      user.id,
      user.household_id
    )
    const csrfToken = issueCsrfToken()
    res.cookie('refreshToken', nextRefreshToken, getRefreshCookieOptions())
    res.cookie('csrfToken', csrfToken, getCsrfCookieOptions())
    res.status(200).json({ accessToken, csrfToken })
  } finally {
    client.release()
  }
})

authRouter.post('/logout', requireCsrf, (_req, res) => {
  res.clearCookie('refreshToken', getRefreshCookieOptions())
  res.clearCookie('csrfToken', getCsrfCookieOptions())
  res.status(204).send()
})
