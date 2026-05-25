import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../auth.js'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get('authorization')
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const claims = verifyAccessToken(token)
    res.locals.auth = {
      userId: claims.sub,
      householdId: claims.householdId,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
