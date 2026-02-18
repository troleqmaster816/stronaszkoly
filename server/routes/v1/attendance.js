export function registerAttendanceRoutes(v1, {
  loadDb,
  saveDb,
  problem,
  requireAuthOrApiKey,
  requireCsrfIfCookieAuth,
  defaultAttendanceState,
  listAttendanceEntriesForUser,
  setRateHeaders,
  getPolishDayName,
}) {
  v1.get('/attendance', requireAuthOrApiKey(['read:attendance']), (req, res) => {
    const db = loadDb()
    const userId = req.userId
    const state = db.attendanceByUser[userId] || defaultAttendanceState()
    res.json({ ok: true, data: state })
  })

  v1.put('/attendance', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
    try {
      const db = loadDb()
      const userId = req.userId
      const incoming = req.body && typeof req.body === 'object' ? req.body : null
      if (!incoming || !incoming.subjects || !incoming.plans || !incoming.byDate) {
        return problem(res, 400, 'request.invalid', 'Bad Request', 'Invalid payload')
      }
      db.attendanceByUser[userId] = {
        subjects: Array.isArray(incoming.subjects) ? incoming.subjects : [],
        plans: Array.isArray(incoming.plans) ? incoming.plans : [],
        byDate: (incoming.byDate && typeof incoming.byDate === 'object') ? incoming.byDate : {},
        version: Number(incoming.version || 1),
        updatedAt: Date.now(),
      }
      saveDb(db)
      res.json({ ok: true, data: { saved: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.get('/attendance/entries', requireAuthOrApiKey(['read:attendance']), (req, res) => {
    const userId = req.userId
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)))
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null
    const { entries } = listAttendanceEntriesForUser(loadDb, userId, req.query || {})
    let startIdx = 0
    if (cursor) {
      const idx = entries.findIndex((e) => String(e.id) > cursor)
      startIdx = idx === -1 ? entries.length : idx
    }
    const page = entries.slice(startIdx, startIdx + limit)
    const next = page.length === limit ? String(page[page.length - 1].id) : null
    setRateHeaders(res)
    res.json({ ok: true, data: { entries: page, nextCursor: next } })
  })

  v1.patch('/attendance/entries', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
    try {
      const db = loadDb()
      const userId = req.userId
      const body = req.body && typeof req.body === 'object' ? req.body : null
      const updates = Array.isArray(body && body.updates) ? body.updates : null
      if (!updates) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing updates array')
      const st = db.attendanceByUser[userId] || defaultAttendanceState()
      let updated = 0
      for (const u of updates) {
        const id = String((u && u.id) || '')
        const present = !!(u && typeof u.present === 'boolean' ? u.present : false)
        const ifMatch = u && typeof u.ifMatch === 'string' ? u.ifMatch : null
        const date = id.split('#')[0]
        const list = Array.isArray(st.byDate[date]) ? st.byDate[date] : []
        const idx = list.findIndex((e) => e && String(e.id) === id)
        if (idx < 0) continue
        const entry = list[idx]
        const currentV = typeof entry._v === 'number' ? entry._v : 1
        const currentTag = `"v${currentV}"`
        if (ifMatch && ifMatch !== currentTag) {
          return problem(res, 409, 'conflict.version_mismatch', 'Version conflict', 'Entry has changed since you last fetched it')
        }
        entry.present = present
        entry._v = currentV + 1
        list[idx] = entry
        st.byDate[date] = list
        updated += 1
      }
      st.updatedAt = Date.now()
      db.attendanceByUser[userId] = st
      saveDb(db)
      res.json({ ok: true, data: { updated } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.get('/attendance/summary', requireAuthOrApiKey(['read:summary']), (req, res) => {
    const userId = req.userId
    const db = loadDb()
    const { from, to, subjectKey } = req.query || {}
    const f = typeof from === 'string' ? from : null
    const t = typeof to === 'string' ? to : null
    const subj = typeof subjectKey === 'string' && subjectKey ? subjectKey.toLowerCase() : null
    const st = db.attendanceByUser[userId] || defaultAttendanceState()
    const list = Object.entries(st.byDate || {})
      .filter(([d]) => (!f || d >= f) && (!t || d <= t))
      .flatMap(([, entries]) => entries || [])
    const filtered = subj ? list.filter((e) => String(e.subjectKey || '').toLowerCase() === subj) : list
    const total = filtered.length
    const present = filtered.filter((e) => !!e.present).length
    const pct = total ? (present / total) * 100 : 0
    const needToReach50 = Math.max(0, total - 2 * present)
    const canSkipAndKeep50 = Math.max(0, 2 * present - total)
    res.json({ ok: true, data: { total, present, percent: pct, needToReach50, canSkipAndKeep50 } })
  })

  v1.post('/attendance/days/:dateISO/present', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
    try {
      const db = loadDb()
      const userId = req.userId
      const dateISO = String(req.params.dateISO || '')
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const present = !!body.present
      const st = db.attendanceByUser[userId] || defaultAttendanceState()
      const list = Array.isArray(st.byDate[dateISO]) ? [...st.byDate[dateISO]] : []
      let updated = 0
      for (let i = 0; i < list.length; i++) {
        if (!list[i]) continue
        const currentV = typeof list[i]._v === 'number' ? list[i]._v : 1
        if (list[i].present !== present) {
          list[i].present = present
          list[i]._v = currentV + 1
          updated++
        }
      }
      st.byDate[dateISO] = list
      st.updatedAt = Date.now()
      db.attendanceByUser[userId] = st
      saveDb(db)
      res.json({ ok: true, data: { updated } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.get('/attendance/plans', requireAuthOrApiKey(['read:attendance']), (req, res) => {
    const db = loadDb()
    const userId = req.userId
    const st = db.attendanceByUser[userId] || defaultAttendanceState()
    res.json({ ok: true, data: st.plans || [] })
  })

  v1.post('/attendance/days/:dateISO/apply-plan', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
    try {
      const db = loadDb()
      const userId = req.userId
      const dateISO = String(req.params.dateISO || '')
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const planId = String(body.planId || '')
      const overwrite = !!body.overwrite
      const setPresent = typeof body.setPresent === 'boolean' ? body.setPresent : null
      if (!planId) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing planId')
      const st = db.attendanceByUser[userId] || defaultAttendanceState()
      const plan = Array.isArray(st.plans) ? st.plans.find((p) => p && p.id === planId) : null
      if (!plan) return problem(res, 404, 'plans.not_found', 'Not Found', 'Plan not found')
      const dayName = getPolishDayName(dateISO)
      const day = plan.days && plan.days[dayName]
      const items = day && Array.isArray(day.items) ? day.items : []
      if (items.length === 0) return problem(res, 400, 'plans.empty_day', 'Bad Request', 'Selected plan has no items for this day')
      const existing = Array.isArray(st.byDate[dateISO]) ? st.byDate[dateISO] : []
      if (existing.length > 0 && !overwrite) {
        return problem(res, 409, 'conflict.day_has_entries', 'Conflict', 'Day already has entries. Use overwrite=true to replace.')
      }
      const created = items.map((it, idx) => ({
        id: `${dateISO}#${dayName}#${idx + 1}`,
        date: dateISO,
        dayName,
        slot: `${dayName}#${idx + 1}`,
        subjectKey: String(it.subjectKey || '').toLowerCase(),
        subjectLabel: String(it.subjectLabel || it.subjectKey || ''),
        present: setPresent === null ? false : !!setPresent,
        _v: 1,
      }))
      st.byDate[dateISO] = created
      st.updatedAt = Date.now()
      db.attendanceByUser[userId] = st
      saveDb(db)
      res.json({ ok: true, data: { created: created.length, overwritten: existing.length > 0 } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
