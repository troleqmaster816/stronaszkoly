import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import crypto from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const publicDir = join(projectRoot, 'public');
const distDir = join(projectRoot, 'dist');
const timetableFilePath = join(publicDir, 'timetable_data.json');
const timetableBackupsDir = join(publicDir, 'backups', 'timetables');

const app = express();
app.disable('x-powered-by');
// Respect reverse proxy headers when deployed behind a proxy (e.g., Nginx)
// - Avoid express-rate-limit ValidationError when X-Forwarded-* is present
// - Configurable via TRUST_PROXY env (e.g., "1", "true", "loopback")
(() => {
  const envVal = (process.env.TRUST_PROXY || '').trim().toLowerCase()
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production'
  if (envVal) {
    if (envVal === 'true') app.set('trust proxy', true)
    else if (envVal === 'false') app.set('trust proxy', false)
    else if (/^\d+$/.test(envVal)) app.set('trust proxy', Number(envVal))
    else app.set('trust proxy', envVal)
  } else {
    // Default: trust a single proxy in production; keep default in dev
    if (isProd) app.set('trust proxy', 1)
  }
})()
// Security headers
// - Allow cross-origin resources (e.g., images) as requested
// - Add an explicit CSP in production to allow Tailwind CDN and zse-zdwola.pl
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // We attach CSP separately below to customize per-environment
  contentSecurityPolicy: false,
}));
if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
  const directives = {
    "default-src": ["'self'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    "script-src": ["'self'", 'https://cdn.tailwindcss.com', 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    "style-src": ["'self'", "'unsafe-inline'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    "img-src": ["'self'", 'data:', 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    "connect-src": ["'self'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    "font-src": ["'self'", 'data:', 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
    // Allow embedding Microsoft Office viewer for DOCX previews
    "frame-src": [
      "'self'",
      'https://zse-zdwola.pl',
      'https://*.zse-zdwola.pl',
      'https://view.officeapps.live.com',
      'https://*.officeapps.live.com'
    ],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    // You can enable the following if desired
    // "upgrade-insecure-requests": [],
  };
  app.use(helmet.contentSecurityPolicy({ useDefaults: true, directives }));
}
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const isDevEnv = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
function isDevOriginAllowed(origin) {
  try {
    if (!origin) return true;
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io')) return true;
  } catch {}
  return false;
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (isDevEnv && isDevOriginAllowed(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
// CSRF helpers
// NOTE: keep using IS_PROD for cookie security below
const IS_PROD = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_NAME = 'csrf';
const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: IS_PROD,
  maxAge: 7 * 24 * 3600 * 1000,
};
function ensureCsrfCookie(req, res, next) {
  try {
    const cur = req.cookies && req.cookies[CSRF_COOKIE_NAME];
    if (!cur) {
      const token = crypto.randomBytes(24).toString('base64url');
      res.cookie(CSRF_COOKIE_NAME, token, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000, secure: IS_PROD });
    }
  } catch {}
  next();
}
function requireCsrfIfCookieAuth(req, res, next) {
  // Enforce CSRF only when the request uses cookie-based auth/session
  const hasSessionCookie = !!(req.cookies && req.cookies.auth);
  if (!hasSessionCookie) return next();
  const header = req.get('x-csrf-token');
  const cookie = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  if (cookie && header && header === cookie) return next();
  return problem(res, 403, 'csrf.missing_or_invalid', 'Forbidden', 'Missing or invalid CSRF token');
}
app.use(ensureCsrfCookie);

// Serve Swagger UI for the OpenAPI draft (dev/admin purpose)
try {
  const specPath = join(publicDir, 'openapi.v1.draft.yaml');
  if (existsSync(specPath)) {
    const specText = readFileSync(specPath, 'utf8');
    const openapiDoc = yaml.load(specText);
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
    console.log('[server] Swagger UI at /docs');
  }
} catch (e) {
  console.warn('[server] Failed to load OpenAPI spec for Swagger UI:', e);
}

// Expose observability headers to browsers
app.use((req, res, next) => {
  res.setHeader('X-Request-Id', crypto.randomUUID());
  const prev = res.getHeader('Access-Control-Expose-Headers');
  const expose = ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'ETag'];
  const merged = new Set(String(prev || '').split(',').map(s => s.trim()).filter(Boolean).concat(expose));
  res.setHeader('Access-Control-Expose-Headers', Array.from(merged).join(', '));
  next();
});

let isRunning = false;
// token -> userId
const TOKENS = new Map();
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const overridesPath = join(publicDir, 'overrides.json');
const dbPath = join(__dirname, 'data.json');

function loadDb() {
  try {
    if (existsSync(dbPath)) {
      const txt = readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(txt);
      return {
        users: [],
        apiKeys: [],
        attendanceByUser: {},
        approvals: [],
        ...parsed,
      };
    }
  } catch {}
  return { users: [], apiKeys: [], attendanceByUser: {}, approvals: [], adminApiKey: null };
}
function saveDb(db) {
  const tmp = dbPath + '.' + process.pid + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  renameSync(tmp, dbPath);
}

function uid(prefix = 'id_') {
  return prefix + crypto.randomUUID();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

function hashApiKeySecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function genUserApiKey() {
  return 'sk_' + crypto.randomBytes(24).toString('base64url');
}

function loadOverrides() {
  try {
    if (existsSync(overridesPath)) {
      const txt = readFileSync(overridesPath, 'utf8');
      return JSON.parse(txt);
    }
  } catch {}
  return { subjectOverrides: {}, teacherNameOverrides: {} };
}

function saveOverrides(data) {
  const safe = data && typeof data === 'object' ? data : { subjectOverrides: {}, teacherNameOverrides: {} };
  const tmp = overridesPath + '.' + process.pid + '.tmp';
  writeFileSync(tmp, JSON.stringify(safe, null, 2), 'utf8');
  renameSync(tmp, overridesPath);
}

// Problem Details helper (RFC7807-like)
function problem(res, status, code, title, detail, extra = {}) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title, status, code, detail, ...extra });
}

