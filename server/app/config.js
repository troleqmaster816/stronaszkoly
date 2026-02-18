import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export function createConfig() {
  const __filename = fileURLToPath(import.meta.url)
  const appDir = dirname(__filename)
  const serverDir = dirname(appDir)
  const projectRoot = dirname(serverDir)

  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase()
  const isProd = nodeEnv === 'production'
  const registrationRaw = String(process.env.REGISTRATION_ENABLED || '').trim().toLowerCase()
  const registrationEnabled = registrationRaw
    ? !['0', 'false', 'no', 'off'].includes(registrationRaw)
    : !isProd

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const adminUser = String(process.env.ADMIN_USER || '').trim().toLowerCase()
  const adminPass = String(process.env.ADMIN_PASS || '')
  const runtimeDir = join(serverDir, 'runtime')
  const sessionTtlMs = Number(process.env.SESSION_TTL_MS || 30 * 24 * 3600 * 1000)

  return {
    nodeEnv,
    isProd,
    trustProxy: process.env.TRUST_PROXY,
    allowedOrigins,
    adminUser,
    adminPass,
    adminLoginEnabled: adminUser.length > 0 && adminPass.length > 0,
    registrationEnabled,
    port: Number(process.env.PORT) || 8787,

    projectRoot,
    serverDir,
    runtimeDir,
    publicDir: join(projectRoot, 'public'),
    pipMarkersDir: join(runtimeDir, 'pip'),
    scriptsDir: join(serverDir, 'scripts'),
    distDir: join(projectRoot, 'dist'),
    dbPath: join(serverDir, 'data.json'),
    overridesPath: join(projectRoot, 'public', 'overrides.json'),
    requirementsPath: join(serverDir, 'scripts', 'requirements.txt'),
    timetableScraperScript: join(serverDir, 'scripts', 'scraper.py'),
    articlesScraperScript: join(serverDir, 'scripts', 'article_scraper.py'),
    timetableFilePath: join(projectRoot, 'public', 'timetable_data.json'),
    timetableBackupsDir: join(runtimeDir, 'backups', 'timetables'),

    scraperTimeoutMs: Number(process.env.SCRAPER_TIMEOUT_MS || 180000),
    pipTimeoutMs: Number(process.env.PIP_TIMEOUT_MS || 300000),
    timetableCacheTtlMs: Number(process.env.TIMETABLE_CACHE_TTL_MS || 30000),
    idempotencyTtlMs: Number(process.env.IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000),
    idempotencyMax: Number(process.env.IDEMPOTENCY_MAX || 10000),
    jobsTtlMs: Number(process.env.JOBS_TTL_MS || 24 * 60 * 60 * 1000),
    jobsMax: Number(process.env.JOBS_MAX || 500),
    sessionTtlMs,
    sessionCleanupIntervalMs: Number(process.env.SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1000),
    sessionMax: Number(process.env.SESSION_MAX || 10000),
    authCookieMaxAgeMs: Number(process.env.AUTH_COOKIE_MAX_AGE_MS || sessionTtlMs),
  }
}
