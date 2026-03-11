import { useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download } from 'lucide-react'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import type { Article } from '@/features/news/useArticles'
import { formatArticleDate } from '@/features/news/useArticles'

// ── HTML helpers ──────────────────────────────────────────────────────────────

function extractPdfUrl(html?: string): string | null {
  if (!html) return null
  const link = html.match(/<a[^>]+href=["']([^"']+\.pdf)(?:\?[^"']*)?["'][^>]*>\s*Pobierz\s+PDF\s*<\/a>/i)
  if (link) return link[1]
  const iframe = html.match(/<iframe[^>]+src=["']([^"']+\.pdf)(?:\?[^"']*)?["']/i)
  if (iframe) return iframe[1]
  const a = html.match(/<a[^>]+href=["']([^"']+\.pdf)(?:\?[^"']*)?["']/i)
  return a ? a[1] : null
}

function extractDocxUrl(html?: string): string | null {
  if (!html) return null
  const link = html.match(/<a[^>]+href=["']([^"']+\.(?:docx|doc))(?:\?[^"']*)?["'][^>]*>\s*Pobierz\s+plik\s+DOCX\s*<\/a>/i)
  if (link) return link[1]
  const viewer = html.match(/<iframe[^>]+src=["']https?:\/\/view\.officeapps\.live\.com\/op\/embed\.aspx\?src=([^"']+)["']/i)
  if (viewer) { try { return decodeURIComponent(viewer[1]) } catch { return viewer[1] } }
  return null
}

function extractImageUrl(html?: string): string | null {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"'>]+)["']/i)
  return m ? m[1] : null
}

// ── Download badge ────────────────────────────────────────────────────────────

type BadgeColor = 'emerald' | 'blue' | 'indigo'
const BADGE_COLORS: Record<BadgeColor, { bg: string; border: string; text: string }> = {
  emerald: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)', text: '#6ee7b7' },
  blue:    { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.28)',  text: '#93c5fd' },
  indigo:  { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.28)',  text: '#a5b4fc' },
}

function DownloadBadge({ href, label, color }: { href: string; label: string; color: BadgeColor }) {
  const c = BADGE_COLORS[color]
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12px] font-medium transition-opacity hover:opacity-75"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
      onClick={e => e.stopPropagation()}
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </a>
  )
}

// ── Close button ──────────────────────────────────────────────────────────────

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', color: 'rgba(237,234,228,0.5)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
      aria-label="Zamknij"
    >
      <X className="w-4 h-4" />
    </button>
  )
}

// ── Article panel content ─────────────────────────────────────────────────────

export function ArticlePanelContent({ article, onClose }: { article: Article; onClose: () => void }) {
  const content = useMemo(() => sanitizeArticleHtml(article.content_html), [article.content_html])
  const docxUrl = useMemo(() => extractDocxUrl(article.content_html), [article.content_html])
  const pdfUrl  = useMemo(() => extractPdfUrl(article.content_html),  [article.content_html])
  const imgUrl  = useMemo(() => extractImageUrl(article.content_html), [article.content_html])
  const date    = formatArticleDate(article.date)

  return (
    <>
      {/* Header */}
      <div
        className="shrink-0 px-5 pt-5 pb-4 flex items-start gap-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex-1 min-w-0">
          <h2
            className="font-bricolage text-[19px] font-semibold leading-snug m-0"
            style={{ color: '#edeae4' }}
          >
            {article.title}
          </h2>
          {date ? (
            <p className="mt-1.5 text-[12px] font-medium m-0" style={{ color: 'var(--hub-accent)' }}>
              {date}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {docxUrl ? <DownloadBadge href={docxUrl} label="DOCX"  color="emerald" /> : null}
          {pdfUrl  ? <DownloadBadge href={pdfUrl}  label="PDF"   color="blue"    /> : null}
          {imgUrl  ? <DownloadBadge href={imgUrl}  label="Obraz" color="indigo"  /> : null}
          <CloseBtn onClick={onClose} />
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-5 py-5">
        <div
          className="hub-article-body"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </>
  )
}

// ── Right panel shell ─────────────────────────────────────────────────────────

export { CloseBtn }

export function RightPanelShell({
  open,
  contentKey,
  onClose,
  children,
}: {
  open: boolean
  contentKey: string
  onClose: () => void
  children: React.ReactNode
}) {
  // ESC key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — covers the area right of the sidebar, click closes */}
          <motion.div
            key="rp-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-0 bottom-0 right-0 z-[15]"
            style={{ left: '430px', background: 'rgba(0,0,0,0.28)', cursor: 'default' }}
            onClick={onClose}
          />

          {/* Panel — slides out from the sidebar's right edge */}
          <motion.div
            key="rp-panel"
            initial={{ x: -56, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -56, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.8 }}
            className="fixed top-0 bottom-0 z-[20] flex flex-col overflow-hidden"
            style={{
              left: '430px',
              width: 'min(580px, calc(100vw - 454px))',
              background: 'rgba(11,11,15,0.92)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRight: '1px solid rgba(255,255,255,0.09)',
              borderBottom: '1px solid rgba(255,255,255,0.09)',
              borderLeft: 'none',
              backdropFilter: 'blur(36px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.5)',
              borderRadius: '0 18px 18px 0',
              boxShadow: '8px 0 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Inner content — crossfades when contentKey changes */}
            <AnimatePresence mode="wait">
              <motion.div
                key={contentKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.13 } }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
