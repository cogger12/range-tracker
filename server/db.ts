import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'

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
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`)

const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
if (!userColumns.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  db.exec(`
    UPDATE users SET is_admin = 1
    WHERE id = (SELECT MIN(id) FROM users)
    AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1)
  `)
}

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

function userCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
  return row.c
}

function bootstrapInitialAdmin(): void {
  if (userCount() > 0) return
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim()
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!username || !password || password.length < 6) {
    console.warn(
      '[range-tracker] No users in database. Set INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD (min 6 chars) and restart to create the first admin.',
    )
    return
  }
  const hash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(username, hash)
  console.log(`[range-tracker] Created initial admin user "${username}".`)
}

bootstrapInitialAdmin()

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
