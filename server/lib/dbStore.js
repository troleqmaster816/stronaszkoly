import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrateDbSchema } from './authKeys.js'

export function createDbStore({ dbPath, overridesPath }) {
  const defaultOverrides = { subjectOverrides: {}, teacherNameOverrides: {} }

  function loadDb() {
    try {
      if (existsSync(dbPath)) {
        const txt = readFileSync(dbPath, 'utf8')
        const parsed = JSON.parse(txt)
        const db = {
          users: [],
          apiKeys: [],
          attendanceByUser: {},
          approvals: [],
          ...parsed,
        }
        if (migrateDbSchema(db)) saveDb(db)
        return db
      }
    } catch {}
    const fresh = { users: [], apiKeys: [], attendanceByUser: {}, approvals: [] }
    if (migrateDbSchema(fresh)) saveDb(fresh)
    return fresh
  }

  function saveDb(db) {
    const tmp = dbPath + '.' + process.pid + '.tmp'
    writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
    renameSync(tmp, dbPath)
  }

  function ensureOverridesFile() {
    if (existsSync(overridesPath)) return
    try { mkdirSync(dirname(overridesPath), { recursive: true }) } catch {}
    saveOverrides(defaultOverrides)
  }

  function loadOverrides() {
    try {
      if (existsSync(overridesPath)) {
        const txt = readFileSync(overridesPath, 'utf8')
        const parsed = JSON.parse(txt)
        if (parsed && typeof parsed === 'object') {
          return {
            subjectOverrides: parsed.subjectOverrides && typeof parsed.subjectOverrides === 'object' ? parsed.subjectOverrides : {},
            teacherNameOverrides: parsed.teacherNameOverrides && typeof parsed.teacherNameOverrides === 'object' ? parsed.teacherNameOverrides : {},
          }
        }
      }
    } catch {
      try { saveOverrides(defaultOverrides) } catch {}
    }
    ensureOverridesFile()
    return {
      subjectOverrides: {},
      teacherNameOverrides: {},
    }
  }

  function saveOverrides(data) {
    const safe = data && typeof data === 'object' ? data : defaultOverrides
    try { mkdirSync(dirname(overridesPath), { recursive: true }) } catch {}
    const tmp = overridesPath + '.' + process.pid + '.tmp'
    writeFileSync(tmp, JSON.stringify(safe, null, 2), 'utf8')
    renameSync(tmp, overridesPath)
  }

  return { loadDb, saveDb, loadOverrides, saveOverrides, ensureOverridesFile }
}
