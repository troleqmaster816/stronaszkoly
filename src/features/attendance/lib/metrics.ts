export function normalizeTimeRange(time: string) {
  return (time || '').replace(/-\s+/, '-').trim()
}

export function safeParseInt(s: string) {
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

export function needToReach50(attended: number, total: number) {
  return Math.max(0, total - 2 * attended)
}

export function canSkipAndKeep50(attended: number, total: number) {
  return Math.max(0, 2 * attended - total)
}
