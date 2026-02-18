import { useCallback, useEffect, useState } from 'react'
import {
  DataFileSchema,
  OverridesSchema,
  fetchJsonValidated,
  type DataFile,
  type Overrides,
} from '@/lib/api'
import { apiFetch } from '@/lib/apiClient'

type Args = {
  setHashId: (id: string) => void
}

export function useTimetableData({ setHashId }: Args) {
  const [data, setData] = useState<DataFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [overrides, setOverrides] = useState<Overrides>({ subjectOverrides: {}, teacherNameOverrides: {} })

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const json = await fetchJsonValidated('/timetable_data.json', DataFileSchema, { cache: 'no-cache' })
      setData(json)
      if (!window.location.hash) {
        const saved = localStorage.getItem('timetable.lastPlanId')
        const hasSaved = saved && json.timetables && Object.prototype.hasOwnProperty.call(json.timetables, saved)
        const fallback = Object.keys(json.classes ?? {})[0] ?? null
        const toUse = (hasSaved ? saved : fallback) as string | null
        if (toUse) setHashId(toUse)
      }
    } catch {
      setError('Nie udało się pobrać pliku /timetable_data.json. Możesz wczytać go ręcznie poniżej.')
    }
  }, [setHashId])

  const loadOverrides = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/overrides', { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      if (!j?.data) return
      const parsed = OverridesSchema.safeParse(j.data)
      if (parsed.success) setOverrides(parsed.data)
    } catch {
      // ignore temporary network errors
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadData(), loadOverrides()]).finally(() => setLoading(false))
  }, [loadData, loadOverrides])

  return {
    data,
    setData,
    error,
    setError,
    loading,
    overrides,
    setOverrides,
    loadData,
    loadOverrides,
  }
}
