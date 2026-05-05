import { useCallback, useEffect, useState } from 'react'
import { loadData, saveData } from './storage'
import type { AppData, RangeVisit, VisitLine } from './types'

function newId(): string {
  return crypto.randomUUID()
}

export function useRangeData() {
  const [data, setData] = useState<AppData>(() => loadData())

  useEffect(() => {
    saveData(data)
  }, [data])

  const addAmmoType = useCallback((name: string, costPerRound: number) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setData((d) => ({
      ...d,
      ammoTypes: [...d.ammoTypes, { id: newId(), name: trimmed, costPerRound }],
    }))
  }, [])

  const updateAmmoType = useCallback((id: string, name: string, costPerRound: number) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setData((d) => ({
      ...d,
      ammoTypes: d.ammoTypes.map((a) =>
        a.id === id ? { ...a, name: trimmed, costPerRound } : a,
      ),
    }))
  }, [])

  const removeAmmoType = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      ammoTypes: d.ammoTypes.filter((a) => a.id !== id),
    }))
  }, [])

  const addVisit = useCallback((visit: Omit<RangeVisit, 'id'>) => {
    if (!visit.lines.length) return
    setData((d) => ({
      ...d,
      visits: [...d.visits, { ...visit, id: newId() }],
    }))
  }, [])

  const updateVisit = useCallback((id: string, visit: Omit<RangeVisit, 'id'>) => {
    if (!visit.lines.length) return
    setData((d) => ({
      ...d,
      visits: d.visits.map((v) => (v.id === id ? { ...visit, id } : v)),
    }))
  }, [])

  const removeVisit = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      visits: d.visits.filter((v) => v.id !== id),
    }))
  }, [])

  return {
    data,
    addAmmoType,
    updateAmmoType,
    removeAmmoType,
    addVisit,
    updateVisit,
    removeVisit,
  }
}

export function lineCost(line: VisitLine): number {
  return line.rounds * line.costPerRound
}

export function visitCost(visit: RangeVisit): number {
  return visit.lines.reduce((s, l) => s + lineCost(l), 0)
}

export function visitRounds(visit: RangeVisit): number {
  return visit.lines.reduce((s, l) => s + l.rounds, 0)
}
