import type { AppData } from './types'

const STORAGE_KEY = 'range-tracker-v1'

const empty: AppData = { ammoTypes: [], visits: [] }

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as AppData
    if (!parsed || !Array.isArray(parsed.ammoTypes) || !Array.isArray(parsed.visits)) {
      return empty
    }
    return parsed
  } catch {
    return empty
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
