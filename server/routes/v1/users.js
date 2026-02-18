export function registerUserRoutes(v1, { loadDb, sessionStore, adminUser }) {
  v1.get('/users/me', (req, res) => {
    const cookieToken = (req.cookies && req.cookies.auth) || null
    const userId = sessionStore.resolve(cookieToken, { touch: true })
    const hasCookie = !!userId
    let user = null
    if (hasCookie) {
      const db = loadDb()
      const hit = db.users.find((u) => u.id === userId)
      user = hit ? { id: hit.id, username: hit.username } : { id: 'admin', username: adminUser || 'admin' }
    }
    res.json({ ok: true, data: { authenticated: !!hasCookie, user } })
  })
}
