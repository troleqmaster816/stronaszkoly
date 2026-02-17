import { existsSync, readFileSync, statSync } from 'node:fs'

export function createTimetableStore({ timetableFilePath, ttlMs }) {
  let cache = {
    data: null,
    mtimeMs: 0,
    loadedAt: 0,
  }

  function invalidateTimetableCache() {
    cache = { data: null, mtimeMs: 0, loadedAt: 0 }
  }

  function readTimetableFile() {
    if (!existsSync(timetableFilePath)) return null
    try {
      const st = statSync(timetableFilePath)
      const now = Date.now()
      const cacheValid = !!cache.data
        && cache.mtimeMs === st.mtimeMs
        && (now - cache.loadedAt) < ttlMs
      if (cacheValid) return cache.data
      const txt = readFileSync(timetableFilePath, 'utf8')
      const parsed = JSON.parse(txt)
      cache = {
        data: parsed,
        mtimeMs: st.mtimeMs,
        loadedAt: now,
      }
      return parsed
    } catch {
      return null
    }
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
    setTimetableCacheHeaders,
    resolveCanonicalId,
  }
}
