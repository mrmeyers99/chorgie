import type { Request, Response, NextFunction } from 'express'

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const headerToken = req.get('x-csrf-token')
  const cookieToken = req.cookies?.csrfToken as string | undefined

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    res.status(403).json({ error: 'CSRF validation failed.' })
    return
  }

  next()
}
