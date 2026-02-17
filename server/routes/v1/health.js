export function registerHealthRoutes(v1) {
  v1.get('/health', (_req, res) => {
    res.json({ ok: true, data: { status: 'ok' } })
  })
}
