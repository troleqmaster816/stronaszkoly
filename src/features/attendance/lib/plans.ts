import type { Plan } from '@/features/attendance/state/attendanceReducer'

export function buildPlanNameMap(plans: Plan[]): Record<string, string> {
  const byName: Record<string, Plan[]> = {}
  for (const p of plans) {
    ;(byName[p.name] ||= []).push(p)
  }
  const map: Record<string, string> = {}
  for (const [base, list] of Object.entries(byName)) {
    if (list.length === 1) {
      map[list[0].id] = base
    } else {
      const sorted = list
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
      sorted.forEach((p, idx) => {
        map[p.id] = idx === 0 ? base : `${base} (${idx})`
      })
    }
  }
  return map
}

export function ensureUniquePlanName(existing: Plan[], desired: string): string {
  const used = new Set(existing.map((p) => p.name))
  if (!used.has(desired)) return desired
  let n = 1
  while (used.has(`${desired} (${n})`)) n++
  return `${desired} (${n})`
}

export function formatCreatedAt(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`
}
