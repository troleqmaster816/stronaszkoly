import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { idToKind } from '@/lib/schedule'
import type { DataFile, Lesson, Meta, Overrides, RefObj, RefTables } from '@/types/schedule'

type Args = {
  setHashId: (id: string) => void
  hasRouteSelection: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseStringRecord(value: unknown): Record<string, string> | null {
  if (!isObject(value)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== 'string') return null
    out[k] = v
  }
  return out
}

function parseRefTables(value: unknown): RefTables | null {
  return parseStringRecord(value)
}

function parseMeta(value: unknown): Meta {
  if (!isObject(value)) return {}
  const out: Meta = {}
  if (typeof value.source === 'string') out.source = value.source
  if (typeof value.scraped_on === 'string') out.scraped_on = value.scraped_on
  if (typeof value.generation_date_from_page === 'string') out.generation_date_from_page = value.generation_date_from_page
  return out
}

function parseRefObj(value: unknown): RefObj | undefined {
  if (value === null) return null
  if (!isObject(value)) return undefined
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined
  return { id: value.id, name: value.name }
}

function parseLessons(value: unknown): Lesson[] | null {
  if (!Array.isArray(value)) return null
  const lessons: Lesson[] = []
  for (const item of value) {
    if (!isObject(item)) return null
    if (
      typeof item.day !== 'string'
      || typeof item.lesson_num !== 'string'
      || typeof item.time !== 'string'
      || typeof item.subject !== 'string'
    ) return null

    const teacher = parseRefObj(item.teacher)
    const group = parseRefObj(item.group)
    const room = parseRefObj(item.room)
    if (teacher === undefined || group === undefined || room === undefined) return null

    lessons.push({
      day: item.day,
      lesson_num: item.lesson_num,
      time: item.time,
      subject: item.subject,
      teacher,
      group,
      room,
    })
  }
  return lessons
}

function parseTimetablePayload(value: unknown): { id: string; lessons: Lesson[] } | null {
  if (!isObject(value)) return null
  if (typeof value.id !== 'string') return null
  const lessons = parseLessons(value.lessons)
  if (!lessons) return null
  return { id: value.id, lessons }
}

function parseOverrides(value: unknown): Overrides | null {
  if (!isObject(value)) return null
  const subjectOverrides = parseStringRecord(value.subjectOverrides)
  const teacherNameOverrides = parseStringRecord(value.teacherNameOverrides)
  if (!subjectOverrides || !teacherNameOverrides) return null
  return { subjectOverrides, teacherNameOverrides }
}

async function fetchApiData<T>(url: string, parse: (value: unknown) => T | null): Promise<T> {
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!isObject(json) || json.ok !== true || !('data' in json)) throw new Error(`Invalid payload for ${url}`)
  const parsed = parse(json.data)
  if (parsed === null) throw new Error(`Invalid data for ${url}`)
  return parsed
}

export function useTimetableData({ setHashId, hasRouteSelection }: Args) {
  const [data, setData] = useState<DataFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTimetableIds, setLoadingTimetableIds] = useState<Record<string, true>>({})
  const [overrides, setOverrides] = useState<Overrides>({ subjectOverrides: {}, teacherNameOverrides: {} })

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [metadata, teachers, classes, rooms] = await Promise.all([
        fetchApiData('/v1/timetable/meta', (value) => parseMeta(value)),
        fetchApiData('/v1/teachers', parseRefTables),
        fetchApiData('/v1/classes', parseRefTables),
        fetchApiData('/v1/rooms', parseRefTables),
      ])

      setData((prev) => ({
        metadata: metadata ?? {},
        teachers,
        rooms,
        classes,
        timetables: prev?.timetables ?? {},
      }))

      if (!hasRouteSelection) {
        const saved = localStorage.getItem('timetable.lastPlanId')
        const savedKind = idToKind(saved ?? undefined)
        const hasSaved =
          !!saved &&
          (
            (savedKind === 'class' && Object.prototype.hasOwnProperty.call(classes, saved)) ||
            (savedKind === 'teacher' && Object.prototype.hasOwnProperty.call(teachers, saved)) ||
            (savedKind === 'room' && Object.prototype.hasOwnProperty.call(rooms, saved))
          )
        const fallback = Object.keys(classes ?? {})[0] ?? null
        const toUse = (hasSaved ? saved : fallback) as string | null
        if (toUse) setHashId(toUse)
      }
    } catch {
      setError('Nie udało się pobrać danych planu. Możesz wczytać plik JSON ręcznie poniżej.')
    }
  }, [hasRouteSelection, setHashId])

  const loadTimetable = useCallback(async (id: string): Promise<string | null> => {
    const kind = idToKind(id)
    if (!kind) return null
    const endpoint =
      kind === 'class'
        ? `/v1/classes/${encodeURIComponent(id)}/timetable`
        : kind === 'teacher'
          ? `/v1/teachers/${encodeURIComponent(id)}/timetable`
          : `/v1/rooms/${encodeURIComponent(id)}/timetable`

    setLoadingTimetableIds((prev) => ({ ...prev, [id]: true }))

    try {
      const payload = await fetchApiData(endpoint, parseTimetablePayload)
      const canonicalId = payload.id || id
      setData((prev) => {
        if (!prev) return prev
        const nextTimetables = {
          ...prev.timetables,
          [canonicalId]: payload.lessons,
        }
        if (canonicalId !== id) nextTimetables[id] = payload.lessons
        return { ...prev, timetables: nextTimetables }
      })
      return canonicalId
    } catch {
      setError('Nie udało się wczytać wybranego planu.')
      return null
    } finally {
      setLoadingTimetableIds((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }, [])

  const isTimetableLoading = useCallback((id: string | null) => {
    if (!id) return false
    return !!loadingTimetableIds[id]
  }, [loadingTimetableIds])

  const loadOverrides = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/overrides', { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      if (!j?.data) return
      const parsed = parseOverrides(j.data)
      if (parsed) setOverrides(parsed)
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
    loadTimetable,
    isTimetableLoading,
    overrides,
    setOverrides,
    loadData,
    loadOverrides,
  }
}
