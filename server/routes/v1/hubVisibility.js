export function registerHubVisibilityRoutes(v1, {
  loadHubVisibility,
  saveHubVisibility,
  requireAuth,
  requireAdmin,
  requireCsrfIfCookieAuth,
  problem,
}) {
  v1.get('/hub-visibility', (_req, res) => {
    try {
      res.json({ ok: true, data: loadHubVisibility() })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.put('/hub-visibility', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      saveHubVisibility(req.body || {})
      res.json({ ok: true, data: { saved: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
