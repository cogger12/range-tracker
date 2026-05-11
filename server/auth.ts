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
    const payload = jwt.verify(token, JWT_SECRET) as unknown as { sub: number; username: string }
    req.userId = payload.sub
    req.username = payload.username
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function setTokenCookie(res: Response, userId: number, username: string): void {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: '30d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

const router = Router()

router.post('/api/register', (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    res.status(400).json({ error: 'Username must be at least 2 characters' })
    return
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }

  const trimmed = username.trim()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmed)
  if (existing) {
    res.status(409).json({ error: 'Username already taken' })
    return
  }

  const hash = bcrypt.hashSync(password, 10)
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(trimmed, hash)
  const userId = Number(result.lastInsertRowid)

  setTokenCookie(res, userId, trimmed)
  res.json({ id: userId, username: trimmed })
})

router.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' })
    return
  }

  const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username.trim()) as
    | { id: number; username: string; password_hash: string }
    | undefined

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }

  setTokenCookie(res, row.id, row.username)
  res.json({ id: row.id, username: row.username })
})

router.post('/api/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

router.get('/api/me', requireAuth, (req: Request, res: Response) => {
  res.json({ id: req.userId, username: req.username })
})

export default router
