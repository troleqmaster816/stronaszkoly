import rateLimit from 'express-rate-limit'
import { uid } from '../../lib/ids.js'

export function createAuthLimiters() {
  return {
    loginLimiter: rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
    registerLimiter: rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }),
    refreshLimiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }),
  }
}

export function registerAuthRoutes(v1, {
  loadDb,
  saveDb,
  sessionStore,
  authCookieOpts,
  isProd,
  adminLoginEnabled,
  adminUser,
  adminPass,
  verifyPassword,
  hashPassword,
  problem,
  loginLimiter,
  registerLimiter,
  registrationEnabled,
}) {
  v1.post('/login', loginLimiter, (req, res) => {
    const { username, password } = (req.body && typeof req.body === 'object' ? req.body : {}) || {}
    const userIn = String(username ?? '').trim().toLowerCase()
    const passIn = String(password ?? '')
    const db = loadDb()
    const user = db.users.find((u) => u.username === userIn)
    if (user && verifyPassword(passIn, user.passSalt, user.passHash)) {
      const token = sessionStore.create(user.id)
      res.cookie('auth', token, authCookieOpts)
      return res.json({ ok: true, data: { authenticated: true } })
    }
    if (adminLoginEnabled && userIn === adminUser && passIn === adminPass) {
      const token = sessionStore.create('admin')
      res.cookie('auth', token, authCookieOpts)
      return res.json({ ok: true, data: { authenticated: true } })
    }
    return problem(res, 401, 'auth.invalid_credentials', 'Unauthorized', 'Nieprawidłowe dane logowania')
  })

  v1.post('/logout', (req, res) => {
    const token = (req.cookies && req.cookies.auth) || null
    sessionStore.revoke(token)
    res.clearCookie('auth', { path: '/', sameSite: 'lax', secure: isProd })
    res.json({ ok: true, data: { loggedOut: true } })
  })

  v1.post('/register', registerLimiter, (req, res) => {
    try {
      if (!registrationEnabled) {
        return problem(res, 403, 'auth.registration_disabled', 'Forbidden', 'Rejestracja jest wyłączona')
      }
      const { username, password } = (req.body && typeof req.body === 'object') ? req.body : {}
      const u = String(username || '').trim().toLowerCase()
      const p = String(password || '')
      const usernameOk = /^[a-z0-9._-]{3,32}$/.test(u)
      if (!usernameOk || p.length < 8) {
        return problem(
          res,
          400,
          'auth.invalid_payload',
          'Bad Request',
          'Nieprawidłowe dane (username: 3-32, a-z0-9._-; hasło: min. 8 znaków)',
        )
      }
      const db = loadDb()
      if (db.users.some((x) => x.username === u)) return problem(res, 409, 'auth.user_exists', 'Conflict', 'Użytkownik istnieje')
      const { salt, hash } = hashPassword(p)
      const user = { id: uid('u_'), username: u, passSalt: salt, passHash: hash, createdAt: Date.now() }
      db.users.push(user)
      saveDb(db)
      const session = sessionStore.create(user.id)
      res.cookie('auth', session, authCookieOpts)
      res.json({ ok: true, data: { authenticated: true } })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
