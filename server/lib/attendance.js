export function defaultAttendanceState() {
  return {
    subjects: [
      { key: 'matematyka', label: 'Matematyka' },
      { key: 'j.polski', label: 'Język polski' },
      { key: 'informatyka', label: 'Informatyka' },
    ],
    plans: [],
    byDate: {},
    version: 1,
    updatedAt: Date.now(),
  }
}

export function listAttendanceEntriesForUser(loadDb, userId, query) {
  const db = loadDb()
  const st = db.attendanceByUser[userId] || defaultAttendanceState()
  const { from, to, subjectKey, classId, teacherId } = query || {}
  const f = typeof from === 'string' ? from : null
  const t = typeof to === 'string' ? to : null
  const subj = typeof subjectKey === 'string' && subjectKey ? subjectKey.toLowerCase() : null
  const cid = typeof classId === 'string' && classId ? classId : null
  const tid = typeof teacherId === 'string' && teacherId ? teacherId : null
  const entries = Object.entries(st.byDate || {})
    .filter(([d]) => (!f || d >= f) && (!t || d <= t))
    .flatMap(([date, list]) => (Array.isArray(list) ? list.map((e) => ({ ...e, date })) : []))
  const filtered = entries.filter((e) =>
    (!subj || String(e.subjectKey || '').toLowerCase() === subj)
    && (!cid || String(e.classId || '') === cid)
    && (!tid || String(e.teacherId || '') === tid)
  )
  const sorted = filtered.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return { entries: sorted, state: st }
}

export function setRateHeaders(res, limit = 1000, remaining = 999, reset = 60) {
  res.setHeader('RateLimit-Limit', String(limit))
  res.setHeader('RateLimit-Remaining', String(remaining))
  res.setHeader('RateLimit-Reset', String(reset))
}

export function getPolishDayName(dateISO) {
  try {
    const d = new Date(dateISO + 'T00:00:00Z')
    const dn = d.getUTCDay()
    switch (dn) {
      case 1: return 'Poniedziałek'
      case 2: return 'Wtorek'
      case 3: return 'Środa'
      case 4: return 'Czwartek'
      case 5: return 'Piątek'
      case 6: return 'Sobota'
      case 0: return 'Niedziela'
      default: return 'Poniedziałek'
    }
  } catch {
    return 'Poniedziałek'
  }
}
