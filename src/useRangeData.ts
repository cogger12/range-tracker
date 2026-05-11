import { useCallback, useEffect, useState } from 'react'
import type { AppData, RangeVisit, VisitLine } from './types'
import * as api from './api'

export function useRangeData() {
  const [data, setData] = useState<AppData>({ ammoTypes: [], visits: [] })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [ammoTypes, visits] = await Promise.all([api.fetchAmmo(), api.fetchVisits()])
    setData({ ammoTypes, visits })
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const addAmmoType = useCallback(async (name: string, costPerRound: number) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const created = await api.createAmmo(trimmed, costPerRound)
    setData((d) => ({ ...d, ammoTypes: [...d.ammoTypes, created] }))
  }, [])

  const updateAmmoType = useCallback(async (id: string, name: string, costPerRound: number) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const updated = await api.updateAmmo(id, trimmed, costPerRound)
    setData((d) => ({
      ...d,
      ammoTypes: d.ammoTypes.map((a) => (a.id === id ? updated : a)),
    }))
  }, [])

  const removeAmmoType = useCallback(async (id: string) => {
    await api.deleteAmmo(id)
    setData((d) => ({ ...d, ammoTypes: d.ammoTypes.filter((a) => a.id !== id) }))
  }, [])

  const addVisit = useCallback(async (visit: Omit<RangeVisit, 'id'>) => {
    if (!visit.lines.length) return
    const created = await api.createVisit(visit)
    setData((d) => ({ ...d, visits: [...d.visits, created] }))
  }, [])

  const updateVisit = useCallback(async (id: string, visit: Omit<RangeVisit, 'id'>) => {
    if (!visit.lines.length) return
    const updated = await api.updateVisitApi(id, visit)
    setData((d) => ({
      ...d,
      visits: d.visits.map((v) => (v.id === id ? updated : v)),
    }))
  }, [])

  const removeVisit = useCallback(async (id: string) => {
    await api.deleteVisit(id)
    setData((d) => ({ ...d, visits: d.visits.filter((v) => v.id !== id) }))
  }, [])

  return {
    data,
    loading,
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
