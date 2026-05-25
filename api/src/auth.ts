import jwt from 'jsonwebtoken'
import type { CookieOptions } from 'express'
import { randomBytes } from 'node:crypto'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '30d'
const ADMIN_MODE_TOKEN_TTL = '10m'
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const JWT_ALGORITHM: jwt.Algorithm = 'HS256'

type TokenClaims = {
  sub: string
  householdId: string
  type?: string
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return secret
}

export function issueTokens(userId: string, householdId: string) {
  const secret = getJwtSecret()
  const accessToken = jwt.sign({ sub: userId, householdId }, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL,
  })
  const refreshToken = jwt.sign(
    { sub: userId, householdId, type: 'refresh' },
    secret,
    { algorithm: JWT_ALGORITHM, expiresIn: REFRESH_TOKEN_TTL }
  )
  return { accessToken, refreshToken }
}

export function issueAdminModeToken(userId: string, householdId: string) {
  const secret = getJwtSecret()
  return jwt.sign({ sub: userId, householdId, type: 'admin' }, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ADMIN_MODE_TOKEN_TTL,
  })
}

export function getRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/',
  }
}

export function getCsrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/',
  }
}

export function issueCsrfToken() {
  return randomBytes(32).toString('hex')
}

function parseToken(token: string): TokenClaims {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] })
  if (
    typeof decoded !== 'object' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.householdId !== 'string'
  ) {
    throw new Error('Invalid token payload')
  }
  return decoded as TokenClaims
}

export function verifyAccessToken(token: string): TokenClaims {
  const claims = parseToken(token)
  if (claims.type === 'refresh') {
    throw new Error('Invalid access token')
  }
  return claims
}

export function verifyRefreshToken(token: string): TokenClaims {
  const claims = parseToken(token)
  if (claims.type !== 'refresh') {
    throw new Error('Invalid refresh token')
  }
  return claims
}

export function verifyAdminModeToken(token: string): TokenClaims {
  const claims = parseToken(token)
  if (claims.type !== 'admin') {
    throw new Error('Invalid admin mode token')
  }
  return claims
}