function requireAuth(req, res, next) {
  const token = (req.cookies && req.cookies.auth) || null;
  if (!token || !TOKENS.has(token)) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
  const userId = TOKENS.get(token);
  req.userId = userId;
  req.authMethod = 'cookie';
  return next();
}

function checkApiKeyScopes(have = [], need = []) {
  if (!need || need.length === 0) return true;
  if (!have || have.length === 0) return false;
  const set = new Set(have);
  return need.every(s => set.has(s));
}

function requireAuthOrApiKey(scopes = []) {
  return (req, res, next) => {
    // Try API key from Authorization: Bearer <key>
    const auth = req.get('authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const token = auth.slice(7).trim();
      try {
        const db = loadDb();
        // 1) Single user-level API key (testing) – full access
        const direct = db.users.find(u => u.apiKey && u.apiKey === token);
        if (direct) { req.userId = direct.id; return next(); }
        if (db.adminApiKey && db.adminApiKey === token) { req.userId = 'admin'; return next(); }
        // 2) Legacy multi-key (hashed secret)
        const [idPart, secretPart] = token.split('.');
        if (idPart && secretPart) {
          const item = db.apiKeys.find(k => k.keyId === idPart);
          if (!item) throw new Error('Not found');
          const secHash = hashApiKeySecret(secretPart);
          if (item.keyHash !== secHash) throw new Error('Bad secret');
          if (!checkApiKeyScopes(item.scopes, scopes)) return problem(res, 403, 'auth.insufficient_scope', 'Forbidden', 'Insufficient scope');
          req.userId = item.userId;
          req.apiKeyId = item.id;
          req.authMethod = 'bearer';
          return next();
        }
        throw new Error('Malformed');
      } catch (e) {
        return problem(res, 401, 'auth.invalid_api_key', 'Unauthorized', 'Bearer token is malformed or unknown');
      }
    }
    // Fallback to cookie session
    const cookieToken = (req.cookies && req.cookies.auth) || null;
    if (!cookieToken || !TOKENS.has(cookieToken)) return problem(res, 401, 'auth.missing', 'Unauthorized', 'Missing Bearer token or session cookie');
    const userId = TOKENS.get(cookieToken);
    req.userId = userId;
    req.authMethod = 'cookie';
    return next();
  };
}

// Strict Bearer-only auth (for /v1 where we want to encourage PATs)
function requireBearer(scopes = []) {
  return (req, res, next) => {
    const auth = req.get('authorization');
    if (!(auth && auth.toLowerCase().startsWith('bearer '))) {
      return problem(res, 401, 'auth.missing', 'Unauthorized', 'Missing Bearer token');
    }
    const token = auth.slice(7).trim();
    try {
      const db = loadDb();
      // Legacy multi-key (hashed secret)
      const [idPart, secretPart] = token.split('.');
      if (idPart && secretPart) {
        const item = db.apiKeys.find(k => k.keyId === idPart);
        if (!item) throw new Error('Not found');
        const secHash = hashApiKeySecret(secretPart);
        if (item.keyHash !== secHash) throw new Error('Bad secret');
        if (!checkApiKeyScopes(item.scopes, scopes)) return problem(res, 403, 'auth.insufficient_scope', 'Forbidden', 'Insufficient scope');
        req.userId = item.userId;
        req.apiKeyId = item.id;
        req.authMethod = 'bearer';
        return next();
      }
      // Also allow single-key during migration
      const direct = db.users.find(u => u.apiKey && u.apiKey === token);
      if (direct) { req.userId = direct.id; return next(); }
      if (db.adminApiKey && db.adminApiKey === token) { req.userId = 'admin'; return next(); }
      throw new Error('Malformed');
    } catch (e) {
      return problem(res, 401, 'auth.invalid_api_key', 'Unauthorized', 'Bearer token is malformed or unknown');
    }
  };
}

