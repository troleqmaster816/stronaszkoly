export function createAuthMiddleware({ loadDb, saveDb, tokens, problem, findUserIdByApiKeyToken }) {
  function requireAuth(req, res, next) {
    const token = (req.cookies && req.cookies.auth) || null
    if (!token || !tokens.has(token)) return problem(res, 401, 'auth.missing', 'Unauthorized', 'Unauthenticated')
    const userId = tokens.get(token)
    req.userId = userId
    req.authMethod = 'cookie'
    return next()
  }

  function requireAuthOrApiKey(_scopes = []) {
    return (req, res, next) => {
      const auth = req.get('authorization')
      if (auth && auth.toLowerCase().startsWith('bearer ')) {
        const token = auth.slice(7).trim()
        try {
          const db = loadDb()
          const found = findUserIdByApiKeyToken(db, token)
          if (found.userId) {
            if (found.changed) saveDb(db)
            req.userId = found.userId
            req.authMethod = 'apikey'
            return next()
          }
          throw new Error('Unknown')
        } catch {
          return problem(res, 401, 'auth.invalid_api_key', 'Unauthorized', 'Bearer token is unknown')
        }
      }

      const cookieToken = (req.cookies && req.cookies.auth) || null
      if (!cookieToken || !tokens.has(cookieToken)) return problem(res, 401, 'auth.missing', 'Unauthorized', 'Missing Bearer token or session cookie')
      const userId = tokens.get(cookieToken)
      req.userId = userId
      req.authMethod = 'cookie'
      return next()
    }
  }

  function requireBearer(_scopes = []) {
    return (req, res, next) => {
      const auth = req.get('authorization')
      if (!(auth && auth.toLowerCase().startsWith('bearer '))) {
        return problem(res, 401, 'auth.missing', 'Unauthorized', 'Missing Bearer token')
      }
      const token = auth.slice(7).trim()
      try {
        const db = loadDb()
        const found = findUserIdByApiKeyToken(db, token)
        if (found.userId) {
          if (found.changed) saveDb(db)
          req.userId = found.userId
          req.authMethod = 'apikey'
          return next()
        }
        throw new Error('Unknown')
      } catch {
        return problem(res, 401, 'auth.invalid_api_key', 'Unauthorized', 'Bearer token is unknown')
      }
    }
  }

  return {
    requireAuth,
    requireAuthOrApiKey,
    requireBearer,
  }
}
