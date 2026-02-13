import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext, type AuthContextValue, type AuthResult, type AuthUser } from './authContext'

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return String(body?.error || 'Operacja nie powiodła się')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false)
  const [me, setMe] = useState<AuthUser>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/v1/users/me', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j?.ok && j?.authenticated) {
        setIsAuth(true)
        setMe(j.user ?? null)
        return
      }
    } catch {
      // ignore and clear local state below
    }
    setIsAuth(false)
    setMe(null)
  }, [])

  useEffect(() => {
    refreshMe().finally(() => setAuthLoading(false))
  }, [refreshMe])

  const login = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    try {
      const res = await fetch('/v1/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) return { ok: false, error: await parseError(res) }
      await refreshMe()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Błąd połączenia z serwerem' }
    }
  }, [refreshMe])

  const register = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    try {
      const res = await fetch('/v1/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) return { ok: false, error: await parseError(res) }
      await refreshMe()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Błąd połączenia z serwerem' }
    }
  }, [refreshMe])

  const logout = useCallback(async () => {
    try {
      await fetch('/v1/logout', { method: 'POST', credentials: 'include' })
    } finally {
      setIsAuth(false)
      setMe(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    isAuth,
    me,
    authLoading,
    refreshMe,
    login,
    register,
    logout,
  }), [isAuth, me, authLoading, refreshMe, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
