import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const publicDir = join(projectRoot, 'public');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
  writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
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
  writeFileSync(overridesPath, JSON.stringify(safe, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  const token = (req.cookies && req.cookies.auth) || null;
  if (!token || !TOKENS.has(token)) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
  const userId = TOKENS.get(token);
  req.userId = userId;
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
          if (!checkApiKeyScopes(item.scopes, scopes)) return res.status(403).json({ ok: false, error: 'Insufficient scope' });
          req.userId = item.userId;
          req.apiKeyId = item.id;
          return next();
        }
        throw new Error('Malformed');
      } catch (e) {
        return res.status(401).json({ ok: false, error: 'Invalid API key' });
      }
    }
    // Fallback to cookie session
    const cookieToken = (req.cookies && req.cookies.auth) || null;
    if (!cookieToken || !TOKENS.has(cookieToken)) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
    const userId = TOKENS.get(cookieToken);
    req.userId = userId;
    return next();
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const token = (req.cookies && req.cookies.auth) || null;
  const isAuth = !!(token && TOKENS.has(token));
  if (!isAuth) return res.json({ ok: true, authenticated: false, user: null });
  const db = loadDb();
  const userId = TOKENS.get(token);
  const user = db.users.find(u => u.id === userId);
  res.json({ ok: true, authenticated: true, user: user ? { id: user.id, username: user.username } : { id: 'admin', username: ADMIN_USER } });
});

app.post('/api/register', (req, res) => {
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
    const session = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    TOKENS.set(session, user.id);
    res.cookie('auth', session, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = (req.body && typeof req.body === 'object' ? req.body : {})
    || {};
  const qUser = req.query && typeof req.query.username === 'string' ? req.query.username : undefined;
  const qPass = req.query && typeof req.query.password === 'string' ? req.query.password : undefined;
  const userIn = String(username ?? qUser ?? '').trim().toLowerCase();
  const passIn = String(password ?? qPass ?? '');
  const db = loadDb();
  const user = db.users.find(u => u.username === userIn);
  if (user && verifyPassword(passIn, user.passSalt, user.passHash)) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    TOKENS.set(token, user.id);
    res.cookie('auth', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000 });
    return res.json({ ok: true });
  }
  if (userIn === ADMIN_USER && passIn === ADMIN_PASS) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    TOKENS.set(token, 'admin');
    res.cookie('auth', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000 });
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Nieprawidłowe dane logowania' });
});

app.post('/api/logout', (req, res) => {
  const token = (req.cookies && req.cookies.auth) || null;
  if (token && TOKENS.has(token)) TOKENS.delete(token);
  res.clearCookie('auth');
  res.json({ ok: true });
});

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

app.use('/api/login', loginLimiter);
app.use('/api/refresh', refreshLimiter);

app.post('/api/refresh', requireAuth, async (_req, res) => {
  if (isRunning) {
    return res.status(409).json({ ok: false, error: 'Scraper już działa' });
  }
  const pythonCmd = process.env.PYTHON_PATH || detectPythonCommand();
  if (!pythonCmd) {
    return res.status(500).json({ ok: false, error: 'Nie znaleziono interpretera Pythona (python/python3/py).' });
  }

  isRunning = true;
  try {
    // Ensure Python deps installed
    const pipArgs = ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', 'requirements.txt'];
    const pip = await runCommand(pythonCmd, pipArgs, { cwd: publicDir, env: process.env });
    if (pip.code !== 0) {
      isRunning = false;
      return res.status(500).json({ ok: false, step: 'pip', error: pip.stderr.slice(-4000) });
    }

    // Run scraper
    const script = process.platform === 'win32' && pythonCmd === 'py' ? ['-3', 'scraper.py'] : ['scraper.py'];
    const run = await runCommand(pythonCmd, script, { cwd: publicDir, env: process.env });
    isRunning = false;
    if (run.code !== 0) {
      return res.status(500).json({ ok: false, step: 'scraper', error: run.stderr.slice(-4000), output: run.stdout.slice(-4000) });
    }
    return res.json({ ok: true });
  } catch (e) {
    isRunning = false;
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/overrides', (_req, res) => {
  try {
    const data = loadOverrides();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/overrides', requireAuth, (req, res) => {
  try {
    const { subjectOverrides, teacherNameOverrides } = req.body || {};
    const data = {
      subjectOverrides: subjectOverrides && typeof subjectOverrides === 'object' ? subjectOverrides : {},
      teacherNameOverrides: teacherNameOverrides && typeof teacherNameOverrides === 'object' ? teacherNameOverrides : {},
    };
    saveOverrides(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ------------------ Single API key (testing) ------------------
app.get('/api/apikey', requireAuth, (req, res) => {
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

app.post('/api/apikey/regenerate', requireAuth, (req, res) => {
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

// ------------------ Timetable API (public + auth) ------------------
app.get('/api/timetable', async (_req, res) => {
  try {
    const data = readFileSync(join(publicDir, 'timetable_data.json'), 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (e) {
    res.status(404).json({ ok: false, error: 'Brak pliku timetable_data.json' });
  }
});

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

app.get('/api/attendance', requireAuthOrApiKey(['read:attendance']), (req, res) => {
  const db = loadDb();
  const userId = req.userId;
  const state = db.attendanceByUser[userId] || defaultAttendanceState();
  res.json({ ok: true, data: state });
});

app.put('/api/attendance', requireAuthOrApiKey(['write:attendance']), (req, res) => {
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
app.post('/api/attendance/approvals', requireAuth, (req, res) => {
  try {
    const { action, dateISO, entryId, present } = req.body || {};
    if (!action || !dateISO || !entryId) return res.status(400).json({ ok: false, error: 'Brak wymaganych pól' });
    const db = loadDb();
    const userId = req.userId;
    const token = 'appr_' + crypto.randomBytes(10).toString('hex');
    const tokenHash = hashApiKeySecret(token);
    const rec = { id: uid('apr_'), userId, tokenHash, payload: { action, dateISO, entryId, present: !!present }, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
    db.approvals.push(rec);
    saveDb(db);
    res.json({ ok: true, token });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/attendance/approvals/:token', (req, res) => {
  try {
    const db = loadDb();
    const token = String(req.params.token || '');
    const tokenHash = hashApiKeySecret(token);
    const item = db.approvals.find(a => a.tokenHash === tokenHash);
    if (!item) return res.status(404).json({ ok: false, error: 'Nie znaleziono' });
    res.json({ ok: true, data: { status: item.status, createdAt: item.createdAt, expiresAt: item.expiresAt, payload: item.payload } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/attendance/approvals/:token/decision', async (req, res) => {
  try {
    const db = loadDb();
    const token = String(req.params.token || '');
    const tokenHash = hashApiKeySecret(token);
    const item = db.approvals.find(a => a.tokenHash === tokenHash);
    if (!item) return res.status(404).json({ ok: false, error: 'Nie znaleziono' });
    if (item.status !== 'pending') return res.status(409).json({ ok: false, error: 'Już rozpatrzone' });
    const { decision } = req.body || {};
    if (decision !== 'accept' && decision !== 'deny') return res.status(400).json({ ok: false, error: 'Brak decyzji' });
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
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
