import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ExternalLink, Newspaper, FileText, X, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Article } from "./useArticles";
import { formatArticleDate, useArticles } from "./useArticles";
import { sanitizeArticleHtml } from "@/lib/sanitize";

function stripHtml(html?: string): string {
  if (!html) return "";
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const tmp = typeof window !== "undefined" ? document.createElement("div") : null;
  if (!tmp) return text.replace(/<[^>]*>/g, " ");
  tmp.innerHTML = text;
  return tmp.textContent || tmp.innerText || "";
}

function pickFirstImage(html?: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match ? match[1] : null;
}

function hasPdfEmbed(html?: string): boolean {
  if (!html) return false;
  return /<iframe[^>]+src=["'][^"']+\.pdf["']/i.test(html);
}
function extractPdfUrl(html?: string): string | null {
  if (!html) return null;
  const linkMatch = html.match(/<a[^>]+href=["']([^"']+\.pdf)(?:\?[^"']*)?["'][^>]*>\s*Pobierz\s+PDF\s*<\/a>/i);
  if (linkMatch) return linkMatch[1];
  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+\.pdf)(?:\?[^"']*)?["']/i);
  if (iframeMatch) return iframeMatch[1];
  const aMatch = html.match(/<a[^>]+href=["']([^"']+\.pdf)(?:\?[^"']*)?["']/i);
  return aMatch ? aMatch[1] : null;
}

function extractFirstImageUrl(html?: string): string | null {
  if (!html) return null;
  const imgMatch = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

function hasDocxEmbed(html?: string): boolean {
  if (!html) return false;
  return /<iframe[^>]+src=["']https?:\/\/view\.officeapps\.live\.com\/op\/embed\.aspx\?src=[^"']+["']/i.test(html);
}

function extractDocxDirectUrl(html?: string): string | null {
  if (!html) return null;
  const linkMatch = html.match(/<a[^>]+href=["']([^"']+\.(?:docx|doc))(?:\?[^"']*)?["'][^>]*>\s*Pobierz\s+plik\s+DOCX\s*<\/a>/i);
  if (linkMatch) return linkMatch[1];
  const viewerMatch = html.match(/<iframe[^>]+src=["']https?:\/\/view\.officeapps\.live\.com\/op\/embed\.aspx\?src=([^"']+)["']/i);
  if (viewerMatch) {
    try { return decodeURIComponent(viewerMatch[1]); } catch { return viewerMatch[1]; }
  }
  return null;
}

function getExcerpt(article: Article, maxLen = 140) {
  const plain = stripHtml(article.content_html);
  const s = plain.replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).replace(/[,;:.!\-\s]+\S*$/, "") + "…";
}

// ── Article modal (redesigned) ────────────────────────────────────────────────

function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  const date = formatArticleDate(article.date);
  const content = useMemo(() => sanitizeArticleHtml(article.content_html), [article.content_html]);
  const docxUrl = useMemo(() => extractDocxDirectUrl(article.content_html), [article.content_html]);
  const pdfUrl = useMemo(() => extractPdfUrl(article.content_html), [article.content_html]);
  const imageUrl = useMemo(() => extractFirstImageUrl(article.content_html), [article.content_html]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        style={{
          borderRadius: '20px',
          background: 'rgba(14,14,17,0.92)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start gap-4 shrink-0 px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex-1 min-w-0">
            <h3
              className="font-bricolage text-[18px] font-semibold leading-snug m-0"
              style={{ color: '#edeae4' }}
            >
              {article.title}
            </h3>
            {date ? (
              <div className="mt-1 text-[12px]" style={{ color: 'var(--hub-accent)' }}>{date}</div>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {docxUrl ? (
              <a
                href={docxUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-3.5 h-3.5" /> DOCX
              </a>
            ) : null}
            {pdfUrl ? (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </a>
            ) : null}
            {imageUrl ? (
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-3.5 h-3.5" /> Obraz
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg w-8 h-8 transition"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,234,228,0.6)' }}
              aria-label="Zamknij"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <div
            className="prose max-w-none prose-headings:mt-6 prose-headings:mb-3 prose-p:my-3 prose-li:my-1 prose-img:rounded-xl prose-a:underline"
            style={{
              '--tw-prose-body': '#d4d0c8',
              '--tw-prose-headings': '#edeae4',
              '--tw-prose-links': 'var(--hub-accent)',
              '--tw-prose-bold': '#edeae4',
              '--tw-prose-code': '#edeae4',
              '--tw-prose-quotes': '#a8a29e',
            } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}

// ── Grid news card (default variant) ─────────────────────────────────────────

function NewsCard({ article, index, onOpen }: { article: Article; index: number; onOpen: (a: Article) => void }) {
  const img = useMemo(() => pickFirstImage(article.content_html), [article.content_html]);
  const pdf = useMemo(() => hasPdfEmbed(article.content_html), [article.content_html]);
  const docx = useMemo(() => hasDocxEmbed(article.content_html), [article.content_html]);
  const date = formatArticleDate(article.date);
  const showExcerpt = !pdf && !img;
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(article)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="news-item block text-left p-0 m-0 bg-transparent focus:outline-none focus:ring-0 h-full w-full"
      style={{ background: "transparent", border: "none" }}
    >
      <Card className="news-card h-full overflow-hidden bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-0 shadow-lg hover:shadow-xl transition-shadow">
        {img ? (
          <div className="relative h-28 w-full overflow-hidden">
            <img src={img} alt="" className="h-full w-full object-cover" />
            {pdf || docx ? (
              <span className="absolute right-2 top-2">
                <Badge className="bg-slate-900/90 text-white border-slate-900/90 inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {pdf ? 'PDF' : 'DOCX'}
                </Badge>
              </span>
            ) : null}
          </div>
        ) : null}
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-base sm:text-lg line-clamp-2 text-slate-900">{article.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 flex-1 flex flex-col">
          {pdf ? (
            <p className="text-xs sm:text-sm text-slate-700">Podgląd dokumentu PDF</p>
          ) : docx ? (
            <p className="text-xs sm:text-sm text-slate-700">Podgląd dokumentu DOCX</p>
          ) : showExcerpt ? (
            <p className="text-xs sm:text-sm text-slate-700 line-clamp-2">{getExcerpt(article)}</p>
          ) : null}
          <div className="mt-auto pt-3 flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{date || "—"}</span>
            <span className="inline-flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" />
              Otwórz
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.button>
  );
}

// ── Sidebar news list ─────────────────────────────────────────────────────────

function NewsSidebarList({
  articles,
  onOpen,
}: {
  articles: Article[]
  onOpen: (a: Article) => void
}) {
  const featured = articles[0] ?? null
  const rest = articles.slice(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)

  const updateThumb = useCallback(() => {
    const el = scrollRef.current
    const thumb = thumbRef.current
    const wrap = wrapRef.current
    if (!el || !thumb || !wrap) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const scrollable = scrollHeight - clientHeight
    const ratio = scrollable > 0 ? scrollTop / scrollable : 0
    const thumbH = Math.max(28, (clientHeight / scrollHeight) * clientHeight)
    const maxTop = clientHeight - thumbH
    thumb.style.height = thumbH + 'px'
    thumb.style.top = (ratio * maxTop) + 'px'
    wrap.classList.toggle('at-bottom', ratio > 0.92)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateThumb, { passive: true })
    updateThumb()
    return () => el.removeEventListener('scroll', updateThumb)
  }, [updateThumb])

  // Re-run thumb calc when articles change
  useEffect(() => { updateThumb() }, [articles, updateThumb])

  return (
    <>
      {/* News header row */}
      <div className="flex items-center justify-between px-6 shrink-0" style={{ paddingBottom: '12px' }}>
        <div
          className="text-[10.5px] font-semibold tracking-[0.13em] uppercase"
          style={{ color: 'var(--hub-text-muted)' }}
        >
          Aktualności
        </div>
        {articles.length > 0 ? (
          <div className="text-[11.5px] tracking-[0.02em]" style={{ color: 'var(--hub-text-muted)' }}>
            {articles.length} {articles.length === 1 ? 'wpis' : articles.length < 5 ? 'wpisy' : 'wpisów'}
          </div>
        ) : null}
      </div>

      {/* Featured article */}
      {featured ? (
        <button
          type="button"
          onClick={() => onOpen(featured)}
          className="hub-news-featured hub-fade-up text-left"
          style={{ animationDelay: '0.05s' }}
        >
          <div
            className="text-[10px] font-semibold tracking-[0.1em] uppercase mb-1.5 flex items-center gap-[5px]"
            style={{ color: 'var(--hub-accent)' }}
          >
            <span
              style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: 'var(--hub-accent)', display: 'inline-block', flexShrink: 0,
              }}
            />
            Najnowsze
          </div>
          <div
            className="font-bricolage text-[14.5px] font-semibold leading-[1.35]"
            style={{ color: 'var(--hub-text-primary)' }}
          >
            {featured.title}
          </div>
          {featured.date ? (
            <div className="mt-[5px] text-[11px]" style={{ color: 'var(--hub-text-secondary)' }}>
              {formatArticleDate(featured.date)}
            </div>
          ) : null}
        </button>
      ) : null}

      {/* Scrollable list */}
      <div className="hub-news-wrap" ref={wrapRef}>
        <div className="hub-news-scroll" ref={scrollRef}>
          {rest.map((article, idx) => (
            <button
              key={article.url + idx}
              type="button"
              onClick={() => onOpen(article)}
              className="hub-news-item hub-fade-up"
              style={{ animationDelay: `${0.22 + idx * 0.04}s` }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] tracking-[0.03em]" style={{ color: 'var(--hub-text-muted)' }}>
                  {formatArticleDate(article.date) || '—'}
                </span>
                <span
                  className="text-[10.5px] flex items-center gap-[3px] opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: 'var(--hub-accent)' }}
                >
                  <ExternalLink className="w-[9px] h-[9px]" />
                  Otwórz
                </span>
              </div>
              <div
                className="text-[13.5px] font-medium leading-[1.4] line-clamp-2"
                style={{ color: 'var(--hub-text-primary)' }}
              >
                {article.title}
              </div>
              {getExcerpt(article, 90) ? (
                <div
                  className="mt-[3px] text-[11.5px] leading-[1.45] line-clamp-1"
                  style={{ color: 'var(--hub-text-secondary)' }}
                >
                  {getExcerpt(article, 90)}
                </div>
              ) : null}
            </button>
          ))}
        </div>

        {/* Custom scroll thumb */}
        <div className="absolute right-[-8px] top-0 bottom-0 w-[3px]">
          <div
            ref={thumbRef}
            className="absolute right-0 w-[3px] rounded-full transition-opacity"
            style={{
              background: 'var(--hub-accent)',
              opacity: 0.45,
              top: 0,
              height: '30%',
            }}
          />
        </div>
      </div>
    </>
  )
}

// ── NewsSection (public API) ──────────────────────────────────────────────────

export default function NewsSection({
  reloadSignal = 0,
  variant = 'grid',
}: {
  reloadSignal?: number
  variant?: 'grid' | 'sidebar'
}) {
  const [selected, setSelected] = useState<Article | null>(null);
  const modalHistoryActiveRef = useRef(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const { articles, loading, error } = useArticles({ reloadSignal });
  const pageCount = Math.max(1, Math.ceil((articles?.length || 0) / pageSize));
  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return articles.slice(start, start + pageSize);
  }, [articles, page]);

  const openArticle = useCallback((article: Article) => {
    setSelected(article);
    if (typeof window === "undefined") return;
    window.history.pushState({ ...(window.history.state ?? {}), __newsModal: true }, "");
    modalHistoryActiveRef.current = true;
  }, []);

  const closeArticle = useCallback(() => {
    setSelected(null);
    if (typeof window === "undefined") return;
    if (!modalHistoryActiveRef.current) return;
    modalHistoryActiveRef.current = false;
    window.history.back();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onPopState = () => {
      if (!modalHistoryActiveRef.current) return;
      modalHistoryActiveRef.current = false;
      setSelected(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selected]);

  // ── Sidebar variant ──────────────────────────────────────────────────────
  if (variant === 'sidebar') {
    if (loading) {
      return (
        <div className="flex-1 min-h-0 flex flex-col">
          <div
            className="text-[10.5px] font-semibold tracking-[0.13em] uppercase px-6 pb-3 shrink-0"
            style={{ color: 'var(--hub-text-muted)' }}
          >
            Aktualności
          </div>
          <div className="px-3 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[10px] animate-pulse"
                style={{ height: '56px', background: 'rgba(255,255,255,0.05)' }}
              />
            ))}
          </div>
        </div>
      )
    }
    if (error) {
      return (
        <div className="px-6 py-3 text-[12px]" style={{ color: 'rgba(248,113,113,0.8)' }}>
          Nie udało się wczytać aktualności
        </div>
      )
    }
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <NewsSidebarList articles={articles} onOpen={openArticle} />
        {selected ? <ArticleModal article={selected} onClose={closeArticle} /> : null}
      </div>
    )
  }

  // ── Grid variant (default) ───────────────────────────────────────────────
  return (
    <section className="w-full max-w-5xl mx-auto">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-white/95">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Newspaper className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-semibold">Aktualności</h2>
        </div>
        <div className="w-full overflow-visible sm:w-auto">
          <div className="flex flex-wrap items-center gap-2 py-2 sm:justify-end">
            {Array.from({ length: pageCount }).map((_, i) => {
              const p = i + 1;
              const isActive = p === page;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={isActive ? "page" : undefined}
                  className={`h-8 w-8 shrink-0 inline-flex items-center justify-center text-sm font-semibold rounded-full transition focus:outline-none ${
                    isActive
                      ? "bg-white text-slate-900 shadow-lg ring-2 ring-white/70"
                      : "bg-white/16 text-white hover:bg-white/24 ring-1 ring-white/25"
                  }`}
                  title={`Strona ${p}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-200">Nie udało się wczytać aktualności: {error}</div>
      ) : (
        <div className="news-grid-row">
          {visible.map((a, idx) => (
            <NewsCard key={a.url + idx} article={a} index={idx} onOpen={openArticle} />
          ))}
        </div>
      )}
      {selected ? <ArticleModal article={selected} onClose={closeArticle} /> : null}
    </section>
  );
}
