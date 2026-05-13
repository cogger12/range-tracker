import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from './db'

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomUUID()
const COOKIE_NAME = 'rt_token'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as {
      sub: number
      username: string
      admin?: boolean
    }
    req.userId = payload.sub
    req.username = payload.username
    req.isAdmin = Boolean(payload.admin)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId) as
    | { is_admin: number }
    | undefined
  if (!row || row.is_admin !== 1) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

function setTokenCookie(res: Response, userId: number, username: string, isAdmin: boolean): void {
  const token = jwt.sign({ sub: userId, username, admin: isAdmin }, JWT_SECRET, { expiresIn: '30d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

const router = Router()

router.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' })
    return
  }

  const row = db
    .prepare('SELECT id, username, password_hash, is_admin FROM users WHERE username = ?')
    .get(username.trim()) as
    | { id: number; username: string; password_hash: string; is_admin: number }
    | undefined

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }

  setTokenCookie(res, row.id, row.username, row.is_admin === 1)
  res.json({ id: row.id, username: row.username, isAdmin: row.is_admin === 1 })
})

router.post('/api/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

router.get('/api/me', requireAuth, (req: Request, res: Response) => {
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId!) as
    | { is_admin: number }
    | undefined
  res.json({
    id: req.userId,
    username: req.username,
    isAdmin: row?.is_admin === 1,
  })
})

export default router
