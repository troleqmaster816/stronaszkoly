import { useCallback, useEffect, useMemo, useState } from "react";

export type Article = {
  url: string;
  title: string;
  author?: string;
  date?: string; // ISO date string
  content_html?: string;
};

type UseArticlesOptions = {
  limit?: number;
  reloadSignal?: number;
};

export function useArticles(options: UseArticlesOptions = {}) {
  const { limit, reloadSignal = 0 } = options;
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((v) => v + 1), []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(`/articles.json`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Article[]) => {
        if (!isMounted) return;
        setArticles(data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setArticles([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [reloadSignal, reloadToken]);

  const processed = useMemo(() => {
    if (!articles) return [] as Article[];
    const sorted = [...articles].sort((a, b) => {
      const ad = a.date ? Date.parse(a.date) : 0;
      const bd = b.date ? Date.parse(b.date) : 0;
      return bd - ad;
    });
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }, [articles, limit]);

  return { articles: processed, raw: articles, loading, error, reload };
}

export function formatArticleDate(date?: string) {
  if (!date) return "";
  try {
    const d = new Date(date);
    return d.toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    return date;
  }
}

