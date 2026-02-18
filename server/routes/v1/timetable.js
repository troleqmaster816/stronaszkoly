export function registerTimetableRoutes(v1, {
  readTimetableFile,
  setTimetableCacheHeaders,
  resolveCanonicalId,
  problem,
}) {
  v1.get('/teachers', (_req, res) => {
    const data = readTimetableFile()
    if (!data || !data.teachers) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: data.teachers })
  })

  v1.get('/classes', (_req, res) => {
    const data = readTimetableFile()
    if (!data || !data.classes) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: data.classes })
  })

  v1.get('/rooms', (_req, res) => {
    const data = readTimetableFile()
    if (!data || !data.rooms) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: data.rooms })
  })

  v1.get('/teachers/:id/timetable', (req, res) => {
    const data = readTimetableFile()
    if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    const idIn = String(req.params.id || '').trim()
    let canon = idIn
    if (!(canon in data.timetables)) {
      const resolved = resolveCanonicalId(data, 'teachers', idIn)
      if (!resolved.ok) {
        if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates })
        return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono nauczyciela')
      }
      canon = resolved.id
    }
    const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : []
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: { id: canon, lessons } })
  })

  v1.get('/classes/:id/timetable', (req, res) => {
    const data = readTimetableFile()
    if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    const idIn = String(req.params.id || '').trim()
    let canon = idIn
    if (!(canon in data.timetables)) {
      const resolved = resolveCanonicalId(data, 'classes', idIn)
      if (!resolved.ok) {
        if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates })
        return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono klasy')
      }
      canon = resolved.id
    }
    const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : []
    const groupQuery = typeof req.query.group === 'string' ? req.query.group.trim() : null
    const includeWhole = req.query.includeWhole === undefined ? true : String(req.query.includeWhole).toLowerCase() !== 'false'
    let filtered = lessons
    if (groupQuery) {
      const q = groupQuery.toLowerCase()
      const extractGroupTag = (lesson) => {
        const g = lesson && lesson.group ? lesson.group : null
        const fromRef = g && (String(g.id || g.name || '')).toLowerCase()
        if (fromRef) return fromRef
        const subj = String(lesson && lesson.subject || '').toLowerCase()
        const m = subj.match(/(?:^|[^\w])(\d+\/\d+)(?=$|[^\w])/)
        return m ? m[1] : null
      }
      filtered = lessons.filter((l) => {
        const tag = extractGroupTag(l)
        if (!tag) return includeWhole
        return tag === q
      })
    }
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: { id: canon, lessons: filtered } })
  })

  v1.get('/rooms/:id/timetable', (req, res) => {
    const data = readTimetableFile()
    if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json')
    const idIn = String(req.params.id || '').trim()
    let canon = idIn
    if (!(canon in data.timetables)) {
      const resolved = resolveCanonicalId(data, 'rooms', idIn)
      if (!resolved.ok) {
        if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates })
        return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono sali')
      }
      canon = resolved.id
    }
    const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : []
    setTimetableCacheHeaders(res)
    res.json({ ok: true, data: { id: canon, lessons } })
  })
}
