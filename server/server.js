import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
const TOKENS = new Set();
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const overridesPath = join(publicDir, 'overrides.json');

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
  return next();
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
  res.json({ ok: true, authenticated: isAuth, user: isAuth ? ADMIN_USER : null });
});

app.post('/api/login', (req, res) => {
  const { username, password } = (req.body && typeof req.body === 'object' ? req.body : {})
    || {};
  const qUser = req.query && typeof req.query.username === 'string' ? req.query.username : undefined;
  const qPass = req.query && typeof req.query.password === 'string' ? req.query.password : undefined;
  const user = username ?? qUser;
  const pass = password ?? qPass;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    TOKENS.add(token);
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

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});


