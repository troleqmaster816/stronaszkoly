export function createIdempotencyMiddleware({ ttlMs, maxEntries }) {
  const cache = new Map()

  function cleanup(now = Date.now()) {
    for (const [key, value] of cache.entries()) {
      if (!value || typeof value !== 'object') {
        cache.delete(key)
        continue
      }
      if (Number(value.expiresAt || 0) <= now) cache.delete(key)
    }
    if (cache.size <= maxEntries) return
    const entries = Array.from(cache.entries())
      .sort((a, b) => Number(a[1].createdAt || 0) - Number(b[1].createdAt || 0))
    const toDrop = entries.slice(0, Math.max(0, cache.size - maxEntries))
    for (const [key] of toDrop) cache.delete(key)
  }

  const cleanupHandle = setInterval(() => cleanup(), Math.max(60_000, Math.floor(ttlMs / 4)))
  cleanupHandle.unref?.()

  function idempotencyMiddleware(req, res, next) {
    const key = String(req.get('Idempotency-Key') || '').trim()
    if (!key) return next()
    const scopedKey = `${req.userId || 'anon'}:${key}`
    cleanup()
    const hit = cache.get(scopedKey)
    if (hit) return res.status(hit.status).set(hit.headers).send(hit.body)

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      cache.set(scopedKey, {
        status: res.statusCode,
        headers: res.getHeaders(),
        body,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      })
      cleanup()
      return originalJson(body)
    }
    next()
  }

  return {
    idempotencyMiddleware,
    cleanup,
    cache,
  }
}
