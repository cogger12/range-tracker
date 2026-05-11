import { Router } from 'express'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import db from '../db'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT id, name, cost_per_round as costPerRound FROM ammo_types WHERE user_id = ?')
    .all(req.userId!)
  res.json(rows)
})

router.post('/', (req: Request, res: Response) => {
  const { name, costPerRound } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' })
    return
  }
  if (typeof costPerRound !== 'number' || costPerRound < 0) {
    res.status(400).json({ error: 'costPerRound must be a non-negative number' })
    return
  }
  const id = randomUUID()
  db.prepare('INSERT INTO ammo_types (id, user_id, name, cost_per_round) VALUES (?, ?, ?, ?)').run(
    id,
    req.userId!,
    name.trim(),
    costPerRound,
  )
  res.json({ id, name: name.trim(), costPerRound })
})

router.put('/:id', (req: Request, res: Response) => {
  const { name, costPerRound } = req.body
  const paramId = req.params.id as string
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' })
    return
  }
  if (typeof costPerRound !== 'number' || costPerRound < 0) {
    res.status(400).json({ error: 'costPerRound must be a non-negative number' })
    return
  }
  const result = db
    .prepare('UPDATE ammo_types SET name = ?, cost_per_round = ? WHERE id = ? AND user_id = ?')
    .run(name.trim(), costPerRound, paramId, req.userId!)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ id: paramId, name: name.trim(), costPerRound })
})

router.delete('/:id', (req: Request, res: Response) => {
  const paramId = req.params.id as string
  const result = db
    .prepare('DELETE FROM ammo_types WHERE id = ? AND user_id = ?')
    .run(paramId, req.userId!)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ ok: true })
})

export default router
