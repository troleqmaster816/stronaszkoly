import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_HUB_VISIBILITY = {
  timetable: true,
  attendance: true,
  schedule: true,
  statute: true,
}

function sanitizeHubVisibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_HUB_VISIBILITY }
  }
  return {
    timetable: typeof value.timetable === 'boolean' ? value.timetable : true,
    attendance: typeof value.attendance === 'boolean' ? value.attendance : true,
    schedule: typeof value.schedule === 'boolean' ? value.schedule : true,
    statute: typeof value.statute === 'boolean' ? value.statute : true,
  }
}

export function createHubVisibilityStore({ hubVisibilityPath, legacyOverridesPath }) {
  function loadLegacyVisibility() {
    if (!legacyOverridesPath || !existsSync(legacyOverridesPath)) return null
    try {
      const txt = readFileSync(legacyOverridesPath, 'utf8')
      const parsed = JSON.parse(txt)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return sanitizeHubVisibility(parsed.hubAppVisibility)
    } catch {
      return null
    }
  }

  function ensureFile() {
    if (existsSync(hubVisibilityPath)) return
    try { mkdirSync(dirname(hubVisibilityPath), { recursive: true }) } catch {}
    saveVisibility(loadLegacyVisibility() || DEFAULT_HUB_VISIBILITY)
  }

  function loadVisibility() {
    try {
      if (existsSync(hubVisibilityPath)) {
        const txt = readFileSync(hubVisibilityPath, 'utf8')
        return sanitizeHubVisibility(JSON.parse(txt))
      }
    } catch {
      try { saveVisibility(DEFAULT_HUB_VISIBILITY) } catch {}
    }
    ensureFile()
    return { ...DEFAULT_HUB_VISIBILITY }
  }

  function saveVisibility(value) {
    const safe = sanitizeHubVisibility(value)
    try { mkdirSync(dirname(hubVisibilityPath), { recursive: true }) } catch {}
    const tmp = hubVisibilityPath + '.' + process.pid + '.tmp'
    writeFileSync(tmp, JSON.stringify(safe, null, 2), 'utf8')
    renameSync(tmp, hubVisibilityPath)
  }

  return {
    loadHubVisibility: loadVisibility,
    saveHubVisibility: saveVisibility,
    ensureHubVisibilityFile: ensureFile,
  }
}
