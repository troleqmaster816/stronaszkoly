import { existsSync, readFileSync, statSync } from 'node:fs'
import { validateTimetableData } from './timetableSchema.js'

export function createTimetableStore({ timetableFilePath, ttlMs }) {
  let cache = {
    data: null,
    mtimeMs: 0,
    loadedAt: 0,
    invalidMtimeMs: 0,
    invalidAt: 0,
  }
  let validationStatus = {
    ok: false,
    mtimeMs: 0,
    checkedAt: 0,
    error: 'No timetable loaded yet',
  }

  function invalidateTimetableCache() {
    cache = { data: null, mtimeMs: 0, loadedAt: 0, invalidMtimeMs: 0, invalidAt: 0 }
    validationStatus = {
      ok: false,
      mtimeMs: 0,
      checkedAt: Date.now(),
      error: 'Cache invalidated',
    }
  }

  function markInvalidState({ mtimeMs, error, now }) {
    cache = {
      ...cache,
      invalidMtimeMs: mtimeMs,
      invalidAt: now,
    }
    validationStatus = {
      ok: false,
      mtimeMs,
      checkedAt: now,
      error,
    }
  }

  function markValidState({ mtimeMs, now }) {
    validationStatus = {
      ok: true,
      mtimeMs,
      checkedAt: now,
      error: null,
    }
  }

  function readTimetableFile() {
    if (!existsSync(timetableFilePath)) return null
    let currentMtimeMs = 0
    try {
      const st = statSync(timetableFilePath)
      currentMtimeMs = st.mtimeMs
      const now = Date.now()
      const cacheValid = !!cache.data
        && cache.mtimeMs === st.mtimeMs
        && (now - cache.loadedAt) < ttlMs
      if (cacheValid) return cache.data

      const invalidCacheValid = cache.invalidMtimeMs === st.mtimeMs
        && (now - cache.invalidAt) < ttlMs
      if (invalidCacheValid) return cache.data

      const txt = readFileSync(timetableFilePath, 'utf8')
      const parsed = JSON.parse(txt)
      const validated = validateTimetableData(parsed)
      if (!validated.ok) {
        const firstIssue = validated.error?.issues?.[0]
        const issuePath = firstIssue?.path?.length ? firstIssue.path.join('.') : '(root)'
        const issueMsg = firstIssue?.message || 'Schema validation failed'
        const error = `${issuePath}: ${issueMsg}`
        markInvalidState({ mtimeMs: st.mtimeMs, error, now })
        console.warn(`[timetable] Invalid timetable_data.json: ${error}`)
        return cache.data
      }

      cache = {
        data: validated.data,
        mtimeMs: st.mtimeMs,
        loadedAt: now,
        invalidMtimeMs: 0,
        invalidAt: 0,
      }
      markValidState({ mtimeMs: st.mtimeMs, now })
      return cache.data
    } catch (error) {
      const now = Date.now()
      const message = error instanceof Error ? error.message : String(error)
      if (currentMtimeMs) {
        markInvalidState({
          mtimeMs: currentMtimeMs,
          error: message,
          now,
        })
      }
      console.warn(`[timetable] Failed to read timetable_data.json: ${message}`)
      return cache.data
    }
  }

  function getTimetableValidationStatus() {
    return validationStatus
  }

  function setTimetableCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  }

  function resolveCanonicalId(data, domain, inputId) {
    if (!data || !data.timetables) return { ok: false, error: 'missing' }
    const id = String(inputId || '').trim()
    if (id in (data.timetables || {})) return { ok: true, id }
    const map = domain === 'teachers' ? (data.teachers || {}) : domain === 'classes' ? (data.classes || {}) : (data.rooms || {})
    const values = Object.entries(map || {})
    if (values.length === 0) return { ok: false, error: 'missing' }
    const needle = id.toLowerCase()
    const candidates = []
    for (const [canon, label] of values) {
      const name = String(label || '').trim()
      if (name.toLowerCase() === needle) candidates.push(canon)
      if (domain === 'rooms') {
        const firstToken = name.split(/\s+/)[0]
        if (firstToken && firstToken.toLowerCase() === needle) candidates.push(canon)
        const numeric = firstToken && firstToken.replace(/^0+/, '')
        const needleNumeric = needle.replace(/^0+/, '')
        if (numeric && numeric.toLowerCase() === needleNumeric && !candidates.includes(canon)) candidates.push(canon)
      }
      if (domain === 'teachers') {
        const compact = name.replace(/\s+/g, '').toLowerCase()
        if (compact === needle) candidates.push(canon)
      }
      if (domain === 'classes') {
        const normalized = name.replace(/\s+|-/g, '').toLowerCase()
        const needleNorm = needle.replace(/\s+|-/g, '')
        if (normalized === needleNorm) candidates.push(canon)
      }
    }
    const uniq = Array.from(new Set(candidates))
    if (uniq.length === 1) return { ok: true, id: uniq[0] }
    if (uniq.length > 1) return { ok: false, error: 'ambiguous', candidates: uniq }
    return { ok: false, error: 'not_found' }
  }

  return {
    invalidateTimetableCache,
    readTimetableFile,
    getTimetableValidationStatus,
    setTimetableCacheHeaders,
    resolveCanonicalId,
  }
}
