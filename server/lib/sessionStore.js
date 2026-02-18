import crypto from 'node:crypto'

export function createSessionStore({ ttlMs, cleanupIntervalMs, max }) {
  const sessions = new Map()
  let cleanupHandle = null

  function sessionAgeLimitMs() {
    return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 30 * 24 * 3600 * 1000
  }

  function maxSessions() {
    return Number.isFinite(max) && max > 0 ? max : 10000
  }

  function cleanupInterval() {
    const fallback = Math.max(60_000, Math.floor(sessionAgeLimitMs() / 4))
    return Number.isFinite(cleanupIntervalMs) && cleanupIntervalMs > 0 ? cleanupIntervalMs : fallback
  }

  function enforceMax() {
    const limit = maxSessions()
    if (sessions.size <= limit) return
    const ordered = Array.from(sessions.entries())
      .sort((a, b) => {
        const aExp = Number(a[1]?.expiresAt || 0)
        const bExp = Number(b[1]?.expiresAt || 0)
        if (aExp !== bExp) return aExp - bExp
        const aSeen = Number(a[1]?.lastSeenAt || 0)
        const bSeen = Number(b[1]?.lastSeenAt || 0)
        return aSeen - bSeen
      })
    const toDelete = Math.max(0, ordered.length - limit)
    for (let i = 0; i < toDelete; i += 1) {
      sessions.delete(ordered[i][0])
    }
  }

  function create(userId) {
    const now = Date.now()
    const token = crypto.randomBytes(32).toString('base64url')
    sessions.set(token, {
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + sessionAgeLimitMs(),
    })
    enforceMax()
    return token
  }

  function resolve(token, { touch = false } = {}) {
    if (!token) return null
    const item = sessions.get(token)
    if (!item) return null

    const now = Date.now()
    const expiresAt = Number(item.expiresAt || 0)
    if (expiresAt <= now) {
      sessions.delete(token)
      return null
    }

    if (touch) {
      item.lastSeenAt = now
      item.expiresAt = now + sessionAgeLimitMs()
      sessions.set(token, item)
    }

    return item.userId || null
  }

  function revoke(token) {
    if (!token) return false
    return sessions.delete(token)
  }

  function cleanup() {
    const now = Date.now()
    for (const [token, item] of sessions.entries()) {
      if (Number(item?.expiresAt || 0) <= now) sessions.delete(token)
    }
    enforceMax()
  }

  function startCleanupInterval() {
    if (cleanupHandle) clearInterval(cleanupHandle)
    cleanupHandle = setInterval(() => cleanup(), cleanupInterval())
    if (cleanupHandle && typeof cleanupHandle.unref === 'function') cleanupHandle.unref()
    return cleanupHandle
  }

  function stopCleanupInterval() {
    if (!cleanupHandle) return
    clearInterval(cleanupHandle)
    cleanupHandle = null
  }

  return {
    create,
    resolve,
    revoke,
    cleanup,
    startCleanupInterval,
    stopCleanupInterval,
  }
}
