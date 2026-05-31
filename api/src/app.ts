import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { authRouter } from './routes/auth.js'
import { householdRouter } from './routes/household.js'
import { requireAuth } from './middleware/auth.js'
import { adminRouter } from './routes/admin.js'
import { kidsRouter } from './routes/kids.js'
import { choresRouter } from './routes/chores.js'
import { payoutsRouter } from './routes/payouts.js'

export const app = express()

const trustProxySetting = process.env.TRUST_PROXY
if (trustProxySetting) {
  const parsedTrustProxy =
    trustProxySetting === 'true'
      ? true
      : /^\d+$/.test(trustProxySetting)
        ? Number(trustProxySetting)
        : trustProxySetting
  app.set('trust proxy', parsedTrustProxy)
}

const corsOrigin = process.env.CORS_ORIGIN
app.use(
  cors({
    origin: corsOrigin ?? false,
    credentials: true,
  })
)

app.use(express.json())
app.use(cookieParser())

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(apiLimiter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authLimiter, authRouter)
app.use('/admin', adminLimiter, requireAuth, adminRouter)
app.use('/household', requireAuth, householdRouter)
app.use('/kids', requireAuth, kidsRouter)
app.use('/chores', requireAuth, choresRouter)
app.use('/payouts', requireAuth, payoutsRouter)
