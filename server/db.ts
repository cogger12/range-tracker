import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

const db = new DatabaseSync(join(dataDir, 'range-tracker.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`)

db.exec(`CREATE TABLE IF NOT EXISTS ammo_types (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  cost_per_round REAL NOT NULL
)`)

db.exec(`CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  notes TEXT DEFAULT ''
)`)

db.exec(`CREATE TABLE IF NOT EXISTS visit_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  ammo_type_id TEXT REFERENCES ammo_types(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  cost_per_round REAL NOT NULL
)`)

export function runTransaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export default db
