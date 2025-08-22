import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Filter, Search, Clock, X } from "lucide-react";
import { motion } from "framer-motion";

// Ciemne style kategorii – spójne z motywem planu lekcji
const CATEGORY_STYLES = {
  "Rada Pedagogiczna": "bg-indigo-900/40 text-indigo-200 border-indigo-800",
  "Wywiadówka": "bg-amber-900/40 text-amber-200 border-amber-800",
  "Praktyki": "bg-emerald-900/40 text-emerald-200 border-emerald-800",
  "Egzamin": "bg-rose-900/40 text-rose-200 border-rose-800",
  "Dni wolne": "bg-sky-900/40 text-sky-200 border-sky-800",
  "Termin/Deadline": "bg-zinc-800/60 text-zinc-200 border-zinc-700",
  "Wydarzenie": "bg-fuchsia-900/40 text-fuchsia-200 border-fuchsia-800",
  "Organizacja": "bg-teal-900/40 text-teal-200 border-teal-800",
} as const;

type Category = keyof typeof CATEGORY_STYLES;

type EventItem = {
  id: string;
  title: string;
  start: string;
  end?: string;
  tbd?: boolean;
  category: Category;
};

const ALL_CATEGORIES = Object.keys(CATEGORY_STYLES) as Category[];

const EVENTS: EventItem[] = [
  {
    id: "2025-01-17-polrocze",
    title: "Zakończenie I półrocza (kl. I–IV)",
    start: "2025-01-17",
    category: "Organizacja",
  },
  {
    id: "2025-01-20-praktyki-4",
    title: "Praktyki: 4tai, 4te, 4ti, 4atp",
    start: "2025-01-20",
    end: "2025-02-14",
    category: "Praktyki",
  },
  {
    id: "2025-01-21-rp-plenarna",
    title: "Plenarna Rada Pedagogiczna",
    start: "2025-01-21T18:00",
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-01-22-rp-klasyfikacyjna",
    title: "Rada Pedagogiczna klasyfikacyjna (kl. I–IV)",
    start: "2025-01-22T17:00",
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-01-23-wywiadowka",
    title: "Wywiadówka",
    start: "2025-01-23T18:00",
    category: "Wywiadówka",
  },
  {
    id: "2025-02-07-deklaracje-matura-deadline",
    title: "Ostateczny termin deklaracji – matura 2025 (do 7.02)",
    start: "2025-02-07",
    category: "Termin/Deadline",
  },
  {
    id: "2025-02-07-deklaracje-kwalifikacje-deadline",
    title: "Termin deklaracji – egzaminy kwalifikacyjne (sesja lato 2025, do 7.02)",
    start: "2025-02-07",
    category: "Termin/Deadline",
  },
  {
    id: "2025-02-14-nieobecnosci-zgloszenie",
    title: "Zgłoszenie do pedagoga – uczniowie z dużą liczbą nieobecności (wychowawcy)",
    start: "2025-02-14",
    category: "Termin/Deadline",
  },
  {
    id: "2025-02-15-studniowka",
    title: "Studniówka",
    start: "2025-02-15",
    category: "Wydarzenie",
  },
  {
    id: "2025-02-17-ferie",
    title: "Ferie zimowe",
    start: "2025-02-17",
    end: "2025-02-28",
    category: "Dni wolne",
  },
  {
    id: "2025-03-03-praktyki-3",
    title: "Praktyki: 3ta, 3tg, 3bti, 3ati",
    start: "2025-03-03",
    end: "2025-03-28",
    category: "Praktyki",
  },
  {
    id: "2025-03-29-dzien-otwarty",
    title: "Dzień otwarty szkoły",
    start: "2025-03-29",
    category: "Wydarzenie",
  },
  {
    id: "2025-04-09-przewidywane-v",
    title: "Wystawienie przewidywanych ocen końcowych – kl. V",
    start: "2025-04-09",
    category: "Termin/Deadline",
  },
  {
    id: "2025-04-10-info-rodzice-v",
    title: "Informacja dla rodziców o przewidywanych ocenach – kl. V (09–10.04)",
    start: "2025-04-09",
    end: "2025-04-10",
    category: "Termin/Deadline",
  },
  {
    id: "2025-04-17-wiosenna-przerwa",
    title: "Wiosenna przerwa świąteczna",
    start: "2025-04-17",
    end: "2025-04-22",
    category: "Dni wolne",
  },
  {
    id: "2025-04-18-nieobecnosci-zgloszenie",
    title: "Zgłoszenie do pedagoga – uczniowie z dużą liczbą nieobecności (wychowawcy)",
    start: "2025-04-18",
    category: "Termin/Deadline",
  },
  {
    id: "2025-04-22-oceny-v",
    title: "Ostateczny termin wystawienia ocen końcowych – kl. V (12:00)",
    start: "2025-04-22T12:00",
    category: "Termin/Deadline",
  },
  {
    id: "2025-04-23-rp-klasyfikacyjna-v",
    title: "Rada Pedagogiczna Klasyfikacyjna – kl. V (16:00)",
    start: "2025-04-23T16:00",
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-04-23-zakonczenie-v",
    title: "Uroczyste zakończenie roku szkolnego 2024/2025 – klasy V (9:00) – Woźniak P.",
    start: "2025-04-23T09:00",
    category: "Wydarzenie",
  },
  {
    id: "2025-04-23-lekcje-pozostale",
    title: "Rozpoczęcie lekcji dla pozostałych klas (10:30)",
    start: "2025-04-23T10:30",
    category: "Organizacja",
  },
  {
    id: "2025-04-25-przygotowanie-sali-gimn",
    title: "Przygotowanie sali gimnastycznej do matury – Salamon S.",
    start: "2025-04-25",
    category: "Egzamin",
  },
  {
    id: "2025-04-28-wywiadowka",
    title: "Wywiadówka",
    start: "2025-04-28",
    category: "Wywiadówka",
  },
  {
    id: "2025-04-30-przygotowanie-sal",
    title: "Przygotowanie pozostałych sal do matury – przewodniczący komisji",
    start: "2025-04-30",
    category: "Egzamin",
  },
  {
    id: "2025-05-05-matura-pisemna",
    title: "Egzamin maturalny pisemny – sesje 9:00 i 14:00 (05–09.05) – S. Szewczyk",
    start: "2025-05-05",
    end: "2025-05-09",
    category: "Egzamin",
  },
  {
    id: "2025-05-05-dni-wolne-matura",
    title: "Dni wolne od zajęć dydaktycznych – egzamin maturalny (05–09.05)",
    start: "2025-05-05",
    end: "2025-05-09",
    category: "Dni wolne",
  },
  {
    id: "2025-05-05-praktyki-maj",
    title: "Praktyki: 4btp, 3tp, 3tpe (05–30.05)",
    start: "2025-05-05",
    end: "2025-05-30",
    category: "Praktyki",
  },
  {
    id: "2025-05-23-nieobecnosci-zgloszenie",
    title: "Zgłoszenie do pedagoga – uczniowie z dużą liczbą nieobecności (wychowawcy)",
    start: "2025-05-23",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-02-egzaminy-kwalifikacje",
    title: "Egzaminy potwierdzające kwalifikacje w zawodzie – K. Kowalski (02–21.06)",
    start: "2025-06-02",
    end: "2025-06-21",
    category: "Egzamin",
  },
  {
    id: "2025-06-02-swieto-sportu",
    title: "Święto Sportu Szkolnego – nauczyciele WF",
    start: "2025-06-02",
    category: "Wydarzenie",
  },
  {
    id: "2025-06-03-matura-dodatkowa",
    title: "Egzamin maturalny – termin dodatkowy (03–17.06) – S. Szewczyk",
    start: "2025-06-03",
    end: "2025-06-17",
    category: "Egzamin",
  },
  {
    id: "2025-06-09-przewidywane",
    title: "Wystawienie przewidywanych ocen końcoworocznych",
    start: "2025-06-09",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-10-info-rodzice",
    title: "Informacja dla rodziców o przewidywanych ocenach (10–11.06)",
    start: "2025-06-10",
    end: "2025-06-11",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-18-ostateczne-oceny",
    title: "Ostateczny termin wystawienia ocen końcoworocznych",
    start: "2025-06-18",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-19-boze-cialo",
    title: "Boże Ciało – dzień wolny",
    start: "2025-06-19",
    category: "Dni wolne",
  },
  {
    id: "2025-06-20-dzien-dyrektorski",
    title: "Dzień wolny od zajęć dydaktycznych – dzień dyrektorski",
    start: "2025-06-20",
    category: "Dni wolne",
  },
  {
    id: "2025-06-23-rp-klasyfikacyjna",
    title: "Rada Pedagogiczna Klasyfikacyjna (data do ustalenia)",
    start: "2025-06-23",
    tbd: true,
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-06-25-egzaminy-klasyfikacyjne",
    title: "Ewentualne egzaminy klasyfikacyjne (25–26.06)",
    start: "2025-06-25",
    end: "2025-06-26",
    category: "Egzamin",
  },
  {
    id: "2025-06-27-zakonczenie-roku",
    title: "Uroczyste zakończenie roku szkolnego 2024/2025 (10:00) – S. Chojnacka",
    start: "2025-06-27T10:00",
    category: "Wydarzenie",
  },
  {
    id: "2025-06-27-rp-plenarna",
    title: "Rada Pedagogiczna Plenarna (13:00)",
    start: "2025-06-27T13:00",
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-06-27-analiza-pracy",
    title: "Termin złożenia arkusza analizy pracy własnej",
    start: "2025-06-27",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-27-sprawozdania-staz",
    title: "Termin złożenia cząstkowych sprawozdań ze stażu na awans",
    start: "2025-06-27",
    category: "Termin/Deadline",
  },
  {
    id: "2025-06-30-ferie-letnie",
    title: "Rozpoczęcie ferii letnich",
    start: "2025-06-30",
    category: "Dni wolne",
  },
  {
    id: "2025-08-19-matura-poprawkowa",
    title: "Matura – termin poprawkowy (19–20.08, godz. 9:00) – S. Szewczyk",
    start: "2025-08-19T09:00",
    end: "2025-08-20T15:00",
    category: "Egzamin",
  },
  {
    id: "2025-08-25-egzaminy-poprawkowe",
    title: "Egzaminy poprawkowe (25–27.08, od 9:00)",
    start: "2025-08-25T09:00",
    end: "2025-08-27T15:00",
    category: "Egzamin",
  },
  {
    id: "2025-08-28-rp-plenarna",
    title: "Rada Pedagogiczna Plenarna i klasyfikacyjna poprawkowiczów (11:00)",
    start: "2025-08-28T11:00",
    category: "Rada Pedagogiczna",
  },
  {
    id: "2025-09-01-spotkanie-kl1",
    title: "Spotkanie uczniów klas I z wychowawcami (9:00)",
    start: "2025-09-01T09:00",
    category: "Wydarzenie",
  },
  {
    id: "2025-09-01-rozpoczecie-roku",
    title: "Uroczyste rozpoczęcie roku szkolnego 2025/2026 (10:00) – A. Witczyk",
    start: "2025-09-01T10:00",
    category: "Wydarzenie",
  },
  {
    id: "2025-09-01-termin-dziennik",
    title: "Do 15:00 – wpisanie w dzienniku programu nauczania i rozkładów materiału",
    start: "2025-09-01T15:00",
    category: "Termin/Deadline",
  },
];

