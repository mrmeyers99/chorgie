import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { pool } from '../db.js'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  timezone: z.string().min(1),
  currency_code: z.string().min(1).max(10).default('USD'),
  enc_salt: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '30d'
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return secret
}

function issueTokens(userId: string, householdId: string) {
  const secret = getJwtSecret()
  const accessToken = jwt.sign({ sub: userId, householdId }, secret, {
    expiresIn: ACCESS_TOKEN_TTL,
  })
  const refreshToken = jwt.sign(
    { sub: userId, householdId, type: 'refresh' },
    secret,
    { expiresIn: REFRESH_TOKEN_TTL }
  )
  return { accessToken, refreshToken }
}

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

  const { email, password, timezone, currency_code, enc_salt } = parsed.data

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

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (household_id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [householdId, email.toLowerCase(), passwordHash]
    )
    const userId = userResult.rows[0].id

    await client.query('COMMIT')

    const { accessToken, refreshToken } = issueTokens(userId, householdId)

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
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

      const userResult = await pool.query<{
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

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS,
        path: '/',
      })

      res.status(200).json({
        accessToken,
        user: { id: user.id, email: user.email },
      })
    })

    res.status(201).json({
      accessToken,
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
