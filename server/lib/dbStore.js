import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { migrateDbSchema } from './authKeys.js'

export function createDbStore({ dbPath, overridesPath }) {
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

  function loadOverrides() {
    try {
      if (existsSync(overridesPath)) {
        const txt = readFileSync(overridesPath, 'utf8')
        return JSON.parse(txt)
      }
    } catch {}
    return { subjectOverrides: {}, teacherNameOverrides: {} }
  }

  function saveOverrides(data) {
    const safe = data && typeof data === 'object' ? data : { subjectOverrides: {}, teacherNameOverrides: {} }
    const tmp = overridesPath + '.' + process.pid + '.tmp'
    writeFileSync(tmp, JSON.stringify(safe, null, 2), 'utf8')
    renameSync(tmp, overridesPath)
  }

  return { loadDb, saveDb, loadOverrides, saveOverrides }
}
