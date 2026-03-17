import crypto from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import sharp from 'sharp'

const LEGACY_ENTRY_ID = 'legacy-default'
const SPECIAL_ENTRY_ID = 'special-ela-clock'
const SPECIAL_ENTRY_DIR = 'hub-backgrounds/special-ela-clock'
const SPECIAL_SOURCE_NAME = 'ela-wiekszy-widok-special.png'
const MAX_PREVIOUS_HISTORY = 2
const TARGET_WIDTHS = [640, 1024, 1600, 1920, 2560]

function toIsoNow() {
  return new Date().toISOString()
}

function toEpochMs(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function sortEntries(entries, activeId) {
  return [...entries].sort((a, b) => {
    if (a.id === activeId) return -1
    if (b.id === activeId) return 1
    if (a.kind === 'special' && b.kind !== 'special') return -1
    if (b.kind === 'special' && a.kind !== 'special') return 1
    const bySelected = toEpochMs(b.lastSelectedAt) - toEpochMs(a.lastSelectedAt)
    if (bySelected !== 0) return bySelected
    return toEpochMs(b.createdAt) - toEpochMs(a.createdAt)
  })
}

function toPublicUrl(publicDir, filePath) {
  const rel = relative(publicDir, filePath).replace(/\\/g, '/')
  return `/${rel}`
}

function createLegacyVariants(publicDir, ext) {
  return TARGET_WIDTHS
    .map((width) => {
      const filePath = join(publicDir, `hub-bg-right-${width}.${ext}`)
      if (!existsSync(filePath)) return null
      return {
        width,
        height: null,
        url: toPublicUrl(publicDir, filePath),
      }
    })
    .filter(Boolean)
}

function createFixedVariants(publicDir, dirPath, ext) {
  return TARGET_WIDTHS
    .map((width) => {
      const filePath = join(publicDir, dirPath, `hub-bg-right-${width}.${ext}`)
      if (!existsSync(filePath)) return null
      return {
        width,
        height: null,
        url: toPublicUrl(publicDir, filePath),
      }
    })
    .filter(Boolean)
}

function createLegacyEntry(publicDir) {
  const webp = createLegacyVariants(publicDir, 'webp')
  const jpeg = createLegacyVariants(publicDir, 'jpg')
  if (webp.length === 0 && jpeg.length === 0) return null

  let createdAt = new Date(0).toISOString()
  try {
    const samplePath = join(publicDir, 'hub-bg-right-1024.jpg')
    if (existsSync(samplePath)) createdAt = new Date(statSync(samplePath).mtimeMs).toISOString()
  } catch {}

  return {
    id: LEGACY_ENTRY_ID,
    kind: 'legacy',
    label: 'Dotychczasowe tlo',
    sourceName: 'hub-bg-right',
    locked: false,
    createdAt,
    lastSelectedAt: createdAt,
    variants: {
      webp,
      jpeg,
    },
  }
}

function createSpecialEntry(publicDir) {
  const webp = createFixedVariants(publicDir, SPECIAL_ENTRY_DIR, 'webp')
  const jpeg = createFixedVariants(publicDir, SPECIAL_ENTRY_DIR, 'jpg')
  if (webp.length === 0 && jpeg.length === 0) return null

  let createdAt = new Date(0).toISOString()
  try {
    const samplePath = join(publicDir, SPECIAL_ENTRY_DIR, 'hub-bg-right-1024.jpg')
    if (existsSync(samplePath)) createdAt = new Date(statSync(samplePath).mtimeMs).toISOString()
  } catch {}

  return {
    id: SPECIAL_ENTRY_ID,
    kind: 'special',
    label: 'Tlo specjalne: Ela + zegar',
    sourceName: SPECIAL_SOURCE_NAME,
    locked: true,
    protected: true,
    createdAt,
    lastSelectedAt: createdAt,
    variants: {
      webp,
      jpeg,
    },
  }
}

function mergeSystemEntries(entries, systemEntries) {
  const systemIds = new Set(systemEntries.map((entry) => entry.id))
  return entries
    .filter((entry) => !systemIds.has(entry.id))
    .concat(systemEntries)
}

function normalizeVariantList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      const width = Number(item?.width)
      const url = typeof item?.url === 'string' ? item.url : ''
      if (!url || !Number.isFinite(width) || width <= 0) return null
      return {
        width,
        height: Number.isFinite(Number(item?.height)) ? Number(item.height) : null,
        url,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.width - b.width)
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const id = String(entry.id || '').trim()
  if (!id) return null
  return {
    id,
    kind: entry.kind === 'generated' || entry.kind === 'special' ? entry.kind : 'legacy',
    label: String(entry.label || id).trim() || id,
    sourceName: String(entry.sourceName || '').trim() || null,
    locked: entry.locked === true,
    protected: entry.protected === true,
    createdAt: (() => {
      const value = String(entry.createdAt || '').trim()
      return value || new Date(0).toISOString()
    })(),
    lastSelectedAt: (() => {
      const value = String(entry.lastSelectedAt || '').trim()
      return value || String(entry.createdAt || '').trim() || new Date(0).toISOString()
    })(),
    variants: {
      webp: normalizeVariantList(entry.variants?.webp),
      jpeg: normalizeVariantList(entry.variants?.jpeg),
    },
  }
}

