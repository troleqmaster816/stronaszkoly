export function registerOverrideRoutes(v1, {
  loadOverrides,
  saveOverrides,
  requireAuth,
  requireAdmin,
  requireCsrfIfCookieAuth,
  problem,
}) {
  v1.get('/overrides', (_req, res) => {
    try {
      const data = loadOverrides()
      res.json({ ok: true, data })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.put('/overrides', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      const { subjectOverrides, teacherNameOverrides } = req.body || {}
      const data = {
        subjectOverrides: subjectOverrides && typeof subjectOverrides === 'object' ? subjectOverrides : {},
        teacherNameOverrides: teacherNameOverrides && typeof teacherNameOverrides === 'object' ? teacherNameOverrides : {},
      }
      saveOverrides(data)
      res.json({ ok: true, data: { saved: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
