import { Router } from 'express'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import db, { runTransaction } from '../db'

const router = Router()

function adminCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get() as { c: number }
  return row.c
}

router.get('/users', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      'SELECT id, username, is_admin as isAdmin, created_at as createdAt FROM users ORDER BY id',
    )
    .all() as { id: number; username: string; isAdmin: number; createdAt: string }[]
  res.json(
    rows.map((r) => ({
      id: r.id,
      username: r.username,
      isAdmin: r.isAdmin === 1,
      createdAt: r.createdAt,
    })),
  )
})

router.post('/users', (req: Request, res: Response) => {
  const { username, password, isAdmin } = req.body
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
  const adminFlag = isAdmin === true || isAdmin === 1 ? 1 : 0
  const hash = bcrypt.hashSync(password, 10)
  const result = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(trimmed, hash, adminFlag)
  const id = Number(result.lastInsertRowid)
  res.json({ id, username: trimmed, isAdmin: adminFlag === 1 })
})

router.patch('/users/:id', (req: Request, res: Response) => {
  const rawId = req.params.id
  const targetId = Number(Array.isArray(rawId) ? rawId[0] : rawId)
  if (!Number.isFinite(targetId)) {
    res.status(400).json({ error: 'Invalid user id' })
    return
  }
  const { password, isAdmin } = req.body as { password?: string; isAdmin?: boolean }

  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(targetId) as
    | { id: number; is_admin: number }
    | undefined
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  if (typeof isAdmin === 'boolean') {
    if (target.is_admin === 1 && !isAdmin && adminCount() <= 1) {
      res.status(400).json({ error: 'Cannot remove the last admin' })
      return
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, targetId)
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' })
      return
    }
    const hash = bcrypt.hashSync(password, 10)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId)
  }

  const updated = db
    .prepare('SELECT id, username, is_admin as isAdmin, created_at as createdAt FROM users WHERE id = ?')
    .get(targetId) as { id: number; username: string; isAdmin: number; createdAt: string }
  res.json({
    id: updated.id,
    username: updated.username,
    isAdmin: updated.isAdmin === 1,
    createdAt: updated.createdAt,
  })
})

router.delete('/users/:id', (req: Request, res: Response) => {
  const rawId = req.params.id
  const targetId = Number(Array.isArray(rawId) ? rawId[0] : rawId)
  if (!Number.isFinite(targetId)) {
    res.status(400).json({ error: 'Invalid user id' })
    return
  }
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' })
    return
  }

  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(targetId) as
    | { id: number; is_admin: number }
    | undefined
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (target.is_admin === 1 && adminCount() <= 1) {
    res.status(400).json({ error: 'Cannot delete the last admin' })
    return
  }

  runTransaction(() => {
    db.prepare('DELETE FROM visit_lines WHERE visit_id IN (SELECT id FROM visits WHERE user_id = ?)').run(
      targetId,
    )
    db.prepare('DELETE FROM visits WHERE user_id = ?').run(targetId)
    db.prepare('DELETE FROM ammo_types WHERE user_id = ?').run(targetId)
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId)
  })

  res.json({ ok: true })
})

export default router
