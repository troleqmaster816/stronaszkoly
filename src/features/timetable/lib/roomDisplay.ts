export function extractRoomCode(label: string): string | null {
  const raw = (label || '').trim()
  if (!raw) return null

  const withoutPrefix = raw
    .replace(/^(?:sala|s)\.?\s*/i, '')
    .replace(/^nr\.?\s*/i, '')
    .trim()

  const first = (withoutPrefix.split(/\s+/)[0] || '')
    .replace(/^[[(]+/, '')
    .replace(/[)\],;:.]+$/, '')

  if (/^\d{1,4}[a-zA-Z]?$/.test(first)) return first.toUpperCase()
  if (/^[A-Za-zĄĆĘŁŃÓŚŻŹ]{2,6}\d{1,4}$/i.test(first)) return first.toUpperCase()
  return null
}

export function formatRoomDisplay(label: string): string {
  const code = extractRoomCode(label)
  return code ? `Sala ${code}` : label
}
