import { useMemo, useState, type FormEvent } from 'react'
import type { AmmoType, RangeVisit, VisitLine } from './types'
import {
  lineCost,
  useRangeData,
  visitCost,
  visitRounds,
} from './useRangeData'
import './App.css'

type DraftLine = {
  key: string
  ammoTypeId: string
  customLabel: string
  rounds: string
  costPerRound: string
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function emptyDraftLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    ammoTypeId: '',
    customLabel: '',
    rounds: '',
    costPerRound: '',
  }
}

function visitToDrafts(visit: RangeVisit): DraftLine[] {
  return visit.lines.map((l) => ({
    key: crypto.randomUUID(),
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
  const {
    data,
    addAmmoType,
    updateAmmoType,
    removeAmmoType,
    addVisit,
    updateVisit,
    removeVisit,
  } = useRangeData()

  const [section, setSection] = useState<'visits' | 'ammo'>('visits')

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
        <h1 className="title">Range log</h1>
        <p className="tagline">
          Visits, round counts, and spend—saved in this browser.
        </p>
      </header>

      <section className="stats" aria-label="Summary">
        <div className="stat">
          <span className="stat-value">{totals.visits}</span>
          <span className="stat-label">Range days</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totals.rounds.toLocaleString()}</span>
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
      ) : (
        <AmmoSection
          ammoTypes={data.ammoTypes}
          onAdd={addAmmoType}
          onUpdate={updateAmmoType}
          onRemove={removeAmmoType}
        />
      )}
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
  onAdd: (v: Omit<RangeVisit, 'id'>) => void
  onUpdate: (id: string, v: Omit<RangeVisit, 'id'>) => void
  onRemove: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()])
  const [formError, setFormError] = useState<string | null>(null)

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
    setLines(
      v.lines.length ? visitToDrafts(v) : [emptyDraftLine()],
    )
    setFormError(null)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const built = draftsToLines(lines, ammoById)
    if (!built || built.length === 0) {
      setFormError('Add at least one line with caliber name, rounds (≥1), and cost per round.')
      return
    }
    const payload = { date: `${date}T12:00:00`, notes: notes.trim(), lines: built }
    if (editingId) onUpdate(editingId, payload)
    else onAdd(payload)
    resetForm()
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
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
        <h2 className="card-title">{editingId ? 'Edit visit' : 'Log a range day'}</h2>
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
              placeholder="Range name, drills, weather…"
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
                    onChange={(e) => updateLine(line.key, { rounds: e.target.value })}
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
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                  >
                    ×
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
          <button type="submit" className="btn primary">
            {editingId ? 'Save changes' : 'Add visit'}
          </button>
        </div>
      </form>

      <div className="card list-card">
        <h2 className="card-title">Past visits</h2>
        {visits.length === 0 ? (
          <p className="muted">No visits yet—log your first range day above.</p>
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
                    onClick={() => {
                      if (confirm('Delete this visit?')) onRemove(v.id)
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
  onAdd: (name: string, cost: number) => void
  onUpdate: (id: string, name: string, cost: number) => void
  onRemove: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCost, setEditCost] = useState('')

  function submitNew(e: FormEvent) {
    e.preventDefault()
    const c = Number.parseFloat(cost)
    if (!name.trim() || !Number.isFinite(c) || c < 0) return
    onAdd(name.trim(), c)
    setName('')
    setCost('')
  }

  function startEdit(a: AmmoType) {
    setEditingId(a.id)
    setEditName(a.name)
    setEditCost(String(a.costPerRound))
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const c = Number.parseFloat(editCost)
    if (!editName.trim() || !Number.isFinite(c) || c < 0) return
    onUpdate(editingId, editName.trim(), c)
    setEditingId(null)
  }

  return (
    <div className="panel">
      <form className="card form-card" onSubmit={submitNew}>
        <h2 className="card-title">Add ammo type</h2>
        <p className="muted small">
          Default cost per round is copied into new visit lines. You can still change it on each visit.
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
                      <span className="muted"> {money(a.costPerRound)} per round</span>
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
                        onClick={() => {
                          if (confirm(`Remove “${a.name}” from catalog?`)) onRemove(a.id)
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
