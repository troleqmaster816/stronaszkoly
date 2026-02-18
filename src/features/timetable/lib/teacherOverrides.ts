export type TeacherOverrideEntry = { id: string | null; shortName: string; originalName: string }

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isTeacherShortName(value: string): boolean {
  return /^[A-ZĄĆĘŁŃÓŚŹŻ0-9]{1,8}$/u.test((value || '').trim())
}

function getTeacherShortFromId(id: string): string {
  const decoded = decodeMaybe((id || '').trim())
  const withoutPrefix = decoded.replace(/^n/i, '').trim()
  if (isTeacherShortName(withoutPrefix)) return withoutPrefix
  return ''
}

export function compactTeacherLabel(label: string): string {
  const trimmed = (label || '').trim()
  if (!trimmed) return trimmed
  if (trimmed.length <= 6) return trimmed
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const initials = parts.map((part) => part[0]).join('').toUpperCase()
    if (initials.length >= 2 && initials.length <= 6) return initials
  }
  return trimmed.slice(0, 6).toUpperCase()
}

export function resolveTeacherOverrideKey(args: {
  teacherId: string
  teacherLabel: string
  overrideKeys: Set<string>
}): string {
  const { teacherId, teacherLabel, overrideKeys } = args
  const label = (teacherLabel || '').trim()
  const id = (teacherId || '').trim()
  const shortFromId = getTeacherShortFromId(id)
  const candidates = [label, shortFromId, id, decodeMaybe(id)].filter(Boolean)

  for (const candidate of candidates) {
    if (overrideKeys.has(candidate)) return candidate
  }

  if (isTeacherShortName(label)) return label
  if (shortFromId) return shortFromId
  return label || id
}
