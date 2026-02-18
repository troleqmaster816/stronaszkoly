import crypto from 'node:crypto'
import { uid } from '../../lib/ids.js'

export function registerApprovalRoutes(v1, {
  loadDb,
  saveDb,
  problem,
  requireAuth,
  requireCsrfIfCookieAuth,
  idempotencyMiddleware,
  hashApiKeySecret,
  defaultAttendanceState,
}) {
  v1.post('/approvals', requireAuth, requireCsrfIfCookieAuth, idempotencyMiddleware, (req, res) => {
    try {
      const { action, dateISO, entryId, present } = req.body || {}
      if (!action || !dateISO || !entryId) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing required fields')
      const db = loadDb()
      const userId = req.userId
      const token = 'appr_' + crypto.randomBytes(10).toString('hex')
      const tokenHash = hashApiKeySecret(token)
      const rec = {
        id: uid('apr_'),
        userId,
        tokenHash,
        payload: { action, dateISO, entryId, present: !!present },
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      }
      db.approvals.push(rec)
      saveDb(db)
      res.status(201).json({ ok: true, data: { token, url: `/v1/approvals/${token}`, expiresAt: new Date(rec.expiresAt).toISOString() } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.get('/approvals/:token', (req, res) => {
    try {
      const db = loadDb()
      const token = String(req.params.token || '')
      const tokenHash = hashApiKeySecret(token)
      const item = db.approvals.find((a) => a.tokenHash === tokenHash)
      if (!item) return problem(res, 404, 'approvals.not_found', 'Not Found', 'Nie znaleziono')
      if (Date.now() > item.expiresAt) {
        item.status = 'expired'
        saveDb(db)
        return problem(res, 410, 'approvals.expired', 'Gone', 'Token expired')
      }
      res.json({ ok: true, data: { status: item.status, createdAt: new Date(item.createdAt).toISOString(), expiresAt: new Date(item.expiresAt).toISOString() } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.post('/approvals/:token', requireCsrfIfCookieAuth, async (req, res) => {
    try {
      const db = loadDb()
      const token = String(req.params.token || '')
      const tokenHash = hashApiKeySecret(token)
      const item = db.approvals.find((a) => a.tokenHash === tokenHash)
      if (!item) return problem(res, 404, 'approvals.not_found', 'Not Found', 'Nie znaleziono')
      if (item.status !== 'pending') return problem(res, 409, 'approvals.already_decided', 'Conflict', 'Already decided')
      if (Date.now() > item.expiresAt) {
        item.status = 'expired'
        saveDb(db)
        return problem(res, 410, 'approvals.expired', 'Gone', 'Token expired')
      }
      const { decision } = req.body || {}
      if (decision !== 'accept' && decision !== 'deny') return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing or invalid decision')
      item.status = decision === 'accept' ? 'accepted' : 'denied'
      if (decision === 'accept') {
        const { action, dateISO, entryId, present } = item.payload || {}
        const st = db.attendanceByUser[item.userId] || defaultAttendanceState()
        const list = Array.isArray(st.byDate[dateISO]) ? [...st.byDate[dateISO]] : []
        const idx = list.findIndex((e) => e && e.id === entryId)
        if (idx >= 0) {
          if (action === 'toggle') list[idx].present = !list[idx].present
          else if (action === 'set') list[idx].present = !!present
          st.byDate[dateISO] = list
          st.updatedAt = Date.now()
          db.attendanceByUser[item.userId] = st
        }
      }
      saveDb(db)
      res.json({ ok: true, data: { status: item.status } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
