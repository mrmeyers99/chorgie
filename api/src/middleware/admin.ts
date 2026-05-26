import type { Request, Response, NextFunction } from 'express'
import { verifyAdminModeToken } from '../auth.js'

export function requireAdminMode(req: Request, res: Response, next: NextFunction) {
  const token = req.get('x-admin-mode-token')
  if (!token) {
    res.status(403).json({ error: 'Admin mode required.' })
    return
  }

  const auth = res.locals.auth as { userId?: string; householdId?: string } | undefined
  if (!auth?.userId || !auth.householdId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const claims = verifyAdminModeToken(token)
    if (claims.sub !== auth.userId || claims.householdId !== auth.householdId) {
      res.status(403).json({ error: 'Admin mode required.' })
      return
    }
    next()
  } catch {
    res.status(403).json({ error: 'Admin mode required.' })
  }
}