function cleanupGeneratedEntry(entry, generatedDir) {
  if (!entry || entry.kind !== 'generated') return
  try {
    const dirPath = join(generatedDir, entry.id)
    rmSync(dirPath, { recursive: true, force: true })
  } catch {}
}

function pickPreviewUrl(entry) {
  return entry.variants.jpeg[0]?.url || entry.variants.webp[0]?.url || null
}

function buildSrcSet(list) {
  return list.map((item) => `${item.url} ${item.width}w`).join(', ')
}

function chooseTargetWidths(originalWidth) {
  const safeWidth = Math.max(1, Math.round(Number(originalWidth) || 0))
  if (!safeWidth) return [640]
  const widths = TARGET_WIDTHS.filter((width) => width < safeWidth)
  widths.push(Math.min(safeWidth, TARGET_WIDTHS[TARGET_WIDTHS.length - 1]))
  return Array.from(new Set(widths)).sort((a, b) => a - b)
}

function sortPreviousEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1
    const bySelected = toEpochMs(b.lastSelectedAt) - toEpochMs(a.lastSelectedAt)
    if (bySelected !== 0) return bySelected
    return toEpochMs(b.createdAt) - toEpochMs(a.createdAt)
  })
}

function toPublicFilePath(publicDir, url) {
  const rel = String(url || '').replace(/^\/+/, '')
  return rel ? join(publicDir, rel) : ''
}

function pickBestVariant(variants, targetWidth) {
  if (!Array.isArray(variants) || variants.length === 0) return null
  const exact = variants.find((variant) => variant.width === targetWidth)
  if (exact) return exact
  const smaller = [...variants]
    .filter((variant) => variant.width < targetWidth)
    .sort((a, b) => b.width - a.width)[0]
  if (smaller) return smaller
  return [...variants].sort((a, b) => a.width - b.width)[0]
}

