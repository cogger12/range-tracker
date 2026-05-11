import express from 'express'
import type { Request, Response } from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import authRouter, { requireAuth } from './auth'
import ammoRouter from './routes/ammo'
import visitsRouter from './routes/visits'
import db, { runTransaction } from './db'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(express.json())
app.use(cookieParser())

app.use(authRouter)

app.use('/api/ammo', requireAuth, ammoRouter)
app.use('/api/visits', requireAuth, visitsRouter)

app.post('/api/import', requireAuth, (req: Request, res: Response) => {
  const { ammoTypes, visits } = req.body
  const userId = req.userId!

  const ammoIdMap = new Map<string, string>()
  const insertAmmo = db.prepare(
    'INSERT INTO ammo_types (id, user_id, name, cost_per_round) VALUES (?, ?, ?, ?)',
  )
  const insertVisit = db.prepare('INSERT INTO visits (id, user_id, date, notes) VALUES (?, ?, ?, ?)')
  const insertLine = db.prepare(
    'INSERT INTO visit_lines (visit_id, ammo_type_id, label, rounds, cost_per_round) VALUES (?, ?, ?, ?, ?)',
  )

  const imported = runTransaction(() => {
    let ammoCount = 0
    if (Array.isArray(ammoTypes)) {
      for (const a of ammoTypes) {
        const newId = randomUUID()
        ammoIdMap.set(a.id, newId)
        insertAmmo.run(newId, userId, a.name, a.costPerRound)
        ammoCount++
      }
    }

    let visitCount = 0
    if (Array.isArray(visits)) {
      for (const v of visits) {
        const visitId = randomUUID()
        insertVisit.run(visitId, userId, v.date, v.notes || '')
        if (Array.isArray(v.lines)) {
          for (const line of v.lines) {
            const mappedAmmoId = line.ammoTypeId ? ammoIdMap.get(line.ammoTypeId) || null : null
            insertLine.run(visitId, mappedAmmoId, line.label, line.rounds, line.costPerRound)
          }
        }
        visitCount++
      }
    }

    return { ammo: ammoCount, visits: visitCount }
  })

  res.json({ imported })
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('{*path}', (_req: Request, res: Response) => {
  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Range tracker API listening on http://localhost:${PORT}`)
})
