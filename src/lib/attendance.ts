export const WEEKDAY_PL = [
  'Niedziela',
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
] as const

export function getPolishDayName(d: Date) {
  return WEEKDAY_PL[d.getDay()]
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODateLocal(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map((n) => parseInt(n, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

export function startOfWeekMonday(d: Date) {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function isWeekend(d: Date) {
  const g = d.getDay()
  return g === 0 || g === 6
}

export function normalizeSubjectKey(s: string) {
  return normalizeSubjectKeyCanonical(s)
}
import { normalizeSubjectKeyCanonical } from '@/lib/subjects'