export function createHubBackgroundStore({
  manifestPath,
  publicDir,
  generatedDir,
}) {
  function buildClientBackgroundVersion(entry) {
    if (!entry) return null
    const stamp = toEpochMs(entry.lastSelectedAt || entry.createdAt || '')
    return `${entry.id}-${stamp || 0}`
  }

  function saveManifest(manifest) {
    try { mkdirSync(dirname(manifestPath), { recursive: true }) } catch {}
    const tmpPath = `${manifestPath}.${process.pid}.tmp`
    writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf8')
    renameSync(tmpPath, manifestPath)
  }

  function syncActiveFiles(manifest) {
    const activeEntry = manifest.entries.find((entry) => entry.id === manifest.activeId)
    if (!activeEntry) return

    for (const format of ['webp', 'jpeg']) {
      const ext = format === 'jpeg' ? 'jpg' : 'webp'
      const variants = activeEntry.variants[format]
      for (const width of TARGET_WIDTHS) {
        const sourceVariant = pickBestVariant(variants, width)
        if (!sourceVariant?.url) continue
        const srcPath = toPublicFilePath(publicDir, sourceVariant.url)
        const dstPath = join(publicDir, `hub-bg-right-${width}.${ext}`)
        if (!srcPath || !existsSync(srcPath)) continue
        if (srcPath === dstPath) continue
        try {
          copyFileSync(srcPath, dstPath)
        } catch {}
      }
    }
  }

  function loadManifest() {
    const legacyEntry = createLegacyEntry(publicDir)
    const specialEntry = createSpecialEntry(publicDir)
    const systemEntries = [legacyEntry, specialEntry].filter(Boolean)
    try {
      if (existsSync(manifestPath)) {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const entries = mergeSystemEntries(
          Array.isArray(raw?.entries)
          ? raw.entries.map(normalizeEntry).filter(Boolean)
          : [],
          systemEntries
        )
        const activeId = String(raw?.activeId || '').trim()
        const normalized = {
          version: 1,
          activeId: entries.some((entry) => entry.id === activeId)
            ? activeId
            : (legacyEntry?.id || specialEntry?.id || entries[0]?.id || ''),
          entries,
        }
        if (!normalized.activeId && legacyEntry) normalized.activeId = legacyEntry.id
        return normalized
      }
    } catch {}

    const fallbackEntries = systemEntries
    const manifest = {
      version: 1,
      activeId: legacyEntry?.id || specialEntry?.id || '',
      entries: fallbackEntries,
    }
    saveManifest(manifest)
    return manifest
  }

  function pruneManifest(manifest) {
    const activeId = manifest.activeId
    const activeEntry = manifest.entries.find((entry) => entry.id === activeId) || null
    if (!activeEntry && manifest.entries[0]) manifest.activeId = manifest.entries[0].id

    const previousEntries = manifest.entries.filter((entry) => entry.id !== manifest.activeId)
    const keptPreviousEntries = sortPreviousEntries(previousEntries)
      .slice(0, MAX_PREVIOUS_HISTORY)
    const protectedIds = manifest.entries
      .filter((entry) => entry.protected)
      .map((entry) => entry.id)

    const keepIds = new Set(
      [manifest.activeId]
        .concat(protectedIds)
        .concat(keptPreviousEntries.map((entry) => entry.id))
        .filter(Boolean)
    )

    const removedEntries = manifest.entries.filter((entry) => !keepIds.has(entry.id))
    for (const entry of removedEntries) cleanupGeneratedEntry(entry, generatedDir)

    manifest.entries = sortEntries(
      manifest.entries.filter((entry) => keepIds.has(entry.id)),
      manifest.activeId
    )
    return manifest
  }

  function ensureManifest() {
    const manifest = pruneManifest(loadManifest())
    saveManifest(manifest)
    syncActiveFiles(manifest)
    return manifest
  }

  function toPublicState(manifest) {
    const entries = sortEntries(manifest.entries, manifest.activeId).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      sourceName: entry.sourceName,
      locked: entry.locked,
      protected: entry.protected === true,
      createdAt: entry.createdAt,
      lastSelectedAt: entry.lastSelectedAt,
      previewUrl: pickPreviewUrl(entry),
      webpSrcSet: buildSrcSet(entry.variants.webp),
      jpegSrcSet: buildSrcSet(entry.variants.jpeg),
      fallbackUrl: entry.variants.jpeg[1]?.url || entry.variants.jpeg[0]?.url || entry.variants.webp[0]?.url || '',
      variants: entry.variants,
      isActive: entry.id === manifest.activeId,
    }))
    return {
      historyLimit: MAX_PREVIOUS_HISTORY,
      activeId: manifest.activeId,
      active: entries.find((entry) => entry.isActive) || null,
      entries,
    }
  }

  async function createGeneratedEntry({ buffer, originalName }) {
    const meta = await sharp(buffer, { failOn: 'error' }).rotate().metadata()
    const originalWidth = Number(meta.width)
    if (!Number.isFinite(originalWidth) || originalWidth <= 0) {
      throw new Error('Nie udalo sie odczytac szerokosci obrazu.')
    }

    const widths = chooseTargetWidths(originalWidth)
    const id = `hubbg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const entryDir = join(generatedDir, id)
    mkdirSync(entryDir, { recursive: true })

    try {
      const variants = { webp: [], jpeg: [] }
      for (const width of widths) {
        const basePipeline = sharp(buffer, { failOn: 'error' })
          .rotate()
          .resize({ width, withoutEnlargement: true })

        const webpPath = join(entryDir, `hub-bg-right-${width}.webp`)
        const webpInfo = await basePipeline
          .clone()
          .webp({ quality: 82, effort: 5 })
          .toFile(webpPath)
        variants.webp.push({
          width: webpInfo.width,
          height: webpInfo.height,
          url: toPublicUrl(publicDir, webpPath),
        })

        const jpegPath = join(entryDir, `hub-bg-right-${width}.jpg`)
        const jpegInfo = await basePipeline
          .clone()
          .jpeg({ quality: 86, mozjpeg: true })
          .toFile(jpegPath)
        variants.jpeg.push({
          width: jpegInfo.width,
          height: jpegInfo.height,
          url: toPublicUrl(publicDir, jpegPath),
        })
      }

      const timestamp = toIsoNow()
      return {
        id,
        kind: 'generated',
        label: originalName ? `Upload: ${originalName}` : `Upload ${timestamp}`,
        sourceName: originalName || null,
        locked: false,
        createdAt: timestamp,
        lastSelectedAt: timestamp,
        variants,
      }
    } catch (error) {
      cleanupGeneratedEntry({ id, kind: 'generated' }, generatedDir)
      throw error
    }
  }

  async function uploadBackground({ buffer, originalName }) {
    const manifest = loadManifest()
    const now = toIsoNow()
    const currentActive = manifest.entries.find((entry) => entry.id === manifest.activeId)
    if (currentActive) currentActive.lastSelectedAt = now

    const newEntry = await createGeneratedEntry({ buffer, originalName })
    manifest.entries = manifest.entries.filter((entry) => entry.id !== newEntry.id)
    manifest.entries.push(newEntry)
    manifest.activeId = newEntry.id
    const nextManifest = pruneManifest(manifest)
    saveManifest(nextManifest)
    syncActiveFiles(nextManifest)
    return toPublicState(loadManifest())
  }

  function activateBackground(id) {
    const targetId = String(id || '').trim()
    const manifest = loadManifest()
    const target = manifest.entries.find((entry) => entry.id === targetId)
    if (!target) {
      const error = new Error('Wybrane tlo nie istnieje.')
      error.code = 'background.not_found'
      throw error
    }
    const now = toIsoNow()
    const currentActive = manifest.entries.find((entry) => entry.id === manifest.activeId)
    if (currentActive) currentActive.lastSelectedAt = now
    target.lastSelectedAt = now
    manifest.activeId = target.id
    const nextManifest = pruneManifest(manifest)
    saveManifest(nextManifest)
    syncActiveFiles(nextManifest)
    return toPublicState(loadManifest())
  }

  function setBackgroundLocked(id, locked) {
    const targetId = String(id || '').trim()
    const manifest = loadManifest()
    const target = manifest.entries.find((entry) => entry.id === targetId)
    if (!target) {
      const error = new Error('Wybrane tlo nie istnieje.')
      error.code = 'background.not_found'
      throw error
    }
    if (target.protected) {
      const error = new Error('Tlo specjalne jest zarzadzane przez system i nie mozna zmienic jego blokady.')
      error.code = 'background.protected'
      throw error
    }
    target.locked = locked === true
    saveManifest(pruneManifest(manifest))
    return toPublicState(loadManifest())
  }

  function deleteBackground(id) {
    const targetId = String(id || '').trim()
    const manifest = loadManifest()
    const target = manifest.entries.find((entry) => entry.id === targetId)
    if (!target) {
      const error = new Error('Wybrane tlo nie istnieje.')
      error.code = 'background.not_found'
      throw error
    }
    if (target.protected) {
      const error = new Error('Tla specjalnego nie mozna usunac.')
      error.code = 'background.protected'
      throw error
    }
    if (target.locked) {
      const error = new Error('Nie mozna usunac tla oznaczonego jako lock. Najpierw je odblokuj.')
      error.code = 'background.locked'
      throw error
    }

    const remainingEntries = manifest.entries.filter((entry) => entry.id !== targetId)
    if (remainingEntries.length === 0) {
      const error = new Error('Nie mozna usunac ostatniego dostepnego tla.')
      error.code = 'background.last_entry'
      throw error
    }

    if (manifest.activeId === targetId) {
      const nextActive = sortEntries(remainingEntries, '')
        .find(Boolean)
      manifest.activeId = nextActive?.id || remainingEntries[0].id
    }

    manifest.entries = remainingEntries
    cleanupGeneratedEntry(target, generatedDir)
    const nextManifest = pruneManifest(manifest)
    saveManifest(nextManifest)
    syncActiveFiles(nextManifest)
    return toPublicState(loadManifest())
  }

  return {
    ensureManifest,
    getState: () => toPublicState(loadManifest()),
    getClientState: () => {
      const manifest = loadManifest()
      const activeEntry = manifest.entries.find((entry) => entry.id === manifest.activeId) || null
      return {
        activeSpecialBackgroundId: activeEntry?.kind === 'special' ? activeEntry.id : null,
        activeBackgroundVersion: buildClientBackgroundVersion(activeEntry),
      }
    },
    uploadBackground,
    activateBackground,
    setBackgroundLocked,
    deleteBackground,
  }
}
