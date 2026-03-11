import multer from 'multer'

const HUB_BACKGROUND_MAX_UPLOAD_MB = 40
const HUB_BACKGROUND_MAX_UPLOAD_BYTES = HUB_BACKGROUND_MAX_UPLOAD_MB * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HUB_BACKGROUND_MAX_UPLOAD_BYTES, files: 1 },
})

function respondWithMulterProblem(problem, res, error) {
  if (!error) return false
  if (error instanceof multer.MulterError) {
    const detail = error.code === 'LIMIT_FILE_SIZE'
      ? `Plik jest za duzy. Maksymalny rozmiar to ${HUB_BACKGROUND_MAX_UPLOAD_MB} MB.`
      : 'Nie udalo sie odczytac wyslanego pliku.'
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    const title = error.code === 'LIMIT_FILE_SIZE' ? 'Payload Too Large' : 'Bad Request'
    problem(res, status, 'request.invalid_file_upload', title, detail)
    return true
  }
  problem(res, 400, 'request.invalid_file_upload', 'Bad Request', String(error))
  return true
}

export function registerHubBackgroundRoutes(v1, {
  problem,
  requireAuth,
  requireAdmin,
  requireCsrfIfCookieAuth,
  hubBackgroundStore,
}) {
  v1.get('/hub-backgrounds', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.json({ ok: true, data: hubBackgroundStore.getState() })
    } catch (e) {
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.post(
    '/hub-backgrounds',
    requireAuth,
    requireAdmin,
    requireCsrfIfCookieAuth,
    (req, res, next) => upload.single('image')(req, res, (error) => {
      if (respondWithMulterProblem(problem, res, error)) return
      next()
    }),
    async (req, res) => {
      try {
        const file = req.file
        if (!file || !file.buffer || file.buffer.length === 0) {
          return problem(res, 400, 'request.image_required', 'Bad Request', 'Wybierz plik obrazu.')
        }
        if (!String(file.mimetype || '').startsWith('image/')) {
          return problem(res, 400, 'request.invalid_image_type', 'Bad Request', 'Obslugiwane sa tylko pliki graficzne.')
        }
        const state = await hubBackgroundStore.uploadBackground({
          buffer: file.buffer,
          originalName: file.originalname,
        })
        return res.status(201).json({ ok: true, data: state })
      } catch (e) {
        problem(res, 500, 'server.error', 'Internal Server Error', String(e))
      }
    }
  )

  v1.post('/hub-backgrounds/:id/activate', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      const state = hubBackgroundStore.activateBackground(req.params.id)
      res.json({ ok: true, data: state })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === 'background.not_found') {
        return problem(res, 404, 'background.not_found', 'Not Found', String(e.message || e))
      }
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.post('/hub-backgrounds/:id/lock', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const state = hubBackgroundStore.setBackgroundLocked(req.params.id, body.locked === true)
      res.json({ ok: true, data: state })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === 'background.not_found') {
        return problem(res, 404, 'background.not_found', 'Not Found', String(e.message || e))
      }
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })

  v1.delete('/hub-backgrounds/:id', requireAuth, requireAdmin, requireCsrfIfCookieAuth, (req, res) => {
    try {
      const state = hubBackgroundStore.deleteBackground(req.params.id)
      res.json({ ok: true, data: state })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === 'background.not_found') {
        return problem(res, 404, 'background.not_found', 'Not Found', String(e.message || e))
      }
      if (e && typeof e === 'object' && e.code === 'background.locked') {
        return problem(res, 409, 'background.locked', 'Conflict', String(e.message || e))
      }
      if (e && typeof e === 'object' && e.code === 'background.last_entry') {
        return problem(res, 409, 'background.last_entry', 'Conflict', String(e.message || e))
      }
      problem(res, 500, 'server.error', 'Internal Server Error', String(e))
    }
  })
}
