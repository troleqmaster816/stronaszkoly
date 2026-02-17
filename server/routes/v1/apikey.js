export function registerApiKeyRoutes(v1, {
  loadDb,
  saveDb,
  requireAuth,
  requireCsrfIfCookieAuth,
  problem,
  getUserApiKeyMeta,
  getAdminApiKeyMeta,
  rotateUserApiKey,
}) {
  v1.get('/apikey', requireAuth, (req, res) => {
    const db = loadDb()
    const userId = req.userId
    if (userId === 'admin') {
      return res.json({ ok: true, data: getAdminApiKeyMeta(db) })
    }
    const user = db.users.find((u) => u.id === userId)
    if (!user) return problem(res, 404, 'users.not_found', 'Not Found', 'User not found')
    return res.json({ ok: true, data: getUserApiKeyMeta(user) })
  })

  v1.post('/apikey/regenerate', requireAuth, requireCsrfIfCookieAuth, (req, res) => {
    const db = loadDb()
    const userId = req.userId
    if (userId !== 'admin' && !db.users.find((u) => u.id === userId)) {
      return problem(res, 404, 'users.not_found', 'Not Found', 'User not found')
    }
    const rotated = rotateUserApiKey(db, userId)
    if (!rotated) return problem(res, 404, 'users.not_found', 'Not Found', 'User not found')
    saveDb(db)
    return res.json({
      ok: true,
      data: {
        apiKey: rotated.apiKey,
        preview: rotated.preview,
        createdAt: rotated.createdAt,
        format: rotated.format,
      },
    })
  })
}
