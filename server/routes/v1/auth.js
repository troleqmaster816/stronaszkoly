import crypto from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { uid } from '../../lib/ids.js'

export function createAuthLimiters() {
  return {
    loginLimiter: rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
    refreshLimiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }),
  }
}

export function registerAuthRoutes(v1, {
  loadDb,
  saveDb,
  tokens,
  authCookieOpts,
  isProd,
  adminLoginEnabled,
  adminUser,
  adminPass,
  verifyPassword,
  hashPassword,
  problem,
  loginLimiter,
}) {
  v1.post('/login', loginLimiter, (req, res) => {
    const { username, password } = (req.body && typeof req.body === 'object' ? req.body : {}) || {}
    const userIn = String(username ?? '').trim().toLowerCase()
    const passIn = String(password ?? '')
    const db = loadDb()
    const user = db.users.find((u) => u.username === userIn)
    if (user && verifyPassword(passIn, user.passSalt, user.passHash)) {
      const token = crypto.randomBytes(32).toString('base64url')
      tokens.set(token, user.id)
      res.cookie('auth', token, authCookieOpts)
      return res.json({ ok: true, data: { authenticated: true } })
    }
    if (adminLoginEnabled && userIn === adminUser && passIn === adminPass) {
      const token = crypto.randomBytes(32).toString('base64url')
      tokens.set(token, 'admin')
      res.cookie('auth', token, authCookieOpts)
      return res.json({ ok: true, data: { authenticated: true } })
    }
    return problem(res, 401, 'auth.invalid_credentials', 'Unauthorized', 'Nieprawidłowe dane logowania')
  })

  v1.post('/logout', (req, res) => {
    const token = (req.cookies && req.cookies.auth) || null
    if (token && tokens.has(token)) tokens.delete(token)
    res.clearCookie('auth', { path: '/', sameSite: 'lax', secure: isProd })
    res.json({ ok: true, data: { loggedOut: true } })
  })

  v1.post('/register', (req, res) => {
    try {
      const { username, password } = (req.body && typeof req.body === 'object') ? req.body : {}
      const u = String(username || '').trim().toLowerCase()
      const p = String(password || '')
      if (!u || !p || p.length < 6) return problem(res, 400, 'auth.invalid_payload', 'Bad Request', 'Nieprawidłowe dane (min. 6 znaków hasła)')
      const db = loadDb()
      if (db.users.some((x) => x.username === u)) return problem(res, 409, 'auth.user_exists', 'Conflict', 'Użytkownik istnieje')
      const { salt, hash } = hashPassword(p)
      const user = { id: uid('u_'), username: u, passSalt: salt, passHash: hash, createdAt: Date.now() }
      db.users.push(user)
      saveDb(db)
      const session = crypto.randomBytes(32).toString('base64url')
      tokens.set(session, user.id)
      res.cookie('auth', session, authCookieOpts)
      res.json({ ok: true, data: { authenticated: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
