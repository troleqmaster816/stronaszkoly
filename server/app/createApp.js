import express from 'express'
import { basename, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import swaggerUi from 'swagger-ui-express'
import yaml from 'js-yaml'

import { problem, createCorsErrorHandler } from '../middleware/errors.js'
import {
  applyTrustProxy,
  applySecurityMiddleware,
  attachObservabilityHeaders,
  createAuthCookieOptions,
  requireCsrfIfCookieAuth as createRequireCsrfIfCookieAuth,
} from '../middleware/security.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { createIdempotencyMiddleware } from '../middleware/idempotency.js'

import { createDbStore } from '../lib/dbStore.js'
import {
  hashApiKeySecret,
  findUserIdByApiKeyToken,
  rotateUserApiKey,
  getUserApiKeyMeta,
  getAdminApiKeyMeta,
} from '../lib/authKeys.js'
import { hashPassword, verifyPassword } from '../lib/passwords.js'
import { createTimetableStore } from '../lib/timetableStore.js'
import { createJobsStore } from '../lib/jobsStore.js'
import { createSessionStore } from '../lib/sessionStore.js'
import {
  detectPythonCommand,
  runCommand,
  parseStructuredJobOutput,
  ensurePythonDepsInstalled,
} from '../lib/command.js'
import {
  defaultAttendanceState,
  listAttendanceEntriesForUser,
  setRateHeaders,
  getPolishDayName,
} from '../lib/attendance.js'
import { createV1Router } from '../routes/v1/index.js'
import { createAuthLimiters } from '../routes/v1/auth.js'

export function createApp(config) {
  const app = express()
  app.disable('x-powered-by')

  applyTrustProxy(app, config)
  applySecurityMiddleware(app, config)
  attachObservabilityHeaders(app)

  if (!config.adminLoginEnabled) {
    console.warn('[auth] Admin password login disabled: set ADMIN_USER and ADMIN_PASS to enable it.')
  }

  try {
    const specPath = join(config.publicDir, 'openapi.v1.draft.yaml')
    if (existsSync(specPath)) {
      const specText = readFileSync(specPath, 'utf8')
      const openapiDoc = yaml.load(specText)
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc))
      console.log('[server] Swagger UI at /docs')
    }
  } catch (e) {
    console.warn('[server] Failed to load OpenAPI spec for Swagger UI:', e)
  }

  const dbStore = createDbStore({ dbPath: config.dbPath, overridesPath: config.overridesPath })
  const timetableStore = createTimetableStore({ timetableFilePath: config.timetableFilePath, ttlMs: config.timetableCacheTtlMs })
  const startupTimetable = timetableStore.readTimetableFile()
  const startupValidation = timetableStore.getTimetableValidationStatus()
  if (!startupTimetable) {
    console.warn('[timetable] No valid timetable data available at startup.')
  }
  if (startupValidation?.ok === false && startupValidation?.error) {
    console.warn(`[timetable] Startup validation failed: ${startupValidation.error}`)
  }
  const jobsStore = createJobsStore({ ttlMs: config.jobsTtlMs, max: config.jobsMax })
  jobsStore.startCleanupInterval()
  const sessionStore = createSessionStore({
    ttlMs: config.sessionTtlMs,
    cleanupIntervalMs: config.sessionCleanupIntervalMs,
    max: config.sessionMax,
  })
  sessionStore.startCleanupInterval()

  const authCookieOpts = createAuthCookieOptions(config.isProd, config.authCookieMaxAgeMs)
  const requireCsrfIfCookieAuth = createRequireCsrfIfCookieAuth(problem)
  const { requireAuth, requireAuthOrApiKey, requireBearer, requireAdmin } = createAuthMiddleware({
    loadDb: dbStore.loadDb,
    saveDb: dbStore.saveDb,
    sessionStore,
    problem,
    findUserIdByApiKeyToken,
  })

  const { idempotencyMiddleware } = createIdempotencyMiddleware({
    ttlMs: config.idempotencyTtlMs,
    maxEntries: config.idempotencyMax,
  })

  const { loginLimiter, refreshLimiter, registerLimiter } = createAuthLimiters()

  try {
    dbStore.ensureOverridesFile()
  } catch (e) {
    console.warn('[server] Failed to ensure overrides file:', e)
  }

  const legacyApiCatchAll = (_req, res) => {
    return problem(res, 410, 'api.legacy_disabled', 'Gone', 'Legacy API disabled. Use /v1')
  }
  app.use('/api', legacyApiCatchAll)

  const deps = {
    config,
    sessionStore,
    authCookieOpts,
    isProd: config.isProd,
    adminUser: config.adminUser,
    adminPass: config.adminPass,
    adminLoginEnabled: config.adminLoginEnabled,

    problem,
    requireCsrfIfCookieAuth,
    requireAuth,
    requireAuthOrApiKey,
    requireBearer,
    requireAdmin,

    ...dbStore,
    ...timetableStore,

    hashPassword,
    verifyPassword,
    hashApiKeySecret,
    findUserIdByApiKeyToken,
    rotateUserApiKey,
    getUserApiKeyMeta,
    getAdminApiKeyMeta,

    detectPythonCommand,
    runCommand,
    parseStructuredJobOutput,
    ensurePythonDepsInstalled,

    defaultAttendanceState,
    listAttendanceEntriesForUser,
    setRateHeaders,
    getPolishDayName,

    jobsStore,
    idempotencyMiddleware,
    loginLimiter,
    refreshLimiter,
    registerLimiter,
    registrationEnabled: config.registrationEnabled,
  }

  const v1 = createV1Router(deps)
  app.use('/v1', v1)

  app.use(createCorsErrorHandler(problem))

  try {
    if (existsSync(config.publicDir)) {
      app.use(express.static(config.publicDir, {
        index: false,
        etag: true,
        cacheControl: true,
        setHeaders: (res, path) => {
          const file = basename(path).toLowerCase()
          if (file === 'articles.json' || file === 'overrides.json') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')
            return
          }
          if (file === 'timetable_data.json') {
            res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
            return
          }
          if (file === 'statut.json') {
            res.setHeader('Cache-Control', 'public, max-age=86400')
            return
          }
          if (/\.(png|webp|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf)$/i.test(file)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        },
      }))
    }
  } catch {}

  try {
    if (existsSync(config.distDir)) {
      app.use(express.static(config.distDir, { index: false, extensions: ['html'] }))
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/v1') || req.path.startsWith('/api') || req.path.startsWith('/docs')) return next()
        try {
          res.sendFile(join(config.distDir, 'index.html'))
        } catch {
          next()
        }
      })
    }
  } catch {}

  return app
}
