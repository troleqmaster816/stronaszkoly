export function registerUserRoutes(v1, { loadDb, tokens, adminUser }) {
  v1.get('/users/me', (req, res) => {
    const cookieToken = (req.cookies && req.cookies.auth) || null
    const hasCookie = !!(cookieToken && tokens.has(cookieToken))
    let user = null
    if (hasCookie) {
      const db = loadDb()
      const userId = tokens.get(cookieToken)
      const hit = db.users.find((u) => u.id === userId)
      user = hit ? { id: hit.id, username: hit.username } : { id: 'admin', username: adminUser || 'admin' }
    }
    res.json({ ok: true, data: { authenticated: !!hasCookie, user }, authenticated: !!hasCookie, user })
  })
}
