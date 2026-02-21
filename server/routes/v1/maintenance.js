import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export function registerMaintenanceRoutes(v1, {
  requireAuth,
  requireAdmin,
  requireCsrfIfCookieAuth,
  refreshLimiter,
  problem,
  detectPythonCommand,
  ensurePythonDepsInstalled,
  runCommand,
  parseStructuredJobOutput,
  config,
  invalidateTimetableCache,
  readTimetableFile,
  getTimetableValidationStatus,
}) {
  let isRunning = false

  v1.post('/refresh', requireAuth, requireAdmin, requireCsrfIfCookieAuth, refreshLimiter, async (req, res) => {
    if (isRunning) return problem(res, 409, 'jobs.already_running', 'Conflict', 'Scraper już działa')

    const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand()
    if (!pythonCmd) {
      return problem(res, 500, 'jobs.python_missing', 'Internal Server Error', 'Nie znaleziono interpretera Pythona (python/python3/py).')
    }

    isRunning = true
    try {
      let prevRaw = null
      try {
        if (existsSync(config.timetableFilePath)) prevRaw = readFileSync(config.timetableFilePath, 'utf8')
      } catch {}

      const deps = await ensurePythonDepsInstalled({
        pythonCmd,
        requirementsPath: config.requirementsPath,
        scriptsDir: config.scriptsDir,
        pipMarkersDir: config.pipMarkersDir,
        pipTimeoutMs: config.pipTimeoutMs,
      })
      if (deps && deps.error) {
        isRunning = false
        return problem(res, 500, 'jobs.pip_failed', 'Internal Server Error', deps.error, { step: 'pip' })
      }

      const script = process.platform === 'win32' && pythonCmd === 'py'
        ? ['-3', config.timetableScraperScript]
        : [config.timetableScraperScript]
      const run = await runCommand(pythonCmd, script, {
        cwd: config.scriptsDir,
        env: process.env,
        timeoutMs: config.scraperTimeoutMs,
      })
      isRunning = false

      const runResult = parseStructuredJobOutput(run.stdout)
      if (run.timedOut) {
        return problem(res, 500, 'jobs.timeout', 'Internal Server Error', `Scraper timeout after ${config.scraperTimeoutMs}ms`, { step: 'scraper' })
      }
      if (run.code !== 0) {
        return problem(res, 500, 'jobs.scraper_failed', 'Internal Server Error', (runResult && (runResult.detail || runResult.error)) || run.stderr.slice(-4000), { step: 'scraper', output: run.stdout.slice(-4000) })
      }
      if (runResult && runResult.ok === false) {
        return problem(res, 500, 'jobs.scraper_failed', 'Internal Server Error', runResult.detail || runResult.error || 'Scraper failed', { step: 'scraper', output: run.stdout.slice(-4000) })
      }

      invalidateTimetableCache()
      readTimetableFile()
      const validationStatus = getTimetableValidationStatus ? getTimetableValidationStatus() : null
      if (validationStatus?.ok === false) {
        return problem(
          res,
          500,
          'jobs.invalid_output',
          'Internal Server Error',
          `Scraper wygenerował niepoprawny timetable_data.json: ${validationStatus.error || 'Schema validation failed'}`,
          { step: 'validation' }
        )
      }

      try {
        const nowRaw = existsSync(config.timetableFilePath) ? readFileSync(config.timetableFilePath, 'utf8') : null
        const changed = (() => {
          try {
            if (!prevRaw || !nowRaw) return true
            const a = JSON.stringify(JSON.parse(prevRaw))
            const b = JSON.stringify(JSON.parse(nowRaw))
            return a !== b
          } catch {
            return true
          }
        })()

        if (changed && prevRaw) {
          try { mkdirSync(config.timetableBackupsDir, { recursive: true }) } catch {}
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          const fname = `timetable_data-${stamp}.json`
          writeFileSync(join(config.timetableBackupsDir, fname), prevRaw, 'utf8')
          try {
            const files = readdirSync(config.timetableBackupsDir)
              .filter((f) => f.endsWith('.json'))
              .map((f) => ({ f, t: statSync(join(config.timetableBackupsDir, f)).mtimeMs }))
              .sort((a, b) => b.t - a.t)
            for (const item of files.slice(5)) {
              try { unlinkSync(join(config.timetableBackupsDir, item.f)) } catch {}
            }
          } catch {}
        }
      } catch {}

      return res.json({ ok: true, data: runResult || { status: 'ok' } })
    } catch (e) {
      isRunning = false
      return problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.get('/timetable/backups', requireAuth, requireAdmin, (req, res) => {
    try {
      if (!existsSync(config.timetableBackupsDir)) return res.json({ ok: true, data: [] })
      const list = readdirSync(config.timetableBackupsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const p = join(config.timetableBackupsDir, f)
          const st = statSync(p)
          return { filename: f, size: st.size, mtime: new Date(st.mtimeMs).toISOString() }
        })
        .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
      res.json({ ok: true, data: list })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.post('/timetable/restore', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const filename = String(body.filename || '')
      if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.json')) {
        return problem(res, 400, 'request.invalid', 'Bad Request', 'Invalid filename')
      }
      const src = join(config.timetableBackupsDir, filename)
      if (!existsSync(src)) return problem(res, 404, 'backups.not_found', 'Not Found', 'Backup not found')
      const content = readFileSync(src, 'utf8')

      try {
        if (existsSync(config.timetableFilePath)) {
          const current = readFileSync(config.timetableFilePath, 'utf8')
          if (current) {
            try { mkdirSync(config.timetableBackupsDir, { recursive: true }) } catch {}
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            writeFileSync(join(config.timetableBackupsDir, `timetable_data-${stamp}.json`), current, 'utf8')
          }
        }
      } catch {}

      writeFileSync(config.timetableFilePath, content, 'utf8')
      invalidateTimetableCache()
      readTimetableFile()
      const validationStatus = getTimetableValidationStatus ? getTimetableValidationStatus() : null
      if (validationStatus?.ok === false) {
        return problem(
          res,
          500,
          'backups.invalid',
          'Internal Server Error',
          `Przywrócony backup zawiera niepoprawny timetable_data.json: ${validationStatus.error || 'Schema validation failed'}`
        )
      }
      return res.json({ ok: true, data: { restored: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
