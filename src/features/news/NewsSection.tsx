import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Newspaper, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Article } from "./useArticles";
import { formatArticleDate, useArticles } from "./useArticles";

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

function getExcerpt(article: Article, maxLen = 140) {
  const plain = stripHtml(article.content_html);
  const s = plain.replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).replace(/[,;:.!\-\s]+\S*$/, "") + "…";
}

function NewsCard({ article, index, onOpen }: { article: Article; index: number; onOpen: (a: Article) => void }) {
  const img = useMemo(() => pickFirstImage(article.content_html), [article.content_html]);
  const pdf = useMemo(() => hasPdfEmbed(article.content_html), [article.content_html]);
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
            {pdf ? (
              <span className="absolute right-2 top-2">
                <Badge className="bg-slate-900/90 text-white border-slate-900/90 inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Badge>
              </span>
            ) : null}
          </div>
        ) : null}
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-base sm:text-lg line-clamp-2">{article.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 flex-1 flex flex-col">
          {pdf ? (
            <p className="text-xs sm:text-sm text-slate-700">Podgląd dokumentu PDF</p>
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

function sanitizeHtml(html?: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("script, style").forEach((el) => el.remove());
  container.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if ((name === "href" || name === "src") && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    });
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer noopener");
    }
    if (el.tagName === "IFRAME") {
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
      el.setAttribute("style", "border:1px solid #ddd; width:100%;");
    }
  });
  return container.innerHTML;
}

function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  const date = formatArticleDate(article.date);
  const content = useMemo(() => sanitizeHtml(article.content_html), [article.content_html]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Zamknij podgląd" />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 text-zinc-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-6">
            <div>
              <h3 className="m-0 text-xl font-semibold leading-snug">{article.title}</h3>
              <div className="mt-1 text-sm text-zinc-400">{date}</div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
            >
              Zamknij
            </button>
          </div>
          <div className="p-4 sm:p-6">
            <div className="prose prose-invert max-w-none prose-headings:mt-6 prose-headings:mb-3 prose-p:my-3 prose-li:my-1 prose-img:rounded-xl prose-a:text-sky-400"
                 dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewsSection() {
  const [selected, setSelected] = useState<Article | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const { articles, loading, error } = useArticles();
  const pageCount = Math.max(1, Math.ceil((articles?.length || 0) / pageSize));
  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return articles.slice(start, start + pageSize);
  }, [articles, page]);
  return (
    <section className="w-full max-w-5xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/95">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Newspaper className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-semibold">Aktualności</h2>
        </div>
        <div className="inline-flex items-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => {
            const p = i + 1;
            const isActive = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={isActive ? "page" : undefined}
                className={`h-8 w-8 inline-flex items-center justify-center text-sm font-semibold rounded-full transition focus:outline-none ${
                  isActive
                    ? "bg-white text-slate-900 shadow-lg ring-2 ring-white/70 scale-105"
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
            <NewsCard key={a.url + idx} article={a} index={idx} onOpen={setSelected} />
          ))}
        </div>
      )}
      {selected ? <ArticleModal article={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}


