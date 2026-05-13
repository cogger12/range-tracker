import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AmmoType, RangeVisit, VisitLine } from './types'
import { lineCost, useRangeData, visitCost, visitRounds } from './useRangeData'
import { useAuth } from './useAuth'
import { loadData, clearData } from './storage'
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  importData,
  listAdminUsers,
  type AdminUserRow,
} from './api'
import './App.css'

type DraftLine = {
  key: string
  ammoTypeId: string
  customLabel: string
  rounds: string
  costPerRound: string
}

function randomKey(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function emptyDraftLine(): DraftLine {
  return {
    key: randomKey(),
    ammoTypeId: '',
    customLabel: '',
    rounds: '',
    costPerRound: '',
  }
}

function visitToDrafts(visit: RangeVisit): DraftLine[] {
  return visit.lines.map((l) => ({
    key: randomKey(),
    ammoTypeId: l.ammoTypeId ?? '',
    customLabel: l.ammoTypeId ? '' : l.label,
    rounds: String(l.rounds),
    costPerRound: String(l.costPerRound),
  }))
}

function draftsToLines(
  drafts: DraftLine[],
  ammoById: Map<string, AmmoType>,
): VisitLine[] | null {
  const lines: VisitLine[] = []
  for (const d of drafts) {
    const rounds = Number.parseInt(d.rounds, 10)
    const cost = Number.parseFloat(d.costPerRound)
    if (!Number.isFinite(rounds) || rounds < 1) return null
    if (!Number.isFinite(cost) || cost < 0) return null

    if (d.ammoTypeId) {
      const ammo = ammoById.get(d.ammoTypeId)
      if (!ammo) return null
      lines.push({
        ammoTypeId: d.ammoTypeId,
        label: ammo.name,
        rounds,
        costPerRound: cost,
      })
    } else {
      const label = d.customLabel.trim()
      if (!label) return null
      lines.push({
        ammoTypeId: null,
        label,
        rounds,
        costPerRound: cost,
      })
    }
  }
  return lines
}

export default function App() {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div className="app">
        <header className="header">
          <h1 className="title">Range log</h1>
        </header>
      </div>
    )
  }

  if (!auth.user) {
    return <AuthPage auth={auth} />
  }

  return <MainApp user={auth.user} onLogout={auth.logout} />
}

function AuthPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await auth.login(username, password)
    } catch {
      // error is set in the auth hook
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Range log</h1>
        <p className="tagline">
          Track your range visits, round counts, and ammo spend.
        </p>
      </header>

      <div className="card auth-card">
        <h2 className="card-title">Sign in</h2>
        <p className="muted small">Accounts are created by an administrator.</p>
        {auth.error && <p className="error">{auth.error}</p>}
        <form onSubmit={submit}>
          <div className="auth-fields">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  auth.clearError()
                }}
                required
                autoFocus
                minLength={2}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  auth.clearError()
                }}
                required
                minLength={6}
              />
            </label>
          </div>
          <div className="auth-actions">
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? '...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MainApp({
  user,
  onLogout,
}: {
  user: { id: number; username: string; isAdmin: boolean }
  onLogout: () => void
}) {
  const {
    data,
    loading,
    error: dataError,
    addAmmoType,
    updateAmmoType,
    removeAmmoType,
    addVisit,
    updateVisit,
    removeVisit,
  } = useRangeData()

  const [section, setSection] = useState<'visits' | 'ammo' | 'admin'>('visits')
  const [importPrompt, setImportPrompt] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const localData = loadData()
    if (localData.ammoTypes.length > 0 || localData.visits.length > 0) {
      setImportPrompt(true)
    }
  }, [])

  async function handleImport() {
    setImporting(true)
    try {
      const localData = loadData()
      await importData(localData)
      clearData()
      setImportPrompt(false)
      window.location.reload()
    } catch {
      alert('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  function skipImport() {
    clearData()
    setImportPrompt(false)
  }

  const ammoById = useMemo(
    () => new Map(data.ammoTypes.map((a) => [a.id, a])),
    [data.ammoTypes],
  )

  const totals = useMemo(() => {
    let rounds = 0
    let cost = 0
    for (const v of data.visits) {
      rounds += visitRounds(v)
      cost += visitCost(v)
    }
    return { rounds, cost, visits: data.visits.length }
  }, [data.visits])

  const sortedVisits = useMemo(
    () =>
      [...data.visits].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [data.visits],
  )

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1 className="title">Range log</h1>
          <div className="user-info">
            <span className="username">{user.username}</span>
            <button type="button" className="btn sm ghost" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
        <p className="tagline">
          Visits, round counts, and spend.
        </p>
      </header>

      {importPrompt && (
        <div className="card import-card">
          <p>
            <strong>Existing data found</strong> in this browser&apos;s local
            storage.
          </p>
          <p className="muted small">
            Would you like to import it into your account?
          </p>
          <div className="import-actions">
            <button
              className="btn primary sm"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Import data'}
            </button>
            <button className="btn ghost sm" onClick={skipImport}>
              Skip
            </button>
          </div>
        </div>
      )}

      {dataError ? (
        <div className="card">
          <p className="error">Error loading data: {dataError}</p>
          <button className="btn primary sm" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <p className="muted">Loading your data...</p>
      ) : (
        <>
          <section className="stats" aria-label="Summary">
            <div className="stat">
              <span className="stat-value">{totals.visits}</span>
              <span className="stat-label">Range days</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {totals.rounds.toLocaleString()}
              </span>
              <span className="stat-label">Rounds fired</span>
            </div>
            <div className="stat">
              <span className="stat-value">{money(totals.cost)}</span>
              <span className="stat-label">Total ammo cost</span>
            </div>
          </section>

          <nav className="tabs" aria-label="Sections">
            <button
              type="button"
              className={section === 'visits' ? 'tab active' : 'tab'}
              onClick={() => setSection('visits')}
            >
              Visits
            </button>
            <button
              type="button"
              className={section === 'ammo' ? 'tab active' : 'tab'}
              onClick={() => setSection('ammo')}
            >
              Ammo &amp; pricing
            </button>
            {user.isAdmin && (
              <button
                type="button"
                className={section === 'admin' ? 'tab active' : 'tab'}
                onClick={() => setSection('admin')}
              >
                Admin
              </button>
            )}
          </nav>

          {section === 'visits' ? (
            <VisitsSection
              visits={sortedVisits}
              ammoTypes={data.ammoTypes}
              ammoById={ammoById}
              onAdd={addVisit}
              onUpdate={updateVisit}
              onRemove={removeVisit}
            />
          ) : section === 'ammo' ? (
            <AmmoSection
              ammoTypes={data.ammoTypes}
              onAdd={addAmmoType}
              onUpdate={updateAmmoType}
              onRemove={removeAmmoType}
            />
          ) : (
            <AdminSection currentUserId={user.id} />
          )}
        </>
      )}
    </div>
  )
}