function monthKey(dateIso: string): string {
  const d = new Date(dateIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateRange(start: string, end?: string): string {
  if (!start) return "";
  const fmtDate = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const sd = new Date(start);
  const ed = end ? new Date(end) : undefined;
  const hasTimeS = start.includes("T");
  const hasTimeE = end?.includes("T");
  const d1 = fmtDate.format(sd);
  const d2 = ed ? fmtDate.format(ed) : undefined;
  const t1 = hasTimeS ? fmtTime.format(sd) : undefined;
  const t2 = hasTimeE && ed ? fmtTime.format(ed) : undefined;
  if (!ed || d1 === d2) {
    return hasTimeS ? `${d1}, ${t1}` : `${d1}`;
  }
  return hasTimeS || hasTimeE ? `${d1}${t1 ? `, ${t1}` : ""} – ${d2}${t2 ? `, ${t2}` : ""}` : `${d1} – ${d2}`;
}

export default function SchedulePage() {
  const [query, setQuery] = useState("");
  const [activeCats, setActiveCats] = useState<Category[]>(ALL_CATEGORIES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const months = useMemo(() => {
    const keys = Array.from(new Set(EVENTS.map((e) => monthKey(e.start)))).sort();
    const order = [
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-08",
      "2025-09",
    ];
    return order.filter((k) => keys.includes(k));
  }, []);
  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EVENTS.filter((e) => {
      const inCat = activeCats.includes(e.category);
      const inQuery = !q || `${e.title} ${e.category}`.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }, [activeCats, query]);

  function toggleCat(cat: Category) {
    setActiveCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(d);
  };

  // Usuwa z tytułu nawiasy zawierające daty/godziny (np. "(05–09.05)", "(9:00)", "(10–11.06)")
  const cleanTitle = (title: string): string => {
    const withoutDateParens = title
      // nawiasy z cyframi i kropką lub dwukropkiem (daty/godziny)
      .replace(/\s*\((?=[^)]*[0-9])(?=[^)]*[\.:])[^)]*\)\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return withoutDateParens;
  };
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Harmonogram – II półrocze 2024/2025</h1>
          </div>
          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-sm"
              aria-label="Otwórz filtry"
            >
              <Filter className="h-4 w-4" /> Filtry
            </button>
          </div>
          <div className="hidden sm:block" />
        </header>

        {/* Desktop: widoczny panel filtrów */}
        <Card className="hidden sm:block rounded-2xl shadow-sm bg-zinc-900 border-zinc-800 text-zinc-100">
          <CardHeader className="pb-2 border-zinc-800">
            <CardTitle className="flex items-center gap-2 text-lg"><Filter className="h-5 w-5"/>Filtry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                <Input
                  placeholder="Szukaj (np. matura, rada, praktyki)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9 rounded-2xl bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className={`border px-3 py-1.5 text-sm rounded-full transition ${
                    activeCats.includes(cat)
                      ? CATEGORY_STYLES[cat] + " ring-1 ring-black/0"
                      : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mobile: wysuwane menu filtrów */}
        {filtersOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFiltersOpen(false)}
          >
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-base font-medium"><Filter className="h-5 w-5"/>Filtry</span>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-lg p-2 text-zinc-400 hover:text-zinc-100"
                  aria-label="Zamknij"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                  <Input
                    placeholder="Szukaj (np. matura, rada, praktyki)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9 rounded-2xl bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCat(cat)}
                      className={`border px-3 py-1.5 text-sm rounded-full transition ${
                        activeCats.includes(cat)
                          ? CATEGORY_STYLES[cat] + " ring-1 ring-black/0"
                          : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        <section className="mt-6 space-y-6">
          {months.map((m) => {
            const visibleForMonth = filteredEvents
              .filter(
                (e) => monthKey(e.start) === m || (e.end && monthKey(e.end) === m)
              )
              .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

            return (
              <Card key={m} className="rounded-2xl shadow-sm bg-zinc-900 border-zinc-800 text-zinc-100">
                <CardHeader className="pb-3 border-zinc-800">
                  <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5"/>{monthLabel(m)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="relative ml-3 border-l border-zinc-800">
                    {visibleForMonth.length === 0 && (
                      <p className="pl-4 text-zinc-400">Brak pozycji dla aktualnych filtrów.</p>
                    )}
                    {visibleForMonth.map((ev, idx) => (
                      <motion.li
                        key={ev.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="mb-6 ml-4"
                      >
                        <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-zinc-700" />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-medium leading-tight text-zinc-50">{cleanTitle(ev.title)}</h3>
                            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                              <Clock className="h-4 w-4"/>
                              <span>{formatDateRange(ev.start, ev.end)}</span>
                              {ev.tbd && (
                                <Badge variant="secondary" className="rounded-full bg-zinc-800 text-zinc-200 border-zinc-700">do ustalenia</Badge>
                              )}
                            </div>
                          </div>
                          <span
                            className={`border px-3 py-1.5 text-sm rounded-full transition ${CATEGORY_STYLES[ev.category]} ring-1 ring-black/0 whitespace-nowrap`}
                          >
                            {ev.category}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-500">
          Opracowano na podstawie szkolnego harmonogramu (II półrocze 2024/2025). W razie uwag – proszę o komentarz.
        </footer>
      </div>
    </div>
  );
}
