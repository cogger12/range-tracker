import { Router } from 'express'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import db, { runTransaction } from '../db'

const router = Router()

interface VisitLineInput {
  ammoTypeId: string | null
  label: string
  rounds: number
  costPerRound: number
}

interface VisitRow {
  id: string
  date: string
  notes: string
}

router.get('/', (req: Request, res: Response) => {
  const visits = db
    .prepare('SELECT id, date, notes FROM visits WHERE user_id = ? ORDER BY date DESC')
    .all(req.userId!) as unknown as VisitRow[]

  const getLines = db.prepare(
    'SELECT ammo_type_id as ammoTypeId, label, rounds, cost_per_round as costPerRound FROM visit_lines WHERE visit_id = ?',
  )

  const result = visits.map((v) => ({
    ...v,
    lines: getLines.all(v.id) as unknown as VisitLineInput[],
  }))

  res.json(result)
})

router.post('/', (req: Request, res: Response) => {
  const { date, notes, lines } = req.body as {
    date: string
    notes?: string
    lines: VisitLineInput[]
  }
  if (!date || !Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: 'date and at least one line are required' })
    return
  }

  const id = randomUUID()
  const insertVisit = db.prepare('INSERT INTO visits (id, user_id, date, notes) VALUES (?, ?, ?, ?)')
  const insertLine = db.prepare(
    'INSERT INTO visit_lines (visit_id, ammo_type_id, label, rounds, cost_per_round) VALUES (?, ?, ?, ?, ?)',
  )

  runTransaction(() => {
    insertVisit.run(id, req.userId!, date, notes || '')
    for (const line of lines) {
      insertLine.run(id, line.ammoTypeId || null, line.label, line.rounds, line.costPerRound)
    }
  })

  res.json({ id, date, notes: notes || '', lines })
})

router.put('/:id', (req: Request, res: Response) => {
  const paramId = req.params.id as string
  const { date, notes, lines } = req.body as {
    date: string
    notes?: string
    lines: VisitLineInput[]
  }
  if (!date || !Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: 'date and at least one line are required' })
    return
  }

  const existing = db
    .prepare('SELECT id FROM visits WHERE id = ? AND user_id = ?')
    .get(paramId, req.userId!)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const updateVisit = db.prepare('UPDATE visits SET date = ?, notes = ? WHERE id = ?')
  const deleteLines = db.prepare('DELETE FROM visit_lines WHERE visit_id = ?')
  const insertLine = db.prepare(
    'INSERT INTO visit_lines (visit_id, ammo_type_id, label, rounds, cost_per_round) VALUES (?, ?, ?, ?, ?)',
  )

  runTransaction(() => {
    updateVisit.run(date, notes || '', paramId)
    deleteLines.run(paramId)
    for (const line of lines) {
      insertLine.run(paramId, line.ammoTypeId || null, line.label, line.rounds, line.costPerRound)
    }
  })

  res.json({ id: paramId, date, notes: notes || '', lines })
})

router.delete('/:id', (req: Request, res: Response) => {
  const paramId = req.params.id as string
  const result = db
    .prepare('DELETE FROM visits WHERE id = ? AND user_id = ?')
    .run(paramId, req.userId!)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ ok: true })
})

export default router