function AdminSection({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pwUserId, setPwUserId] = useState<number | null>(null)
  const [pwValue, setPwValue] = useState('')

  async function refresh() {
    try {
      const list = await listAdminUsers()
      setUsers(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const adminCount = users.filter((u) => u.isAdmin).length

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await adminCreateUser(newUsername.trim(), newPassword, newIsAdmin)
      setNewUsername('')
      setNewPassword('')
      setNewIsAdmin(false)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function toggleAdmin(u: AdminUserRow) {
    const next = !u.isAdmin
    if (u.isAdmin && adminCount <= 1) {
      alert('Cannot remove the last admin.')
      return
    }
    try {
      await adminUpdateUser(u.id, { isAdmin: next })
      if (u.id === currentUserId && u.isAdmin && !next) {
        window.location.reload()
        return
      }
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function savePassword() {
    if (pwUserId === null) return
    try {
      await adminUpdateUser(pwUserId, { password: pwValue })
      setPwUserId(null)
      setPwValue('')
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function handleDelete(u: AdminUserRow) {
    if (u.id === currentUserId) return
    if (u.isAdmin && adminCount <= 1) {
      alert('Cannot delete the last admin.')
      return
    }
    if (!confirm(`Delete user "${u.username}" and all their range data?`)) return
    try {
      await adminDeleteUser(u.id)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="panel">
      <div className="card form-card">
        <h2 className="card-title">Create user</h2>
        <p className="muted small">New users can sign in with the password you set here.</p>
        <form onSubmit={handleCreate}>
          <div className="field-row">
            <label className="field grow">
              <span>Username</span>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                minLength={2}
                required
              />
            </label>
            <label className="field grow">
              <span>Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
            <label className="field checkbox-field">
              <span>Admin</span>
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
              />
            </label>
            <button type="submit" className="btn primary align-end" disabled={creating}>
              {creating ? '...' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      <div className="card list-card">
        <h2 className="card-title">Users</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : users.length === 0 ? (
          <p className="muted">No users.</p>
        ) : (
          <ul className="admin-user-list">
            {users.map((u) => (
              <li key={u.id} className="admin-user-row">
                <div>
                  <strong>{u.username}</strong>
                  {u.isAdmin && <span className="pill accent admin-pill">Admin</span>}
                  {u.id === currentUserId && (
                    <span className="muted small"> (you)</span>
                  )}
                </div>
                <div className="row-actions">
                  {pwUserId === u.id ? (
                    <>
                      <input
                        className="admin-pw-input"
                        type="password"
                        placeholder="New password"
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                        minLength={6}
                      />
                      <button type="button" className="btn sm primary" onClick={savePassword}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn sm ghost"
                        onClick={() => {
                          setPwUserId(null)
                          setPwValue('')
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        setPwUserId(u.id)
                        setPwValue('')
                      }}
                    >
                      Set password
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={u.isAdmin && adminCount <= 1}
                    onClick={() => toggleAdmin(u)}
                  >
                    {u.isAdmin ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    disabled={u.id === currentUserId || (u.isAdmin && adminCount <= 1)}
                    onClick={() => handleDelete(u)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function VisitsSection({
  visits,
  ammoTypes,
  ammoById,
  onAdd,
  onUpdate,
  onRemove,
}: {
  visits: RangeVisit[]
  ammoTypes: AmmoType[]
  ammoById: Map<string, AmmoType>
  onAdd: (v: Omit<RangeVisit, 'id'>) => Promise<void>
  onUpdate: (id: string, v: Omit<RangeVisit, 'id'>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()])
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setLines([emptyDraftLine()])
    setFormError(null)
  }

  function loadVisit(v: RangeVisit) {
    setEditingId(v.id)
    setDate(v.date.slice(0, 10))
    setNotes(v.notes)
    setLines(v.lines.length ? visitToDrafts(v) : [emptyDraftLine()])
    setFormError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const built = draftsToLines(lines, ammoById)
    if (!built || built.length === 0) {
      setFormError(
        'Add at least one line with caliber name, rounds (\u22651), and cost per round.',
      )
      return
    }
    const payload = {
      date: `${date}T12:00:00`,
      notes: notes.trim(),
      lines: built,
    }
    setSaving(true)
    try {
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    )
  }

  function onPickAmmo(key: string, ammoTypeId: string) {
    const ammo = ammoById.get(ammoTypeId)
    updateLine(key, {
      ammoTypeId,
      customLabel: '',
      costPerRound: ammo ? String(ammo.costPerRound) : '',
    })
  }

  return (
    <div className="panel">
      <form className="card form-card" onSubmit={submit}>
        <h2 className="card-title">
          {editingId ? 'Edit visit' : 'Log a range day'}
        </h2>
        {formError && <p className="error">{formError}</p>}
        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="field grow">
            <span>Notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Range name, drills, weather\u2026"
            />
          </label>
        </div>

        <div className="lines-header">
          <span>Ammo used</span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setLines((l) => [...l, emptyDraftLine()])}
          >
            + Add line
          </button>
        </div>

        <ul className="line-list">
          {lines.map((line, i) => (
            <li key={line.key} className="line-item">
              <span className="line-num">{i + 1}</span>
              <div className="line-fields">
                <label className="field">
                  <span>From catalog</span>
                  <select
                    value={line.ammoTypeId}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) onPickAmmo(line.key, v)
                      else
                        updateLine(line.key, {
                          ammoTypeId: '',
                          costPerRound: line.costPerRound,
                        })
                    }}
                  >
                    <option value="">Custom (manual name &amp; cost)</option>
                    {ammoTypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {money(a.costPerRound)}/rd
                      </option>
                    ))}
                  </select>
                </label>
                {!line.ammoTypeId && (
                  <label className="field">
                    <span>Caliber / load</span>
                    <input
                      type="text"
                      value={line.customLabel}
                      onChange={(e) =>
                        updateLine(line.key, { customLabel: e.target.value })
                      }
                      placeholder="e.g. .223 rem FMJ"
                      required={!line.ammoTypeId}
                    />
                  </label>
                )}
                <label className="field narrow">
                  <span>Rounds</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={line.rounds}
                    onChange={(e) =>
                      updateLine(line.key, { rounds: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="field narrow">
                  <span>Cost / round</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.costPerRound}
                    onChange={(e) =>
                      updateLine(line.key, { costPerRound: e.target.value })
                    }
                    required
                  />
                </label>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn icon danger"
                    aria-label="Remove line"
                    onClick={() =>
                      setLines((prev) =>
                        prev.filter((l) => l.key !== line.key),
                      )
                    }
                  >
                    &times;
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="form-actions">
          {editingId && (
            <button type="button" className="btn ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
          <button type="submit" className="btn primary" disabled={saving}>
            {saving
              ? 'Saving...'
              : editingId
                ? 'Save changes'
                : 'Add visit'}
          </button>
        </div>
      </form>

      <div className="card list-card">
        <h2 className="card-title">Past visits</h2>
        {visits.length === 0 ? (
          <p className="muted">
            No visits yet—log your first range day above.
          </p>
        ) : (
          <ul className="visit-list">
            {visits.map((v) => (
              <li key={v.id} className="visit-row">
                <div className="visit-main">
                  <time dateTime={v.date}>
                    {new Date(v.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                  {v.notes && <span className="visit-notes">{v.notes}</span>}
                  <ul className="visit-lines">
                    {v.lines.map((l, idx) => (
                      <li key={idx}>
                        {l.label}: {l.rounds} rds @ {money(l.costPerRound)} →{' '}
                        <strong>{money(lineCost(l))}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="visit-meta">
                  <span className="pill">{visitRounds(v)} rds</span>
                  <span className="pill accent">{money(visitCost(v))}</span>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => loadVisit(v)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={async () => {
                      if (confirm('Delete this visit?')) {
                        try {
                          await onRemove(v.id)
                        } catch {
                          alert('Failed to delete visit.')
                        }
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AmmoSection({
  ammoTypes,
  onAdd,
  onUpdate,
  onRemove,
}: {
  ammoTypes: AmmoType[]
  onAdd: (name: string, cost: number) => Promise<void>
  onUpdate: (id: string, name: string, cost: number) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCost, setEditCost] = useState('')

  async function submitNew(e: FormEvent) {
    e.preventDefault()
    const c = Number.parseFloat(cost)
    if (!name.trim() || !Number.isFinite(c) || c < 0) return
    try {
      await onAdd(name.trim(), c)
      setName('')
      setCost('')
    } catch {
      alert('Failed to add ammo type.')
    }
  }

  function startEdit(a: AmmoType) {
    setEditingId(a.id)
    setEditName(a.name)
    setEditCost(String(a.costPerRound))
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const c = Number.parseFloat(editCost)
    if (!editName.trim() || !Number.isFinite(c) || c < 0) return
    try {
      await onUpdate(editingId, editName.trim(), c)
      setEditingId(null)
    } catch {
      alert('Failed to update ammo type.')
    }
  }

  return (
    <div className="panel">
      <form className="card form-card" onSubmit={submitNew}>
        <h2 className="card-title">Add ammo type</h2>
        <p className="muted small">
          Default cost per round is copied into new visit lines. You can still
          change it on each visit.
        </p>
        <div className="field-row">
          <label className="field grow">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="9mm 124gr FMJ"
              required
            />
          </label>
          <label className="field narrow">
            <span>Cost / round (USD)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn primary align-end">
            Add
          </button>
        </div>
      </form>

      <div className="card list-card">
        <h2 className="card-title">Your catalog</h2>
        {ammoTypes.length === 0 ? (
          <p className="muted">No entries yet—add the calibers you shoot.</p>
        ) : (
          <ul className="ammo-list">
            {ammoTypes.map((a) => (
              <li key={a.id} className="ammo-row">
                {editingId === a.id ? (
                  <form className="ammo-edit" onSubmit={saveEdit}>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editCost}
                      onChange={(e) => setEditCost(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn sm primary">
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>{a.name}</strong>
                      <span className="muted">
                        {' '}
                        {money(a.costPerRound)} per round
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn sm ghost"
                        onClick={() => startEdit(a)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn sm danger"
                        onClick={async () => {
                          if (confirm(`Remove "${a.name}" from catalog?`)) {
                            try {
                              await onRemove(a.id)
                            } catch {
                              alert('Failed to delete ammo type.')
                            }
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
