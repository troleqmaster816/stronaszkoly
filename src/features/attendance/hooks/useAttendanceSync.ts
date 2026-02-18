import { useCallback, useEffect, useRef, type Dispatch } from 'react'
import { apiFetch } from '@/lib/apiClient'
import {
  createDefaultAttendanceState,
  type Action,
  type State,
} from '@/features/attendance/state/attendanceReducer'

type Args = {
  state: State
  dispatch: Dispatch<Action>
}

export function useAttendanceSync({ state, dispatch }: Args) {
  const remoteEnabled = useRef(false)
  const putInFlight = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressInitialHydrate = useRef(false)

  const detectAuth = useCallback(async (): Promise<boolean> => {
    try {
      const me = await apiFetch('/v1/users/me').then((r) => (r.ok ? r.json() : null))
      return !!(me && me.ok && me.data && me.data.authenticated)
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const authed = await detectAuth()
      if (cancelled) return

      if (!authed) {
        remoteEnabled.current = false
        return
      }

      remoteEnabled.current = true
      try {
        const res = await apiFetch('/v1/attendance', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled && !suppressInitialHydrate.current && j && j.ok && j.data) {
          dispatch({
            type: 'LOAD_STATE',
            payload: {
              subjects: Array.isArray(j.data.subjects) ? j.data.subjects : [],
              plans: Array.isArray(j.data.plans) ? j.data.plans : [],
              byDate: (j.data.byDate && typeof j.data.byDate === 'object') ? j.data.byDate : {},
            } as State,
          })
        }
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [detectAuth, dispatch])

  const resetAllData = useCallback(async () => {
    const empty = createDefaultAttendanceState()
    suppressInitialHydrate.current = true
    if (putInFlight.current) clearTimeout(putInFlight.current)
    dispatch({ type: 'LOAD_STATE', payload: empty })

    try { localStorage.removeItem('frekwencja/v1') } catch { /* ignore */ }

    let shouldWriteRemote = remoteEnabled.current
    if (!shouldWriteRemote) {
      shouldWriteRemote = await detectAuth()
      if (shouldWriteRemote) remoteEnabled.current = true
    }
    if (!shouldWriteRemote) return

    try {
      const res = await apiFetch('/v1/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...empty, version: 1 }),
      })
      if (!res.ok) remoteEnabled.current = false
    } catch {
      remoteEnabled.current = false
    }
  }, [detectAuth, dispatch])

  useEffect(() => {
    const doPersist = async () => {
      try { localStorage.setItem('frekwencja/v1', JSON.stringify(state)) } catch { /* ignore */ }
      if (!remoteEnabled.current) return

      try {
        const res = await apiFetch('/v1/attendance', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...state, version: 1 }),
        })
        if (!res.ok) remoteEnabled.current = false
      } catch {
        remoteEnabled.current = false
      }
    }

    if (putInFlight.current) clearTimeout(putInFlight.current)
    putInFlight.current = setTimeout(doPersist, 200)
    return () => {
      if (putInFlight.current) clearTimeout(putInFlight.current)
    }
  }, [state])

  return {
    resetAllData,
  }
}
