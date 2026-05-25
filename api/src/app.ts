import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { authRouter } from './routes/auth.js'
import { householdRouter } from './routes/household.js'
import { requireAuth } from './middleware/auth.js'

export const app = express()

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

app.use(apiLimiter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authLimiter, authRouter)
app.use('/household', requireAuth, householdRouter)
