import express from 'express'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import crypto from 'node:crypto'

export const CSRF_COOKIE_NAME = 'csrf'

export function applyTrustProxy(app, { trustProxy, isProd }) {
  const envVal = String(trustProxy || '').trim().toLowerCase()
  if (envVal) {
    if (envVal === 'true') app.set('trust proxy', true)
    else if (envVal === 'false') app.set('trust proxy', false)
    else if (/^\d+$/.test(envVal)) app.set('trust proxy', Number(envVal))
    else app.set('trust proxy', envVal)
  } else if (isProd) {
    app.set('trust proxy', 1)
  }
}

function isDevOriginAllowed(origin) {
  try {
    if (!origin) return true
    const url = new URL(origin)
    const host = url.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io')) return true
  } catch {}
  return false
}

function isSameOriginRequest(req, origin) {
  try {
    const url = new URL(origin)
    const host = req.get('host')
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim()
    const proto = forwardedProto || req.protocol
    if (!host) return false
    return url.host === host && url.protocol === `${proto}:`
  } catch {
    return false
  }
}

export function createAuthCookieOptions(isProd) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
    maxAge: 7 * 24 * 3600 * 1000,
  }
}

export function ensureCsrfCookie(isProd) {
  return (req, res, next) => {
    try {
      const cur = req.cookies && req.cookies[CSRF_COOKIE_NAME]
      if (!cur) {
        const token = crypto.randomBytes(24).toString('base64url')
        res.cookie(CSRF_COOKIE_NAME, token, {
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 3600 * 1000,
          secure: isProd,
        })
      }
    } catch {}
    next()
  }
}

export function requireCsrfIfCookieAuth(problemFn) {
  return (req, res, next) => {
    const hasSessionCookie = !!(req.cookies && req.cookies.auth)
    if (!hasSessionCookie) return next()
    const header = req.get('x-csrf-token')
    const cookie = req.cookies && req.cookies[CSRF_COOKIE_NAME]
    if (cookie && header && header === cookie) return next()
    return problemFn(res, 403, 'csrf.missing_or_invalid', 'Forbidden', 'Missing or invalid CSRF token')
  }
}

export function applySecurityMiddleware(app, config) {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }))

  if (config.isProd) {
    const directives = {
      'default-src': ["'self'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'script-src': ["'self'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'img-src': ["'self'", 'data:', 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'connect-src': ["'self'", 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'font-src': ["'self'", 'data:', 'https://zse-zdwola.pl', 'https://*.zse-zdwola.pl'],
      'frame-src': [
        "'self'",
        'https://zse-zdwola.pl',
        'https://*.zse-zdwola.pl',
        'https://view.officeapps.live.com',
        'https://*.officeapps.live.com',
      ],
      'object-src': ["'none'"],
      'frame-ancestors': ["'self'"],
    }
    app.use(helmet.contentSecurityPolicy({ useDefaults: true, directives }))
  }

  const isDevEnv = config.nodeEnv !== 'production'
  app.use((req, res, next) => {
    const middleware = cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        if (config.allowedOrigins.includes(origin)) return cb(null, true)
        if (isDevEnv && isDevOriginAllowed(origin)) return cb(null, true)
        if (isSameOriginRequest(req, origin)) return cb(null, true)
        return cb(new Error('cors.not_allowed'))
      },
      credentials: true,
    })
    return middleware(req, res, next)
  })

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(compression())
  app.use(ensureCsrfCookie(config.isProd))
}

export function attachObservabilityHeaders(app) {
  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', crypto.randomUUID())
    const prev = res.getHeader('Access-Control-Expose-Headers')
    const expose = ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'ETag']
    const merged = new Set(String(prev || '').split(',').map((s) => s.trim()).filter(Boolean).concat(expose))
    res.setHeader('Access-Control-Expose-Headers', Array.from(merged).join(', '))
    next()
  })
}