function detectPythonCommand() {
  // Try 'python' first, then Windows launcher 'py'
  const tryCmd = (cmd) => {
    const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return res && res.status === 0;
  };
  if (tryCmd('python')) return 'python';
  if (tryCmd('python3')) return 'python3';
  if (process.platform === 'win32' && tryCmd('py')) return 'py';
  return null;
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...options });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => (stdout += d.toString()));
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// Python deps caching – skip pip install if requirements.txt unchanged
function getRequirementsHash() {
  try {
    const reqPath = join(publicDir, 'requirements.txt');
    if (!existsSync(reqPath)) return null;
    const content = readFileSync(reqPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch { return null; }
}
async function ensurePythonDepsInstalled(pythonCmd) {
  const hash = getRequirementsHash();
  const markerName = hash ? `.pip_installed_${hash}.txt` : `.pip_installed.txt`;
  const markerPath = join(publicDir, markerName);
  if (existsSync(markerPath)) return { skipped: true };
  const pipArgs = ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', 'requirements.txt'];
  const pip = await runCommand(pythonCmd, pipArgs, { cwd: publicDir, env: process.env });
  if (pip.code !== 0) return { error: pip.stderr.slice(-4000) };
  try { writeFileSync(markerPath, String(Date.now()), 'utf8'); } catch {}
  return { skipped: false };
}

// Legacy /api health – removed; use /v1/health

// Legacy /api/me removed; use /v1/users/me

// Legacy /api/register removed; use /v1/register

// Legacy /api/login removed; use /v1/login

// Legacy /api/logout removed; use /v1/logout

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Legacy limiters no longer needed under /api

// Disable legacy /api routes – v1 only
// Note: keep this catch-all AFTER active /api routes (me/login/logout/refresh/apikey, etc.)
const legacyApiCatchAll = (_req, res) => {
  res.status(410).json({ ok: false, error: 'Legacy API disabled. Use /v1' });
};

// Legacy /api/refresh removed; use /v1/refresh

// Legacy /api/overrides removed; use /v1/overrides

// ------------------ Single API key (testing) ------------------
// Legacy /api/apikey endpoints removed; use /v1/apikey

// ------------------ Timetable API (public + auth) ------------------
// Legacy /api/timetable removed; use /v1/* timetable endpoints

// ------------------ Attendance (per-user) ------------------
function defaultAttendanceState() {
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
  };
}

// Legacy /api/attendance removed; use /v1/attendance

// Summary: present/total/percent + to50/canSkip50
app.get('/api/attendance/summary', requireAuthOrApiKey(['read:summary']), (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const { from, to, subject } = req.query || {};
  const f = typeof from === 'string' ? from : null;
  const t = typeof to === 'string' ? to : null;
  const subj = typeof subject === 'string' && subject ? subject.toLowerCase() : null;
  const st = db.attendanceByUser[userId] || defaultAttendanceState();
  const list = Object.entries(st.byDate || {})
    .filter(([d]) => (!f || d >= f) && (!t || d <= t))
    .flatMap(([, entries]) => entries || []);
  const filtered = subj ? list.filter(e => String(e.subjectKey || '').toLowerCase() === subj) : list;
  const total = filtered.length;
  const present = filtered.filter(e => !!e.present).length;
  const pct = total ? (present / total) * 100 : 0;
  const needToReach50 = Math.max(0, total - 2 * present);
  const canSkipAndKeep50 = Math.max(0, 2 * present - total);
  res.json({ ok: true, data: { total, present, percent: pct, needToReach50, canSkipAndKeep50 } });
});

// ------------------ API Keys ------------------
app.get('/api/apikeys', requireAuth, (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const keys = db.apiKeys.filter(k => k.userId === userId).map(k => ({ id: k.id, name: k.name, scopes: k.scopes, createdAt: k.createdAt }));
  res.json({ ok: true, data: keys });
});

app.post('/api/apikeys', requireAuth, (req, res) => {
  try {
    const { name, scopes } = req.body || {};
    const nm = String(name || '').trim() || 'Klucz';
    const sc = Array.isArray(scopes) ? scopes.map(String) : ['read:attendance'];
    const db = loadDb();
    const userId = req.userId;
    const id = uid('key_');
    const keyId = 'ak_' + crypto.randomBytes(6).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const fullKey = `${keyId}.${secret}`;
    const keyHash = hashApiKeySecret(secret);
    db.apiKeys.push({ id, userId, name: nm, scopes: sc, createdAt: Date.now(), keyId, keyHash });
    saveDb(db);
    res.json({ ok: true, apiKey: fullKey, item: { id, name: nm, scopes: sc, createdAt: Date.now() } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.delete('/api/apikeys/:id', requireAuth, (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const id = String(req.params.id);
  const before = db.apiKeys.length;
  db.apiKeys = db.apiKeys.filter(k => !(k.id === id && k.userId === userId));
  saveDb(db);
  return res.json({ ok: true, removed: before - db.apiKeys.length });
});

// ------------------ Remote Approvals ------------------
// Legacy approval endpoints removed; use /v1/approvals*

// Place legacy /api catch-all AFTER all active /api routes above
app.use('/api', legacyApiCatchAll);

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

// ------------------ V1 API ------------------
const v1 = express.Router();

// Minimal health
v1.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Helper to detect current user (cookie or bearer)
function getCurrentUser() {
  const db = loadDb();
  return db;
}

v1.get('/users/me', (req, res) => {
  const cookieToken = (req.cookies && req.cookies.auth) || null;
  const hasCookie = !!(cookieToken && TOKENS.has(cookieToken));
  let user = null;
  if (hasCookie) {
    const db = loadDb();
    const userId = TOKENS.get(cookieToken);
    const hit = db.users.find(u => u.id === userId);
    user = hit ? { id: hit.id, username: hit.username } : { id: 'admin', username: ADMIN_USER };
  }
  res.json({ ok: true, authenticated: !!hasCookie, user });
});

// Auth (cookie-based) under v1
v1.post('/login', loginLimiter, (req, res) => {
  const { username, password } = (req.body && typeof req.body === 'object' ? req.body : {}) || {};
  const userIn = String(username ?? '').trim().toLowerCase();
  const passIn = String(password ?? '');
  const db = loadDb();
  const user = db.users.find(u => u.username === userIn);
  if (user && verifyPassword(passIn, user.passSalt, user.passHash)) {
    const token = crypto.randomBytes(32).toString('base64url');
    TOKENS.set(token, user.id);
    res.cookie('auth', token, AUTH_COOKIE_OPTS);
    return res.json({ ok: true });
  }
  if (userIn === ADMIN_USER && passIn === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('base64url');
    TOKENS.set(token, 'admin');
    res.cookie('auth', token, AUTH_COOKIE_OPTS);
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Nieprawidłowe dane logowania' });
});

v1.post('/logout', (_req, res) => {
  const token = (_req.cookies && _req.cookies.auth) || null;
  if (token && TOKENS.has(token)) TOKENS.delete(token);
  res.clearCookie('auth', { path: '/', sameSite: 'lax', secure: IS_PROD });
  res.json({ ok: true });
});

v1.post('/register', (req, res) => {
  try {
    const { username, password } = (req.body && typeof req.body === 'object') ? req.body : {};
    const u = String(username || '').trim().toLowerCase();
    const p = String(password || '');
    if (!u || !p || p.length < 6) return res.status(400).json({ ok: false, error: 'Nieprawidłowe dane (min. 6 znaków hasła)' });
    const db = loadDb();
    if (db.users.some(x => x.username === u)) return res.status(409).json({ ok: false, error: 'Użytkownik istnieje' });
    const { salt, hash } = hashPassword(p);
    const user = { id: uid('u_'), username: u, passSalt: salt, passHash: hash, createdAt: Date.now(), apiKey: genUserApiKey() };
    db.users.push(user);
    saveDb(db);
    const session = crypto.randomBytes(32).toString('base64url');
    TOKENS.set(session, user.id);
    res.cookie('auth', session, AUTH_COOKIE_OPTS);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Single API key (testing) under v1
v1.get('/apikey', requireAuth, (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  if (userId === 'admin') {
    if (!db.adminApiKey) { db.adminApiKey = genUserApiKey(); saveDb(db); }
    return res.json({ ok: true, apiKey: db.adminApiKey });
  }
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  if (!user.apiKey) { user.apiKey = genUserApiKey(); saveDb(db); }
  return res.json({ ok: true, apiKey: user.apiKey });
});

v1.post('/apikey/regenerate', requireAuth, (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const key = genUserApiKey();
  if (userId === 'admin') {
    db.adminApiKey = key;
    saveDb(db);
    return res.json({ ok: true, apiKey: db.adminApiKey });
  }
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  user.apiKey = key;
  saveDb(db);
  return res.json({ ok: true, apiKey: user.apiKey });
});

// Attendance (state-level) under v1
v1.get('/attendance', requireAuthOrApiKey(['read:attendance']), (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const state = db.attendanceByUser[userId] || defaultAttendanceState();
  res.json({ ok: true, data: state });
});

v1.put('/attendance', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
  try {
    const db = loadDb();
    const userId = req.userId;
    const incoming = req.body && typeof req.body === 'object' ? req.body : null;
    if (!incoming || !incoming.subjects || !incoming.plans || !incoming.byDate) {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }
    db.attendanceByUser[userId] = {
      subjects: Array.isArray(incoming.subjects) ? incoming.subjects : [],
      plans: Array.isArray(incoming.plans) ? incoming.plans : [],
      byDate: (incoming.byDate && typeof incoming.byDate === 'object') ? incoming.byDate : {},
      version: Number(incoming.version || 1),
      updatedAt: Date.now(),
    };
    saveDb(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Timetable refresh under v1 (synchronous, like legacy)
v1.post('/refresh', requireAuth, requireCsrfIfCookieAuth, refreshLimiter, async (req, res) => {
  if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
  if (isRunning) {
    return res.status(409).json({ ok: false, error: 'Scraper już działa' });
  }
  const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand();
  if (!pythonCmd) {
    return res.status(500).json({ ok: false, error: 'Nie znaleziono interpretera Pythona (python/python3/py).' });
  }

  isRunning = true;
  try {
    // Read current timetable (raw) for comparison
    let prevRaw = null;
    try { if (existsSync(timetableFilePath)) prevRaw = readFileSync(timetableFilePath, 'utf8'); } catch {}
    // Ensure Python deps installed (cached)
    const deps = await ensurePythonDepsInstalled(pythonCmd);
    if (deps && deps.error) {
      isRunning = false;
      return res.status(500).json({ ok: false, step: 'pip', error: deps.error });
    }

    // Run scraper
    const script = process.platform === 'win32' && pythonCmd === 'py' ? ['-3', 'scraper.py'] : ['scraper.py'];
    const run = await runCommand(pythonCmd, script, { cwd: publicDir, env: process.env });
    isRunning = false;
    if (run.code !== 0) {
      return res.status(500).json({ ok: false, step: 'scraper', error: run.stderr.slice(-4000), output: run.stdout.slice(-4000) });
    }
    // After successful run: compare and rotate backups (keep latest 5)
    try {
      const nowRaw = existsSync(timetableFilePath) ? readFileSync(timetableFilePath, 'utf8') : null;
      const changed = (() => {
        try {
          if (!prevRaw || !nowRaw) return true;
          const a = JSON.stringify(JSON.parse(prevRaw));
          const b = JSON.stringify(JSON.parse(nowRaw));
          return a !== b;
        } catch { return true; }
      })();
      if (changed && prevRaw) {
        try { mkdirSync(timetableBackupsDir, { recursive: true }); } catch {}
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fname = `timetable_data-${stamp}.json`;
        writeFileSync(join(timetableBackupsDir, fname), prevRaw, 'utf8');
        // Enforce max 5 backups
        try {
          const files = readdirSync(timetableBackupsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({ f, t: statSync(join(timetableBackupsDir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
          for (const item of files.slice(5)) {
            try { unlinkSync(join(timetableBackupsDir, item.f)); } catch {}
          }
        } catch {}
      }
    } catch {}
    return res.json({ ok: true });
  } catch (e) {
    isRunning = false;
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Timetable helpers
function readTimetableFile() {
  const file = timetableFilePath;
  if (!existsSync(file)) return null;
  try {
    const txt = readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function setTimetableCacheHeaders(res) {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
}

v1.get('/teachers', (_req, res) => {
  const data = readTimetableFile();
  if (!data || !data.teachers) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  setTimetableCacheHeaders(res);
  res.json(data.teachers);
});

// New: list classes
v1.get('/classes', (_req, res) => {
  const data = readTimetableFile();
  if (!data || !data.classes) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  setTimetableCacheHeaders(res);
  res.json(data.classes);
});

// New: list rooms
v1.get('/rooms', (_req, res) => {
  const data = readTimetableFile();
  if (!data || !data.rooms) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  setTimetableCacheHeaders(res);
  res.json(data.rooms);
});

// Helper: resolve human-friendly alias (e.g., "4TAI", "RM", "407") to canonical timetable id (o*/n*/s*)
function resolveCanonicalId(data, domain, inputId) {
  if (!data || !data.timetables) return { ok: false, error: 'missing' };
  const id = String(inputId || '').trim();
  if (id in (data.timetables || {})) return { ok: true, id };
  const map = domain === 'teachers' ? (data.teachers || {}) : domain === 'classes' ? (data.classes || {}) : (data.rooms || {});
  const values = Object.entries(map || {});
  if (values.length === 0) return { ok: false, error: 'missing' };
  const needle = id.toLowerCase();
  const candidates = [];
  for (const [canon, label] of values) {
    const name = String(label || '').trim();
    // 1) Exact match on label (case-insensitive)
    if (name.toLowerCase() === needle) candidates.push(canon);
    // 2) For rooms: match first token/number from label (e.g., "316 Pracownia..." => "316")
    if (domain === 'rooms') {
      const firstToken = name.split(/\s+/)[0];
      if (firstToken && firstToken.toLowerCase() === needle) candidates.push(canon);
      // Also allow numeric-only match when token has leading zeros
      const numeric = firstToken && firstToken.replace(/^0+/, '');
      const needleNumeric = needle.replace(/^0+/, '');
      if (numeric && numeric && numeric.toLowerCase() === needleNumeric && !candidates.includes(canon)) candidates.push(canon);
    }
    // 3) For teachers: allow matching simple initials/codes like "RM"
    if (domain === 'teachers') {
      const compact = name.replace(/\s+/g, '').toLowerCase();
      if (compact === needle) candidates.push(canon);
    }
    // 4) For classes: allow hyphen/space-insensitive
    if (domain === 'classes') {
      const normalized = name.replace(/\s+|-/g, '').toLowerCase();
      const needleNorm = needle.replace(/\s+|-/g, '');
      if (normalized === needleNorm) candidates.push(canon);
    }
  }
  const uniq = Array.from(new Set(candidates));
  if (uniq.length === 1) return { ok: true, id: uniq[0] };
  if (uniq.length > 1) return { ok: false, error: 'ambiguous', candidates: uniq };
  return { ok: false, error: 'not_found' };
}

v1.get('/teachers/:id/timetable', (req, res) => {
  const data = readTimetableFile();
  if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  const idIn = String(req.params.id || '').trim();
  let canon = idIn;
  if (!(canon in data.timetables)) {
    const resolved = resolveCanonicalId(data, 'teachers', idIn);
    if (!resolved.ok) {
      if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates });
      return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono nauczyciela');
    }
    canon = resolved.id;
  }
  const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : [];
  setTimetableCacheHeaders(res);
  res.json({ data: lessons, id: canon });
});

v1.get('/classes/:id/timetable', (req, res) => {
  const data = readTimetableFile();
  if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  const idIn = String(req.params.id || '').trim();
  let canon = idIn;
  if (!(canon in data.timetables)) {
    const resolved = resolveCanonicalId(data, 'classes', idIn);
    if (!resolved.ok) {
      if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates });
      return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono klasy');
    }
    canon = resolved.id;
  }
  const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : [];
  const groupQuery = typeof req.query.group === 'string' ? req.query.group.trim() : null;
  const includeWhole = req.query.includeWhole === undefined ? true : String(req.query.includeWhole).toLowerCase() !== 'false';
  let filtered = lessons;
  if (groupQuery) {
    const q = groupQuery.toLowerCase();
    const extractGroupTag = (lesson) => {
      const g = lesson && lesson.group ? lesson.group : null;
      const fromRef = g && (String(g.id || g.name || '')).toLowerCase();
      if (fromRef) return fromRef;
      const subj = String(lesson && lesson.subject || '').toLowerCase();
      // detect patterns like "-2/2" or " 2/2" at word boundary
      const m = subj.match(/(?:^|[\s\-])(\d+\/\d+)(?:$|\b)/);
      return m ? m[1] : null;
    };
    filtered = lessons.filter((l) => {
      const tag = extractGroupTag(l);
      if (!tag) return includeWhole; // whole-class lesson
      return tag === q;
    });
  }
  setTimetableCacheHeaders(res);
  res.json({ data: filtered, id: canon });
});

v1.get('/rooms/:id/timetable', (req, res) => {
  const data = readTimetableFile();
  if (!data || !data.timetables) return problem(res, 404, 'timetable.missing', 'Not Found', 'Brak pliku timetable_data.json');
  const idIn = String(req.params.id || '').trim();
  let canon = idIn;
  if (!(canon in data.timetables)) {
    const resolved = resolveCanonicalId(data, 'rooms', idIn);
    if (!resolved.ok) {
      if (resolved.error === 'ambiguous') return problem(res, 409, 'timetable.alias_ambiguous', 'Conflict', 'Alias matches multiple items', { candidates: resolved.candidates });
      return problem(res, 404, 'timetable.not_found', 'Not Found', 'Nie znaleziono sali');
    }
    canon = resolved.id;
  }
  const lessons = Array.isArray(data.timetables[canon]) ? data.timetables[canon] : [];
  setTimetableCacheHeaders(res);
  res.json({ data: lessons, id: canon });
});

// Attendance entries (list + patch)
function listAttendanceEntriesForUser(userId, query) {
  const db = loadDb();
  const st = db.attendanceByUser[userId] || defaultAttendanceState();
  const { from, to, subjectKey, classId, teacherId } = query || {};
  const f = typeof from === 'string' ? from : null;
  const t = typeof to === 'string' ? to : null;
  const subj = typeof subjectKey === 'string' && subjectKey ? subjectKey.toLowerCase() : null;
  const cid = typeof classId === 'string' && classId ? classId : null;
  const tid = typeof teacherId === 'string' && teacherId ? teacherId : null;
  const entries = Object.entries(st.byDate || {})
    .filter(([d]) => (!f || d >= f) && (!t || d <= t))
    .flatMap(([date, list]) => (Array.isArray(list) ? list.map(e => ({ ...e, date })) : []));
  const filtered = entries.filter(e =>
    (!subj || String(e.subjectKey || '').toLowerCase() === subj) &&
    (!cid || String(e.classId || '') === cid) &&
    (!tid || String(e.teacherId || '') === tid)
  );
  const sorted = filtered.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { entries: sorted, state: st };
}

function setRateHeaders(res, limit = 1000, remaining = 999, reset = 60) {
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(reset));
}

v1.get('/attendance/entries', requireAuthOrApiKey(['read:attendance']), (req, res) => {
  const userId = req.userId;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const { entries } = listAttendanceEntriesForUser(userId, req.query || {});
  let startIdx = 0;
  if (cursor) {
    startIdx = Math.max(0, entries.findIndex(e => String(e.id) > cursor));
  }
  const page = entries.slice(startIdx, startIdx + limit);
  const next = page.length === limit ? String(page[page.length - 1].id) : null;
  setRateHeaders(res);
  res.json({ data: page, nextCursor: next });
});

v1.patch('/attendance/entries', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
  try {
    const db = loadDb();
    const userId = req.userId;
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    const updates = Array.isArray(body && body.updates) ? body.updates : null;
    if (!updates) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing updates array');
    const st = db.attendanceByUser[userId] || defaultAttendanceState();
    let updated = 0;
    for (const u of updates) {
      const id = String(u && u.id || '');
      const present = !!(u && typeof u.present === 'boolean' ? u.present : false);
      const ifMatch = u && typeof u.ifMatch === 'string' ? u.ifMatch : null;
      const date = id.split('#')[0];
      const list = Array.isArray(st.byDate[date]) ? st.byDate[date] : [];
      const idx = list.findIndex(e => e && String(e.id) === id);
      if (idx < 0) continue;
      const entry = list[idx];
      const currentV = typeof entry._v === 'number' ? entry._v : 1;
      const currentTag = `"v${currentV}"`;
      if (ifMatch && ifMatch !== currentTag) {
        return problem(res, 409, 'conflict.version_mismatch', 'Version conflict', 'Entry has changed since you last fetched it');
      }
      entry.present = present;
      entry._v = currentV + 1;
      list[idx] = entry;
      st.byDate[date] = list;
      updated += 1;
    }
    st.updatedAt = Date.now();
    db.attendanceByUser[userId] = st;
    saveDb(db);
    res.json({ ok: true, updated });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

v1.get('/attendance/summary', requireAuthOrApiKey(['read:summary']), (req, res) => {
  const userId = req.userId;
  const db = loadDb();
  const { from, to, subjectKey } = req.query || {};
  const f = typeof from === 'string' ? from : null;
  const t = typeof to === 'string' ? to : null;
  const subj = typeof subjectKey === 'string' && subjectKey ? subjectKey.toLowerCase() : null;
  const st = db.attendanceByUser[userId] || defaultAttendanceState();
  const list = Object.entries(st.byDate || {})
    .filter(([d]) => (!f || d >= f) && (!t || d <= t))
    .flatMap(([, entries]) => entries || []);
  const filtered = subj ? list.filter(e => String(e.subjectKey || '').toLowerCase() === subj) : list;
  const total = filtered.length;
  const present = filtered.filter(e => !!e.present).length;
  const pct = total ? (present / total) * 100 : 0;
  const needToReach50 = Math.max(0, total - 2 * present);
  const canSkipAndKeep50 = Math.max(0, 2 * present - total);
  res.json({ data: { total, present, percent: pct, needToReach50, canSkipAndKeep50 } });
});

// Set all entries for a given day to present/absent
v1.post('/attendance/days/:dateISO/present', requireAuthOrApiKey(['write:attendance']), requireCsrfIfCookieAuth, (req, res) => {
  try {
    const db = loadDb();
    const userId = req.userId;
    const dateISO = String(req.params.dateISO || '');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const present = !!body.present;
    const st = db.attendanceByUser[userId] || defaultAttendanceState();
    const list = Array.isArray(st.byDate[dateISO]) ? [...st.byDate[dateISO]] : [];
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      const currentV = typeof list[i]._v === 'number' ? list[i]._v : 1;
      if (list[i].present !== present) {
        list[i].present = present;
        list[i]._v = currentV + 1;
        updated++;
      }
    }
    st.byDate[dateISO] = list;
    st.updatedAt = Date.now();
    db.attendanceByUser[userId] = st;
    saveDb(db);
    res.json({ ok: true, updated });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Idempotency cache for POSTs (memory; replace with Redis in prod)
const IDEMPOTENCY = new Map();
function idempotencyMiddleware(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key) return next();
  const cache = IDEMPOTENCY.get(key);
  if (cache) return res.status(cache.status).set(cache.headers).send(cache.body);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    IDEMPOTENCY.set(key, { status: res.statusCode, headers: res.getHeaders(), body });
    return originalJson(body);
  };
  next();
}

v1.post('/approvals', requireAuth, requireCsrfIfCookieAuth, idempotencyMiddleware, (req, res) => {
  try {
    const { action, dateISO, entryId, present } = req.body || {};
    if (!action || !dateISO || !entryId) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing required fields');
    const db = loadDb();
    const userId = req.userId;
    const token = 'appr_' + crypto.randomBytes(10).toString('hex');
    const tokenHash = hashApiKeySecret(token);
    const rec = { id: uid('apr_'), userId, tokenHash, payload: { action, dateISO, entryId, present: !!present }, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
    db.approvals.push(rec);
    saveDb(db);
    res.status(201).json({ ok: true, data: { token, url: `/v1/approvals/${token}`, expiresAt: new Date(rec.expiresAt).toISOString() } });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

v1.get('/approvals/:token', (req, res) => {
  try {
    const db = loadDb();
    const token = String(req.params.token || '');
    const tokenHash = hashApiKeySecret(token);
    const item = db.approvals.find(a => a.tokenHash === tokenHash);
    if (!item) return problem(res, 404, 'approvals.not_found', 'Not Found', 'Nie znaleziono');
    if (Date.now() > item.expiresAt) {
      item.status = 'expired';
      saveDb(db);
      return problem(res, 410, 'approvals.expired', 'Gone', 'Token expired');
    }
    res.json({ ok: true, data: { status: item.status, createdAt: new Date(item.createdAt).toISOString(), expiresAt: new Date(item.expiresAt).toISOString() } });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

v1.post('/approvals/:token', requireCsrfIfCookieAuth, async (req, res) => {
  try {
    const db = loadDb();
    const token = String(req.params.token || '');
    const tokenHash = hashApiKeySecret(token);
    const item = db.approvals.find(a => a.tokenHash === tokenHash);
    if (!item) return problem(res, 404, 'approvals.not_found', 'Not Found', 'Nie znaleziono');
    if (item.status !== 'pending') return problem(res, 409, 'approvals.already_decided', 'Conflict', 'Already decided');
    if (Date.now() > item.expiresAt) {
      item.status = 'expired';
      saveDb(db);
      return problem(res, 410, 'approvals.expired', 'Gone', 'Token expired');
    }
    const { decision } = req.body || {};
    if (decision !== 'accept' && decision !== 'deny') return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing or invalid decision');
    item.status = decision === 'accept' ? 'accepted' : 'denied';
    if (decision === 'accept') {
      const { action, dateISO, entryId, present } = item.payload || {};
      const st = db.attendanceByUser[item.userId] || defaultAttendanceState();
      const list = Array.isArray(st.byDate[dateISO]) ? [...st.byDate[dateISO]] : [];
      const idx = list.findIndex(e => e && e.id === entryId);
      if (idx >= 0) {
        if (action === 'toggle') list[idx].present = !list[idx].present;
        else if (action === 'set') list[idx].present = !!present;
        st.byDate[dateISO] = list;
        st.updatedAt = Date.now();
        db.attendanceByUser[item.userId] = st;
      }
    }
    saveDb(db);
    res.json({ ok: true });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Overrides (secured in v1)
v1.get('/overrides', requireAuth, (_req, res) => {
  try {
    const data = loadOverrides();
    res.json({ data });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

v1.put('/overrides', requireAuth, requireCsrfIfCookieAuth, (req, res) => {
  try {
    if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
    const { subjectOverrides, teacherNameOverrides } = req.body || {};
    const data = {
      subjectOverrides: subjectOverrides && typeof subjectOverrides === 'object' ? subjectOverrides : {},
      teacherNameOverrides: teacherNameOverrides && typeof teacherNameOverrides === 'object' ? teacherNameOverrides : {},
    };
    saveOverrides(data);
    res.json({ ok: true });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Jobs: async timetable scrape
const JOBS = new Map();
let isArticleRunning = false;
v1.post('/jobs/timetable-scrape', requireAuth, requireCsrfIfCookieAuth, async (req, res) => {
  if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
  if (isRunning) {
    // Create a pseudo-job representing ongoing work
    const running = Array.from(JOBS.values()).find(j => j.status === 'running');
    if (running) return res.status(202).json({ jobId: running.id, statusUrl: `/v1/jobs/${running.id}` });
  }
  const jobId = 'job_' + crypto.randomUUID();
  const job = { id: jobId, status: 'queued', startedAt: null, finishedAt: null, error: null };
  JOBS.set(jobId, job);
  res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
  // Kick off asynchronously
  (async () => {
    try {
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand();
      if (!pythonCmd) throw new Error('Brak interpretera Pythona');
      // Ensure Python deps installed (cached)
      const deps = await ensurePythonDepsInstalled(pythonCmd);
      if (deps && deps.error) throw new Error(deps.error);
      // Run scraper
      const script = process.platform === 'win32' && pythonCmd === 'py' ? ['-3', 'scraper.py'] : ['scraper.py'];
      const run = await runCommand(pythonCmd, script, { cwd: publicDir, env: process.env });
      if (run.code !== 0) throw new Error(run.stderr.slice(-4000));
      job.status = 'succeeded';
      job.finishedAt = new Date().toISOString();
    } catch (e) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.error = String(e);
    }
  })();
});

v1.get('/jobs/:jobId', (req, res) => {
  const jobId = String(req.params.jobId);
  const job = JOBS.get(jobId);
  if (!job) return problem(res, 404, 'jobs.not_found', 'Not Found', 'Nie znaleziono');
  res.json(job);
});

// Articles scrape job (admin-only)
v1.post('/jobs/articles-scrape', requireAuth, requireCsrfIfCookieAuth, async (req, res) => {
  try {
    if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
    if (isArticleRunning) {
      const running = Array.from(JOBS.values()).find(j => j && j.kind === 'articles' && j.status === 'running');
      if (running) return res.status(202).json({ jobId: running.id, statusUrl: `/v1/jobs/${running.id}` });
    }
    const jobId = 'job_' + crypto.randomUUID();
    const job = { id: jobId, kind: 'articles', status: 'queued', startedAt: null, finishedAt: null, error: null };
    JOBS.set(jobId, job);
    res.status(202).json({ jobId, statusUrl: `/v1/jobs/${jobId}` });
    (async () => {
      isArticleRunning = true;
      try {
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand();
        if (!pythonCmd) throw new Error('Brak interpretera Pythona');
        const deps = await ensurePythonDepsInstalled(pythonCmd);
        if (deps && deps.error) throw new Error(deps.error);
        const script = process.platform === 'win32' && pythonCmd === 'py' ? ['-3', 'article_scraper.py'] : ['article_scraper.py'];
        const run = await runCommand(pythonCmd, script, { cwd: publicDir, env: process.env });
        if (run.code !== 0) throw new Error(run.stderr.slice(-4000));
        job.status = 'succeeded';
        job.finishedAt = new Date().toISOString();
      } catch (e) {
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        job.error = String(e);
      } finally {
        isArticleRunning = false;
      }
    })();
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Timetable backups list (admin only)
v1.get('/timetable/backups', requireAuth, (req, res) => {
  if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
  try {
    if (!existsSync(timetableBackupsDir)) return res.json({ data: [] });
    const list = readdirSync(timetableBackupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const p = join(timetableBackupsDir, f);
        const st = statSync(p);
        return { filename: f, size: st.size, mtime: new Date(st.mtimeMs).toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    res.json({ data: list });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Restore a selected backup (admin only)
v1.post('/timetable/restore', requireAuth, requireCsrfIfCookieAuth, (req, res) => {
  if (req.userId !== 'admin') return problem(res, 403, 'auth.forbidden', 'Forbidden', 'Tylko administrator');
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const filename = String(body.filename || '');
    if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.json')) {
      return problem(res, 400, 'request.invalid', 'Bad Request', 'Invalid filename');
    }
    const src = join(timetableBackupsDir, filename);
    if (!existsSync(src)) return problem(res, 404, 'backups.not_found', 'Not Found', 'Backup not found');
    const content = readFileSync(src, 'utf8');
    // Always keep the backup; also create a backup of current before overwrite
    try {
      if (existsSync(timetableFilePath)) {
        const current = readFileSync(timetableFilePath, 'utf8');
        if (current) {
          try { mkdirSync(timetableBackupsDir, { recursive: true }); } catch {}
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          writeFileSync(join(timetableBackupsDir, `timetable_data-${stamp}.json`), current, 'utf8');
        }
      }
    } catch {}
    writeFileSync(timetableFilePath, content, 'utf8');
    return res.json({ ok: true });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// Mount /v1
app.use('/v1', v1);

// ----------- Plans (FrekwencjaPage support) -----------
function getPolishDayName(dateISO) {
  try {
    const d = new Date(dateISO + 'T00:00:00Z');
    const dn = d.getUTCDay(); // 0=Sun ... 6=Sat
    switch (dn) {
      case 1: return 'Poniedziałek';
      case 2: return 'Wtorek';
      case 3: return 'Środa';
      case 4: return 'Czwartek';
      case 5: return 'Piątek';
      case 6: return 'Sobota';
      case 0: return 'Niedziela';
      default: return 'Poniedziałek';
    }
  } catch {
    return 'Poniedziałek';
  }
}

v1.get('/attendance/plans', requireAuthOrApiKey(['read:attendance']), (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const st = db.attendanceByUser[userId] || defaultAttendanceState();
  res.json({ data: st.plans || [] });
});

v1.post('/attendance/days/:dateISO/apply-plan', requireAuthOrApiKey(['write:attendance']), (req, res) => {
  try {
    const db = loadDb();
    const userId = req.userId;
    const dateISO = String(req.params.dateISO || '');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const planId = String(body.planId || '');
    const overwrite = !!body.overwrite;
    const setPresent = typeof body.setPresent === 'boolean' ? body.setPresent : null;
    if (!planId) return problem(res, 400, 'request.invalid', 'Bad Request', 'Missing planId');
    const st = db.attendanceByUser[userId] || defaultAttendanceState();
    const plan = Array.isArray(st.plans) ? st.plans.find(p => p && p.id === planId) : null;
    if (!plan) return problem(res, 404, 'plans.not_found', 'Not Found', 'Plan not found');
    const dayName = getPolishDayName(dateISO);
    const day = plan.days && plan.days[dayName];
    const items = day && Array.isArray(day.items) ? day.items : [];
    if (items.length === 0) return problem(res, 400, 'plans.empty_day', 'Bad Request', 'Selected plan has no items for this day');
    const existing = Array.isArray(st.byDate[dateISO]) ? st.byDate[dateISO] : [];
    if (existing.length > 0 && !overwrite) {
      return problem(res, 409, 'conflict.day_has_entries', 'Conflict', 'Day already has entries. Use overwrite=true to replace.');
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
    }));
    st.byDate[dateISO] = created;
    st.updatedAt = Date.now();
    db.attendanceByUser[userId] = st;
    saveDb(db);
    res.json({ ok: true, created: created.length, overwritten: existing.length > 0 });
  } catch (e) {
    problem(res, 500, 'server.error', 'Internal Server Error', String(e));
  }
});

// -------------------- Production static hosting --------------------
// Serve runtime-updated assets from /public (e.g., articles.json, timetable_data.json)
try {
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, {
      index: false,
      etag: false,
      cacheControl: false,
      setHeaders: (res, path) => {
        // Ensure JSON is never cached so admin updates are visible immediately
        if (path.endsWith('.json')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
  }
} catch {}

// Serve built SPA from /dist when available (production)
try {
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, extensions: ['html'] }));
    // SPA fallback: send index.html for unknown routes (except API/docs)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/v1') || req.path.startsWith('/api') || req.path.startsWith('/docs')) return next();
      try {
        res.sendFile(join(distDir, 'index.html'));
      } catch (e) {
        next();
      }
    });
  }
} catch {}
