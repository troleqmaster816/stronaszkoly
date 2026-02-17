import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileText, List, Loader2, Menu, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { sanitizeStatutHtml } from "@/lib/sanitize";

type StatutContentParagraph = { type: "paragraph"; html: string };
type StatutContentSubheading = { type: "subheading"; text: string };
type StatutContentListItem = {
  type: "list_item";
  level: number;
  number: string;
  text: string;
  children?: StatutContentListItem[];
};
type StatutContentBlock =
  | StatutContentParagraph
  | StatutContentSubheading
  | StatutContentListItem;

type StatutSection = {
  id: string;
  title: string;
  content: StatutContentBlock[];
};

type StatutChapter = {
  id: string;
  title: string;
  sections: StatutSection[];
};

type StatutTocItem = { text: string; link: string };

type StatutJson = {
  documentTitle: string;
  documentSubtitles: string[];
  legalBasis: string[];
  tableOfContents: StatutTocItem[];
  chapters: StatutChapter[];
};

type StatutViewerProps = {
  jsonSrc?: string;
};

export default function StatutSzkolnyViewer({ jsonSrc = "/statut.json" }: StatutViewerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<StatutJson | null>(null);

  const [draftQuery, setDraftQuery] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [currentMatch, setCurrentMatch] = useState<number>(0);
  const [totalMatches, setTotalMatches] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(jsonSrc, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: StatutJson) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Statut JSON load error", e);
        setError("Nie udało się wczytać pliku statutu.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jsonSrc]);

  const onSearch = useCallback(() => {
    setQuery(draftQuery.trim());
    setCurrentMatch(0);
    // Close drawer on mobile to present results immediately
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [draftQuery]);

  const collectMarks = useCallback(() => {
    const root = contentRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll("mark")) as HTMLElement[];
  }, []);

  const activateMatch = useCallback((index: number) => {
    const marks = collectMarks();
    if (marks.length === 0) {
      setTotalMatches(0);
      setCurrentMatch(0);
      return;
    }
    const clamped = ((index % marks.length) + marks.length) % marks.length;
    // clear previous
    for (const m of marks) {
      m.removeAttribute("data-active");
      m.classList.remove("ring-2", "ring-amber-400", "bg-yellow-300");
    }
    const target = marks[clamped];
    target.setAttribute("data-active", "true");
    target.classList.add("ring-2", "ring-amber-400", "bg-yellow-300");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTotalMatches(marks.length);
    setCurrentMatch(clamped + 1);
  }, [collectMarks]);

  useEffect(() => {
    // After query or data changes, wait for DOM to paint highlighted marks and then focus the first
    if (!query) {
      setTotalMatches(0);
      setCurrentMatch(0);
      return;
    }
    const id = requestAnimationFrame(() => activateMatch(0));
    return () => cancelAnimationFrame(id);
  }, [query, data, activateMatch]);

  // Lock background scroll when mobile drawer is open
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (!isMobile || !sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const goToNext = useCallback(() => {
    const marks = collectMarks();
    if (marks.length === 0) return;
    activateMatch((currentMatch || 1));
  }, [collectMarks, activateMatch, currentMatch]);

  const goToPrev = useCallback(() => {
    const marks = collectMarks();
    if (marks.length === 0) return;
    activateMatch((currentMatch - 2));
  }, [collectMarks, activateMatch, currentMatch]);

  const scrollToLink = useCallback((href: string) => {
    const id = href.startsWith("#") ? href.slice(1) : href;
    const root = contentRef.current;
    if (!root) return;
    const el = root.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setSidebarOpen(false);
    }
  }, []);

  const cleanedToc = useMemo(() => {
    return (data?.tableOfContents || []).map((t) => ({
      ...t,
      text: t.text.replace(/\s*\d+\s*$/, "").trim(),
    }));
  }, [data]);

  return (
    <div className="w-full min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-zinc-200 bg-white/90 backdrop-blur px-3 py-2 dark:bg-zinc-900/80 dark:border-zinc-800">
        <button
          className="inline-flex md:hidden p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => setSidebarOpen((s) => !s)}
          aria-label="Pokaż/ukryj panel boczny"
        >
          <Menu className="h-5 w-5" />
        </button>
        <FileText className="h-5 w-5" />
        <div className="font-semibold truncate">Statut szkoły</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-zinc-400" />
            <input
              className="w-[280px] pl-8 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-sm"
              placeholder="Szukaj w statucie…"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            />
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-xs text-zinc-500 w-[64px] text-right tabular-nums">{totalMatches > 0 ? `${currentMatch}/${totalMatches}` : "0/0"}</span>
            <button
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Poprzedni wynik"
              onClick={goToPrev}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Następny wynik"
              onClick={goToNext}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:block">
          <div className="md:sticky md:top-[45px] h-[calc(100vh-45px)] bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <List className="h-4 w-4" />
              <div className="font-medium">Spis treści</div>
            </div>
            <div>
              {loading ? (
                <div className="text-sm text-zinc-500">Wczytywanie…</div>
              ) : error ? (
                <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
              ) : cleanedToc.length === 0 ? (
                <div className="text-sm text-zinc-500">Brak spisu treści</div>
              ) : (
                <ul className="space-y-1">
                  {cleanedToc.map((t, idx) => (
                    <li key={`${t.link}-${idx}`}>
                      <button
                        className="text-left w-full rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => scrollToLink(t.link)}
                      >
                        <div className="text-sm leading-snug truncate">{t.text}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-[calc(100vh-45px)]">
          <div className="mx-auto max-w-4xl px-3 md:px-6 py-6">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 md:p-6 shadow-sm">
              {loading && (
                <div className="flex items-center justify-center py-16 text-zinc-500 gap-2"><Loader2 className="h-5 w-5 animate-spin"/> Wczytywanie dokumentu…</div>
              )}
              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
              )}
              {!loading && !error && data && (
                <article ref={contentRef} className="max-w-none">
                  <Header data={data} />
                  <div className="h-px my-4 bg-zinc-200 dark:bg-zinc-800" />
                  <DocumentBody data={data} query={query} />
                </article>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 mt-3">
              <div>Źródło: <code className="text-[11px]">{jsonSrc}</code></div>
              <div>Tryb: JSON • nawigacja • wyszukiwanie</div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <MobileDrawer
          onClose={() => setSidebarOpen(false)}
          toc={cleanedToc}
          onNavigate={scrollToLink}
          draftQuery={draftQuery}
          setDraftQuery={setDraftQuery}
          onSearch={onSearch}
          currentMatch={currentMatch}
          totalMatches={totalMatches}
          goToPrev={goToPrev}
          goToNext={goToNext}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

function MobileDrawer({
  onClose,
  toc,
  onNavigate,
  draftQuery,
  setDraftQuery,
  onSearch,
  currentMatch,
  totalMatches,
  goToPrev,
  goToNext,
  loading,
  error,
}: {
  onClose: () => void;
  toc: { text: string; link: string }[];
  onNavigate: (href: string) => void;
  draftQuery: string;
  setDraftQuery: (v: string) => void;
  onSearch: () => void;
  currentMatch: number;
  totalMatches: number;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-[88%] max-w-[360px] bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-3 overflow-y-auto shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <List className="h-4 w-4" />
          <div className="font-medium">Spis treści</div>
          <button className="ml-auto p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClose} aria-label="Zamknij panel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3">
          <label className="sr-only" htmlFor="search-mobile">Wyszukaj</label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-zinc-400" />
            <input
              id="search-mobile"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-sm"
              placeholder="Szukaj w statucie…"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <button
              onClick={onSearch}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm hover:opacity-90 dark:bg-white dark:text-zinc-900"
            >Szukaj</button>
            <button
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Poprzedni wynik"
              onClick={goToPrev}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Następny wynik"
              onClick={goToNext}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">{totalMatches > 0 ? `${currentMatch}/${totalMatches}` : "0/0"}</div>
        </div>

        <div>
          {loading ? (
            <div className="text-sm text-zinc-500">Wczytywanie…</div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : toc.length === 0 ? (
            <div className="text-sm text-zinc-500">Brak spisu treści</div>
          ) : (
            <ul className="space-y-1">
              {toc.map((t, idx) => (
                <li key={`${t.link}-${idx}`}>
                  <button
                    className="text-left w-full rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => { onNavigate(t.link); onClose(); }}
                  >
                    <div className="text-sm leading-snug truncate">{t.text}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ data }: { data: StatutJson }) {
  return (
    <header className="text-center">
      <h1 id="document-title" className="text-2xl md:text-3xl font-extrabold tracking-wide">
        {data.documentTitle}
      </h1>
      {data.documentSubtitles?.length > 0 && (
        <div className="mt-1 space-y-0.5 text-sm md:text-base text-zinc-600 dark:text-zinc-300">
          {data.documentSubtitles.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
      )}
      {data.legalBasis?.length > 0 && (
        <section className="mt-4 text-left">
          <h2 className="text-base md:text-lg font-semibold">Podstawa prawna</h2>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm md:text-base">
            {data.legalBasis.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </section>
      )}
    </header>
  );
}

function DocumentBody({ data, query }: { data: StatutJson; query: string }) {
  return (
    <div className="mt-6 space-y-8">
      {data.chapters.map((ch) => (
        <section key={ch.id}>
          <h2 id={ch.id} className="scroll-mt-24 text-xl md:text-2xl font-bold tracking-tight">
            {ch.title}
          </h2>
          <div className="mt-3 space-y-6">
            {ch.sections.map((sec) => (
              <article key={sec.id}>
                <h3 id={sec.id} className="scroll-mt-24 text-lg md:text-xl font-semibold">
                  {sec.title}
                </h3>
                <div className="mt-2 space-y-3">
                  {sec.content.map((block, idx) => (
                    <ContentBlockRenderer key={idx} block={block} query={query} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ContentBlockRenderer({ block, query }: { block: StatutContentBlock; query: string }) {
  switch (block.type) {
    case "paragraph": {
      const html = sanitizeStatutHtml(query ? highlightHtml(block.html, query) : block.html);
      return (
        <p
          className="leading-relaxed text-[15px] md:text-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    case "subheading": {
      return (
        <div className="mt-2 font-medium text-[15px] md:text-base">
          {renderHighlightedText(block.text, query)}
        </div>
      );
    }
    case "list_item": {
      return <ListItem item={block} query={query} />;
    }
  }
}

function ListItem({ item, query }: { item: StatutContentListItem; query: string }) {
  const marginLeft = Math.max(0, (item.level - 1) * 16);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr] items-start gap-2" style={{ marginLeft }}>
        <span className="text-sm md:text-base tabular-nums text-zinc-600 dark:text-zinc-400 select-none min-w-[2.25rem]">
          {item.number}
        </span>
        <div className="text-[15px] md:text-base leading-relaxed">
          {renderHighlightedText(item.text, query)}
        </div>
      </div>
      {item.children && item.children.length > 0 && (
        <div className="space-y-2">
          {item.children.map((child, idx) => (
            <ListItem key={idx} item={child} query={query} />
          ))}
        </div>
      )}
    </div>
  );
}

function renderHighlightedText(text: string, query: string) {
  if (!query) return text;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(safe, "gi");
  const parts: Array<string | ReactNode> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark key={start} className="px-0.5 rounded bg-yellow-200/70">
        {text.slice(start, end)}
      </mark>
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function highlightHtml(html: string, query: string): string {
  if (!query) return html;
  try {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const walk = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walk.nextNode())) {
      const t = n as Text;
      if ((t.nodeValue || "").trim()) targets.push(t);
    }
    for (const t of targets) {
      const value = t.nodeValue || "";
      if (!regex.test(value)) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;
      const parts: (string | HTMLElement)[] = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(value))) {
        const start = m.index;
        const end = start + m[0].length;
        if (start > lastIndex) parts.push(value.slice(lastIndex, start));
        const mark = document.createElement("mark");
        mark.className = "px-0.5 rounded bg-yellow-200/70";
        mark.textContent = value.slice(start, end);
        parts.push(mark);
        lastIndex = end;
      }
      if (lastIndex < value.length) parts.push(value.slice(lastIndex));
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (typeof p === 'string') frag.append(p);
        else frag.append(p);
      }
      t.parentNode?.replaceChild(frag, t);
    }
    return wrapper.innerHTML;
  } catch {
    return html;
  }
}
