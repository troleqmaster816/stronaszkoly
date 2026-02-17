import crypto from 'node:crypto'

export function hashApiKeySecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function safeHashEqHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  try {
    const left = Buffer.from(a, 'hex')
    const right = Buffer.from(b, 'hex')
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

export function parseStructuredApiKey(token) {
  const raw = String(token || '').trim()
  const m = raw.match(/^sk_([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{16,})$/)
  if (!m) return null
  return { keyId: m[1], secret: m[2] }
}

export function makeApiKeyPreview(token) {
  const value = String(token || '').trim()
  if (!value) return ''
  const head = value.slice(0, 6)
  const tail = value.slice(-4)
  return `${head}••••••••${tail}`
}

export function hasStructuredKeyForUser(db, keyId) {
  if (!keyId) return true
  if (db.adminApiKeyId === keyId) return true
  return db.users.some((u) => u && u.apiKeyId === keyId)
}

export function createStructuredApiKeyRecord(db) {
  let keyId = ''
  for (let i = 0; i < 12; i++) {
    const candidate = crypto.randomBytes(8).toString('base64url')
    if (!hasStructuredKeyForUser(db, candidate)) {
      keyId = candidate
      break
    }
  }
  if (!keyId) keyId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const secret = crypto.randomBytes(24).toString('base64url')
  const apiKey = `sk_${keyId}.${secret}`
  return {
    apiKey,
    keyId,
    keyHash: hashApiKeySecret(secret),
    preview: makeApiKeyPreview(apiKey),
    createdAt: Date.now(),
    format: 'structured',
  }
}

export function getUserApiKeyMeta(user) {
  if (!user) return { hasKey: false, preview: null, createdAt: null, lastUsedAt: null, format: null }
  const hasStructured = !!(user.apiKeyId && user.apiKeyHash)
  const hasLegacy = !!user.legacyApiKeyHash
  return {
    hasKey: hasStructured || hasLegacy,
    preview: user.apiKeyPreview || null,
    createdAt: user.apiKeyCreatedAt || null,
    lastUsedAt: user.apiKeyLastUsedAt || null,
    format: hasStructured ? 'structured' : hasLegacy ? 'legacy' : null,
  }
}

export function getAdminApiKeyMeta(db) {
  const hasStructured = !!(db.adminApiKeyId && db.adminApiKeyHash)
  const hasLegacy = !!db.adminLegacyApiKeyHash
  return {
    hasKey: hasStructured || hasLegacy,
    preview: db.adminApiKeyPreview || null,
    createdAt: db.adminApiKeyCreatedAt || null,
    lastUsedAt: db.adminApiKeyLastUsedAt || null,
    format: hasStructured ? 'structured' : hasLegacy ? 'legacy' : null,
  }
}

export function touchLastUsedField(obj, field) {
  const now = Date.now()
  if (!obj[field] || (now - Number(obj[field])) > 60_000) {
    obj[field] = now
    return true
  }
  return false
}

export function findUserIdByApiKeyToken(db, token) {
  const raw = String(token || '').trim()
  if (!raw) return { userId: null, changed: false }
  let changed = false

  const parsed = parseStructuredApiKey(raw)
  if (parsed) {
    const secretHash = hashApiKeySecret(parsed.secret)
    const user = db.users.find((u) => u && u.apiKeyId === parsed.keyId && typeof u.apiKeyHash === 'string')
    if (user && safeHashEqHex(user.apiKeyHash, secretHash)) {
      changed = touchLastUsedField(user, 'apiKeyLastUsedAt') || changed
      return { userId: user.id, changed }
    }
    if (db.adminApiKeyId === parsed.keyId && typeof db.adminApiKeyHash === 'string' && safeHashEqHex(db.adminApiKeyHash, secretHash)) {
      changed = touchLastUsedField(db, 'adminApiKeyLastUsedAt') || changed
      return { userId: 'admin', changed }
    }
  }

  const tokenHash = hashApiKeySecret(raw)
  const userLegacy = db.users.find((u) => u && typeof u.legacyApiKeyHash === 'string' && safeHashEqHex(u.legacyApiKeyHash, tokenHash))
  if (userLegacy) {
    changed = touchLastUsedField(userLegacy, 'apiKeyLastUsedAt') || changed
    return { userId: userLegacy.id, changed }
  }
  if (typeof db.adminLegacyApiKeyHash === 'string' && safeHashEqHex(db.adminLegacyApiKeyHash, tokenHash)) {
    changed = touchLastUsedField(db, 'adminApiKeyLastUsedAt') || changed
    return { userId: 'admin', changed }
  }
  return { userId: null, changed }
}

export function rotateUserApiKey(db, userId) {
  const record = createStructuredApiKeyRecord(db)
  if (userId === 'admin') {
    db.adminApiKeyId = record.keyId
    db.adminApiKeyHash = record.keyHash
    db.adminApiKeyPreview = record.preview
    db.adminApiKeyCreatedAt = record.createdAt
    db.adminApiKeyLastUsedAt = null
    delete db.adminLegacyApiKeyHash
  } else {
    const user = db.users.find((u) => u.id === userId)
    if (!user) return null
    user.apiKeyId = record.keyId
    user.apiKeyHash = record.keyHash
    user.apiKeyPreview = record.preview
    user.apiKeyCreatedAt = record.createdAt
    user.apiKeyLastUsedAt = null
    delete user.legacyApiKeyHash
  }
  return record
}

export function migrateDbSchema(db) {
  let changed = false
  if (!Array.isArray(db.users)) {
    db.users = []
    changed = true
  }
  if (!Array.isArray(db.apiKeys)) {
    db.apiKeys = []
    changed = true
  } else if (db.apiKeys.length > 0) {
    db.apiKeys = []
    changed = true
  }
  if (!db.attendanceByUser || typeof db.attendanceByUser !== 'object') {
    db.attendanceByUser = {}
    changed = true
  }
  if (!Array.isArray(db.approvals)) {
    db.approvals = []
    changed = true
  }

  for (const user of db.users) {
    if (!user || typeof user !== 'object') continue
    if (typeof user.apiKey === 'string' && user.apiKey.trim()) {
      const legacy = user.apiKey.trim()
      const parsed = parseStructuredApiKey(legacy)
      if (parsed) {
        user.apiKeyId = parsed.keyId
        user.apiKeyHash = hashApiKeySecret(parsed.secret)
      } else {
        user.legacyApiKeyHash = hashApiKeySecret(legacy)
      }
      user.apiKeyPreview = user.apiKeyPreview || makeApiKeyPreview(legacy)
      user.apiKeyCreatedAt = user.apiKeyCreatedAt || Date.now()
      delete user.apiKey
      changed = true
    }
    if (!user.apiKeyPreview && (user.apiKeyHash || user.legacyApiKeyHash)) {
      user.apiKeyPreview = user.apiKeyId ? `sk_${user.apiKeyId}.••••••••` : 'sk_••••••••'
      changed = true
    }
    if (!user.apiKeyCreatedAt && (user.apiKeyHash || user.legacyApiKeyHash)) {
      user.apiKeyCreatedAt = Date.now()
      changed = true
    }
  }

  if (typeof db.adminApiKey === 'string' && db.adminApiKey.trim()) {
    const legacy = db.adminApiKey.trim()
    const parsed = parseStructuredApiKey(legacy)
    if (parsed) {
      db.adminApiKeyId = parsed.keyId
      db.adminApiKeyHash = hashApiKeySecret(parsed.secret)
    } else {
      db.adminLegacyApiKeyHash = hashApiKeySecret(legacy)
    }
    db.adminApiKeyPreview = db.adminApiKeyPreview || makeApiKeyPreview(legacy)
    db.adminApiKeyCreatedAt = db.adminApiKeyCreatedAt || Date.now()
    delete db.adminApiKey
    changed = true
  }
  if (!db.adminApiKeyPreview && (db.adminApiKeyHash || db.adminLegacyApiKeyHash)) {
    db.adminApiKeyPreview = db.adminApiKeyId ? `sk_${db.adminApiKeyId}.••••••••` : 'sk_••••••••'
    changed = true
  }
  if (!db.adminApiKeyCreatedAt && (db.adminApiKeyHash || db.adminLegacyApiKeyHash)) {
    db.adminApiKeyCreatedAt = Date.now()
    changed = true
  }
  return changed
}
