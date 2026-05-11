import { useCallback, useEffect, useState } from 'react'
import * as api from './api'

type User = { id: number; username: string }

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const u = await api.login(username, password)
      setUser(u)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      throw err
    }
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const u = await api.register(username, password)
      setUser(u)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setError(msg)
      throw err
    }
  }, [])

  const doLogout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  return { user, loading, error, login, register, logout: doLogout, clearError: () => setError(null) }
}
