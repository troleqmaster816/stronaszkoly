export function registerJobRoutes(v1, {
  requireAuth,
  requireCsrfIfCookieAuth,
  problem,
  detectPythonCommand,
  ensurePythonDepsInstalled,
  runCommand,
  parseStructuredJobOutput,
  config,
  jobsStore,
  invalidateTimetableCache,
}) {
  let isArticleRunning = false

  v1.post('/jobs/timetable-scrape', requireAuth, requireCsrfIfCookieAuth, async (req, res) => {
    if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator')
    const running = jobsStore.findRunning('timetable')
    if (running) {
      return res.status(202).json({
        ok: true,
        data: { jobId: running.id, statusUrl: `/v1/jobs/${running.id}`, status: running.status },
        jobId: running.id,
        statusUrl: `/v1/jobs/${running.id}`,
      })
    }

    const job = jobsStore.createJob({ kind: 'timetable' })
    jobsStore.setJob(job)

    res.status(202).json({
      ok: true,
      data: { jobId: job.id, statusUrl: `/v1/jobs/${job.id}`, status: job.status },
      jobId: job.id,
      statusUrl: `/v1/jobs/${job.id}`,
    })

    ;(async () => {
      try {
        job.status = 'running'
        job.startedAt = new Date().toISOString()

        const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand()
        if (!pythonCmd) throw new Error('Brak interpretera Pythona')

        const deps = await ensurePythonDepsInstalled({
          pythonCmd,
          requirementsPath: config.requirementsPath,
          scriptsDir: config.scriptsDir,
          publicDir: config.publicDir,
          pipTimeoutMs: config.pipTimeoutMs,
        })
        if (deps && deps.error) throw new Error(deps.error)

        const script = process.platform === 'win32' && pythonCmd === 'py'
          ? ['-3', config.timetableScraperScript]
          : [config.timetableScraperScript]
        const run = await runCommand(pythonCmd, script, {
          cwd: config.scriptsDir,
          env: process.env,
          timeoutMs: config.scraperTimeoutMs,
        })
        const runResult = parseStructuredJobOutput(run.stdout)
        if (run.timedOut) throw new Error(`Scraper timeout after ${config.scraperTimeoutMs}ms`)
        if (run.code !== 0) throw new Error((runResult && (runResult.detail || runResult.error)) || run.stderr.slice(-4000))
        if (runResult && runResult.ok === false) throw new Error(runResult.detail || runResult.error || 'Scraper failed')

        invalidateTimetableCache()
        job.status = 'succeeded'
        job.finishedAt = new Date().toISOString()
        job.result = runResult
      } catch (e) {
        job.status = 'failed'
        job.finishedAt = new Date().toISOString()
        job.error = String(e)
      } finally {
        jobsStore.cleanupJobs()
      }
    })()
  })

  v1.get('/jobs/:jobId', (req, res) => {
    const jobId = String(req.params.jobId)
    const job = jobsStore.getJob(jobId)
    if (!job) return problem(res, 404, 'jobs.not_found', 'Not Found', 'Nie znaleziono')
    res.json({ ok: true, data: job })
  })

  v1.post('/jobs/articles-scrape', requireAuth, requireCsrfIfCookieAuth, async (req, res) => {
    try {
      if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator')
      if (isArticleRunning) {
        const running = jobsStore.findRunning('articles')
        if (running) {
          return res.status(202).json({
            ok: true,
            data: { jobId: running.id, statusUrl: `/v1/jobs/${running.id}`, status: running.status },
            jobId: running.id,
            statusUrl: `/v1/jobs/${running.id}`,
          })
        }
      }

      const job = jobsStore.createJob({ kind: 'articles' })
      jobsStore.setJob(job)

      res.status(202).json({
        ok: true,
        data: { jobId: job.id, statusUrl: `/v1/jobs/${job.id}`, status: job.status },
        jobId: job.id,
        statusUrl: `/v1/jobs/${job.id}`,
      })

      ;(async () => {
        isArticleRunning = true
        try {
          job.status = 'running'
          job.startedAt = new Date().toISOString()

          const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand()
          if (!pythonCmd) throw new Error('Brak interpretera Pythona')

          const deps = await ensurePythonDepsInstalled({
            pythonCmd,
            requirementsPath: config.requirementsPath,
            scriptsDir: config.scriptsDir,
            publicDir: config.publicDir,
            pipTimeoutMs: config.pipTimeoutMs,
          })
          if (deps && deps.error) throw new Error(deps.error)

          const script = process.platform === 'win32' && pythonCmd === 'py'
            ? ['-3', config.articlesScraperScript]
            : [config.articlesScraperScript]
          const run = await runCommand(pythonCmd, script, {
            cwd: config.scriptsDir,
            env: process.env,
            timeoutMs: config.scraperTimeoutMs,
          })
          const runResult = parseStructuredJobOutput(run.stdout)
          if (run.timedOut) throw new Error(`Scraper timeout after ${config.scraperTimeoutMs}ms`)
          if (run.code !== 0) throw new Error((runResult && (runResult.detail || runResult.error)) || run.stderr.slice(-4000))
          if (runResult && runResult.ok === false) throw new Error(runResult.detail || runResult.error || 'Scraper failed')

          job.status = 'succeeded'
          job.finishedAt = new Date().toISOString()
          job.result = runResult
        } catch (e) {
          job.status = 'failed'
          job.finishedAt = new Date().toISOString()
          job.error = String(e)
        } finally {
          isArticleRunning = false
          jobsStore.cleanupJobs()
        }
      })()
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
