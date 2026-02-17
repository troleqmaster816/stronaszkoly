export function problem(res, status, code, title, detail, extra = {}) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title, status, code, detail, ...extra })
}

export function createCorsErrorHandler(problemFn) {
  return (err, _req, res, next) => {
    if (!err) return next()
    if (err && (err.message === 'cors.not_allowed' || err.message === 'Not allowed by CORS')) {
      return problemFn(res, 403, 'cors.not_allowed', 'Forbidden', 'Origin not allowed by CORS')
    }
    return next(err)
  }
}
