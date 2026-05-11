import type { AmmoType, AppData, RangeVisit } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function login(username: string, password: string) {
  return request<{ id: number; username: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function register(username: string, password: string) {
  return request<{ id: number; username: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout() {
  return request<{ ok: true }>('/api/logout', { method: 'POST' })
}

export async function getMe() {
  return request<{ id: number; username: string }>('/api/me')
}

export async function fetchAmmo(): Promise<AmmoType[]> {
  return request('/api/ammo')
}

export async function createAmmo(name: string, costPerRound: number): Promise<AmmoType> {
  return request('/api/ammo', {
    method: 'POST',
    body: JSON.stringify({ name, costPerRound }),
  })
}

export async function updateAmmo(id: string, name: string, costPerRound: number): Promise<AmmoType> {
  return request(`/api/ammo/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, costPerRound }),
  })
}

export async function deleteAmmo(id: string) {
  return request(`/api/ammo/${id}`, { method: 'DELETE' })
}

export async function fetchVisits(): Promise<RangeVisit[]> {
  return request('/api/visits')
}

export async function createVisit(visit: Omit<RangeVisit, 'id'>): Promise<RangeVisit> {
  return request('/api/visits', {
    method: 'POST',
    body: JSON.stringify(visit),
  })
}

export async function updateVisitApi(id: string, visit: Omit<RangeVisit, 'id'>): Promise<RangeVisit> {
  return request(`/api/visits/${id}`, {
    method: 'PUT',
    body: JSON.stringify(visit),
  })
}

export async function deleteVisit(id: string) {
  return request(`/api/visits/${id}`, { method: 'DELETE' })
}

export async function importData(data: AppData) {
  return request<{ imported: { ammo: number; visits: number } }>('/api/import', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
