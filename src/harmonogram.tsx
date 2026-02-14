import { useMemo, useState, useDeferredValue, useEffect, useRef, Fragment, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Filter, Search, Clock, X, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  // Wrzesień 2025
  { id: "2025-09-01-spotkanie-kl1", title: "Spotkanie uczniów klas I z wychowawcami", start: "2025-09-01T09:00", category: "Wydarzenie" },
  { id: "2025-09-01-rozpoczecie-roku", title: "Inauguracja roku szkolnego - A. Witczyk", start: "2025-09-01T10:00", category: "Wydarzenie" },
  { id: "2025-09-02-mundurek", title: "Obowiązek noszenia mundurka i identyfikatora przez uczniów", start: "2025-09-02", category: "Organizacja" },
  { id: "2025-09-04-rp-nadzor", title: "Rada pedagogiczna - plan nadzoru", start: "2025-09-04T17:00", category: "Rada Pedagogiczna" },
  { id: "2025-09-04-rodzice-spotkanie", title: "Spotkanie rodziców klas I i pozostałych", start: "2025-09-04T18:00", category: "Wywiadówka" },
  { id: "2025-09-12-zespoly-przedmiotowe", title: "Ostateczny termin spotkań zespołów przedmiotowych i przygotowanie dostosowań wymagań", start: "2025-09-12", category: "Termin/Deadline" },
  { id: "2025-09-15-deklaracje-zawodowe", title: "Termin złożenia deklaracji przystąpienia do egzaminów zawodowych", start: "2025-09-15", category: "Termin/Deadline" },
  { id: "2025-09-tbd-rp-program", title: "Rada pedagogiczna - zatwierdzenie Programu Wychowawczo-Profilaktycznego Szkoły", start: "2025-09-01", tbd: true, category: "Rada Pedagogiczna" },
  // Październik 2025
  { id: "2025-10-10-plany-wychowawcy", title: "Termin złożenia planów pracy wychowawcy do pedagoga szkolnego", start: "2025-10-10", category: "Termin/Deadline" },
  { id: "2025-10-14-dzien-edukacji", title: "Dzień Edukacji Narodowej", start: "2025-10-14", category: "Wydarzenie" },
  { id: "2025-10-17-nieobecnosci", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2025-10-17", category: "Termin/Deadline" },
  { id: "2025-10-17-teczki-wychowawcy", title: "Termin przygotowania teczki wychowawcy oraz dostosowań wymagań edukacyjnych dla klas I", start: "2025-10-17", category: "Termin/Deadline" },
  { id: "2025-10-20-rp-szkoleniowa", title: "Rada pedagogiczna szkoleniowa - Informacja zwrotna i ocenianie kształtujące", start: "2025-10-20T16:00", category: "Rada Pedagogiczna" },
  { id: "2025-10-31-praktyki-3-4", title: "Praktyka zawodowa dla uczniów klas III i IV", start: "2025-10-31", end: "2025-11-28", category: "Praktyki" },
  // Listopad 2025
  { id: "2025-11-01-wszystkich-swietych", title: "Wszystkich Świętych - dzień wolny", start: "2025-11-01", category: "Dni wolne" },
  { id: "2025-11-07-hymn-narodowy", title: "Uroczyste śpiewanie hymnu narodowego z okazji Święta Odzyskania Niepodległości - Witkowski", start: "2025-11-07", category: "Wydarzenie" },
  { id: "2025-11-10-dzien-dyrektorski", title: "Dzień dyrektorski - wolny od zajęć dydaktycznych", start: "2025-11-10", category: "Dni wolne" },
  { id: "2025-11-11-swieto-niepodleglosci", title: "Święto Odzyskania Niepodległości", start: "2025-11-11", category: "Dni wolne" },
  { id: "2025-11-14-nieobecnosci-2", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2025-11-14", category: "Termin/Deadline" },
  { id: "2025-11-18-matura-probna", title: "Matura próbna 'Operon'", start: "2025-11-18", end: "2025-11-21", category: "Egzamin" },
  { id: "2025-11-tbd-dzien-patrona", title: "Dzień Patrona Szkoły - Samorząd Szkolny", start: "2025-11-01", tbd: true, category: "Wydarzenie" },
  // Grudzień 2025
  { id: "2025-12-02-przewidywane-oceny", title: "Ostateczny termin wystawienia przewidywanych ocen końcoworocznych z przedmiotów", start: "2025-12-02", category: "Termin/Deadline" },
  { id: "2025-12-04-wywiadowka", title: "Wywiadówka - dla wszystkich klas", start: "2025-12-04", category: "Wywiadówka" },
  { id: "2025-12-12-oceny-polrocze-kl5", title: "Ostateczny termin wystawienia ocen za I półrocze dla klas 5", start: "2025-12-12T16:00", category: "Termin/Deadline" },
  { id: "2025-12-12-nieobecnosci-3", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2025-12-12", category: "Termin/Deadline" },
  { id: "2025-12-15-rp-klasyfikacyjna-kl5", title: "Rada pedagogiczna klasyfikacyjna dla klas V", start: "2025-12-15T16:00", category: "Rada Pedagogiczna" },
  { id: "2025-12-19-spotkania-swiateczne", title: "Klasowe Spotkania Świąteczne - zajęcia z wychowawcą", start: "2025-12-19", category: "Wydarzenie" },
  { id: "2025-12-22-przerwa-swiateczna", title: "Zimowa przerwa świąteczna", start: "2025-12-22", end: "2025-12-31", category: "Dni wolne" },
  // Styczeń 2026
  { id: "2026-01-01-nowy-rok", title: "Nowy Rok - dzień wolny", start: "2026-01-01", category: "Dni wolne" },
  { id: "2026-01-02-dzien-dyrektorski-1", title: "Dzień dyrektorski - wolny od zajęć dydaktycznych", start: "2026-01-02", category: "Dni wolne" },
  { id: "2026-01-05-dzien-dyrektorski-2", title: "Dzień dyrektorski - wolny od zajęć dydaktycznych", start: "2026-01-05", category: "Dni wolne" },
  { id: "2026-01-06-trzech-kroli", title: "Święto Trzech Króli - dzień wolny", start: "2026-01-06", category: "Dni wolne" },
  { id: "2026-01-08-egzaminy-zawodowe-zima", title: "Egzaminy zawodowe w sesji zimowej", start: "2026-01-08", end: "2026-01-22", category: "Egzamin" },
  { id: "2026-01-23-nieobecnosci-4", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2026-01-23", category: "Termin/Deadline" },
  { id: "2026-01-30-oceny-polrocze-1-4", title: "Ostateczny termin wystawienia ocen za I półrocze dla klas I-IV", start: "2026-01-30T12:00", category: "Termin/Deadline" },
  { id: "2026-01-30-rp-klasyfikacyjna", title: "Rada pedagogiczna klasyfikacyjna", start: "2026-01-30T16:00", category: "Rada Pedagogiczna" },
  // Luty 2026
  { id: "2026-02-02-ferie-zimowe", title: "Ferie zimowe", start: "2026-02-02", end: "2026-02-13", category: "Dni wolne" },
  { id: "2026-02-09-deklaracje-maturalne", title: "Termin złożenia deklaracji przystąpienia do egzaminu maturalnego", start: "2026-02-09", category: "Termin/Deadline" },
  // Marzec 2026
  { id: "2026-03-20-nieobecnosci-5", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2026-03-20", category: "Termin/Deadline" },
  { id: "2026-03-tbd-dzien-otwarty", title: "Dzień otwarty szkoły", start: "2026-03-01", tbd: true, category: "Wydarzenie" },
  { id: "2026-03-tbd-rp-szkoleniowa", title: "Rada Pedagogiczna szkoleniowa", start: "2026-03-01", tbd: true, category: "Rada Pedagogiczna" },
  { id: "2026-03-31-wywiadowka-2", title: "Wywiadówka", start: "2026-03-31", category: "Wywiadówka" },
  // Kwiecień 2026
  { id: "2026-04-02-przerwa-wiosenna", title: "Wiosenna przerwa świąteczna", start: "2026-04-02", end: "2026-04-07", category: "Dni wolne" },
  { id: "2026-04-10-przewidywane-oceny-kl5", title: "Termin wystawienia przewidywanych ocen końcowych klas V", start: "2026-04-10", category: "Termin/Deadline" },
  { id: "2026-04-17-nieobecnosci-6", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2026-04-17", category: "Termin/Deadline" },
  { id: "2026-04-21-oceny-koncowe-kl5", title: "Termin wystawienia ocen końcowych klas V", start: "2026-04-21T12:00", category: "Termin/Deadline" },
  { id: "2026-04-22-rp-klasyfikacyjna-kl5-2", title: "Rada Pedagogiczna klasyfikacyjna dla klas V", start: "2026-04-22T16:00", category: "Rada Pedagogiczna" },
  { id: "2026-04-24-zakonczenie-kl5", title: "Zakończenie zajęć w klasach maturalnych - Z. Rudecki", start: "2026-04-24T09:00", category: "Wydarzenie" },
  { id: "2026-04-24-lekcje-reszta", title: "Rozpoczęcie lekcji dla pozostałych klas", start: "2026-04-24T10:45", category: "Organizacja" },
  { id: "2026-04-30-przygotowanie-sal-komisja", title: "Przygotowanie sal do matury - przewodniczący komisji", start: "2026-04-30", category: "Egzamin" },
  { id: "2026-04-30-przygotowanie-sali-gim", title: "Przygotowanie sali gimnastycznej do matury - K. Bryl", start: "2026-04-30", category: "Egzamin" },
  // Maj 2026
  { id: "2026-05-01-swieto-pracy", title: "Święto Pracy", start: "2026-05-01", category: "Dni wolne" },
  { id: "2026-05-02-dzien-flagi", title: "Dzień Flagi", start: "2026-05-02", category: "Wydarzenie" },
  { id: "2026-05-03-konstytucja", title: "Święto Konstytucji 3-go Maja", start: "2026-05-03", category: "Dni wolne" },
  { id: "2026-05-04-egzaminy-maturalne", title: "Egzaminy maturalne", start: "2026-05-04", end: "2026-05-22", category: "Egzamin" },
  { id: "2026-05-04-dni-dyrektorskie-matura", title: "Dni dyrektorskie - wolne od zajęć dydaktycznych (matury)", start: "2026-05-04", end: "2026-05-08", category: "Dni wolne" },
  { id: "2026-05-20-nieobecnosci-7", title: "Zgłoszenie do pedagoga informacji o uczniach z dużą ilością godzin nieobecności", start: "2026-05-20", category: "Termin/Deadline" },
  { id: "2026-05-28-konsultacje", title: "Konsultacje z rodzicami", start: "2026-05-28T17:00", end: "2026-05-28T18:00", category: "Wywiadówka" },
  // Czerwiec 2026
  { id: "2026-06-01-egzaminy-zawodowe-lato", title: "Egzaminy zawodowe w sesji letniej", start: "2026-06-01", end: "2026-06-22", category: "Egzamin" },
  { id: "2026-06-03-dzien-sportu", title: "Dzień Sportu Szkolnego - Piknik z okazji Dnia Dziecka", start: "2026-06-03", category: "Wydarzenie" },
  { id: "2026-06-04-boze-cialo", title: "Boże Ciało - dzień wolny", start: "2026-06-04", category: "Dni wolne" },
  { id: "2026-06-05-dzien-dyrektorski-3", title: "Dzień dyrektorski - wolny od zajęć dydaktycznych", start: "2026-06-05", category: "Dni wolne" },
  { id: "2026-06-08-przewidywane-oceny-koncowe", title: "Termin wystawienia przewidywanych ocen końcoworocznych", start: "2026-06-08T16:00", category: "Termin/Deadline" },
  { id: "2026-06-09-info-rodzice", title: "Przekazanie informacji rodzicom o przewidywanych ocenach końcoworocznych", start: "2026-06-09", end: "2026-06-10", category: "Termin/Deadline" },
  { id: "2026-06-10-wycieczki", title: "Wycieczki klasowe (sugerowany termin)", start: "2026-06-10", end: "2026-06-19", category: "Wydarzenie" },
  { id: "2026-06-19-ostateczne-oceny", title: "Termin wystawienia ocen końcoworocznych", start: "2026-06-19T16:00", category: "Termin/Deadline" },
  { id: "2026-06-22-rp-klasyfikacyjna-koncowa", title: "Rada pedagogiczna klasyfikacyjna (godzina do ustalenia)", start: "2026-06-22", tbd: true, category: "Rada Pedagogiczna" },
  { id: "2026-06-23-dni-kreatywnosci", title: "Dni kreatywności (samorząd szkolny + wychowawcy klas)", start: "2026-06-23", end: "2026-06-25", category: "Wydarzenie" },
  { id: "2026-06-26-zakonczenie-roku", title: "Zakończenie roku szkolnego 2025/2026 - K. Student", start: "2026-06-26T10:00", category: "Wydarzenie" },
  { id: "2026-06-26-rp-plenarna", title: "Rada pedagogiczna plenarna", start: "2026-06-26T12:30", category: "Rada Pedagogiczna" },
  // Sierpień 2026
  { id: "2026-08-24-matura-poprawkowa", title: "Egzamin maturalny w terminie poprawkowym", start: "2026-08-24", end: "2026-08-25", category: "Egzamin" },
  { id: "2026-08-24-egzaminy-poprawkowe", title: "Egzaminy poprawkowe", start: "2026-08-24", end: "2026-08-26", category: "Egzamin" },
  { id: "2026-08-27-rp-poprawkowa", title: "Rada pedagogiczna klasyfikacyjna po egzaminach poprawkowych oraz rada plenarna", start: "2026-08-27", category: "Rada Pedagogiczna" },
  // Wrzesień 2026
  { id: "2026-09-01-spotkanie-kl1", title: "Spotkanie uczniów klas I z wychowawcami (Rozpoczęcie roku 2026/2027)", start: "2026-09-01T09:00", category: "Wydarzenie" },
  { id: "2026-09-01-rozpoczecie-roku-nowego", title: "Uroczyste rozpoczęcie roku szkolnego 2026/2027 - M. Tomczyk", start: "2026-09-01T10:00", category: "Wydarzenie" },
];


// Tworzy lokalny obiekt Date z ISO (YYYY-MM-DD lub YYYY-MM-DDTHH:mm),
// bez wahań strefowych (nie używamy parsera UTC przeglądarki).
function createLocalDate(dateIso: string): Date {
  if (!dateIso) return new Date(NaN);
  const [datePart, timePart] = dateIso.split("T");
  const [y, m, d] = datePart.split("-").map((n) => Number(n));
  if (timePart) {
    const [hh = "0", mm = "0"] = timePart.split(":");
    return new Date(y, (m || 1) - 1, d || 1, Number(hh), Number(mm));
  }
  return new Date(y, (m || 1) - 1, d || 1);
}

function monthKey(dateIso: string): string {
  const d = createLocalDate(dateIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateRange(start: string, end?: string): string {
  if (!start) return "";
  const fmtDate = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const sd = createLocalDate(start);
  const ed = end ? createLocalDate(end) : undefined;
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
  const deferredQuery = useDeferredValue(query);
  const [activeCats, setActiveCats] = useState<Category[]>(ALL_CATEGORIES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyMonth, setOnlyMonth] = useState<string | null>(null);
  const [hideEarlierMonths, setHideEarlierMonths] = useState(true);
  const [expandedPastMonths, setExpandedPastMonths] = useState<Set<string>>(new Set());

  // Daty referencyjne (początek dnia lokalnie)
  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const toDayStart = useCallback((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()), []);
  const isEventPast = useCallback((e: EventItem) => {
    const s = toDayStart(createLocalDate(e.start));
    const ed = e.end ? toDayStart(createLocalDate(e.end)) : undefined;
    if (ed) return ed < todayStart;
    return s < todayStart;
  }, [toDayStart, todayStart]);
  const isEventOngoing = useCallback((e: EventItem) => {
    const s = toDayStart(createLocalDate(e.start));
    const ed = e.end ? toDayStart(createLocalDate(e.end)) : undefined;
    if (!ed) return s.getTime() === todayStart.getTime();
    return s <= todayStart && todayStart <= ed;
  }, [toDayStart, todayStart]);
  const isEventUpcomingOrOngoing = useCallback((e: EventItem) => {
    if (isEventOngoing(e)) return true;
    const s = toDayStart(createLocalDate(e.start));
    return s >= todayStart;
  }, [isEventOngoing, toDayStart, todayStart]);
  const months = useMemo(() => {
    const keySet = new Set<string>();
    for (const e of EVENTS) {
      keySet.add(monthKey(e.start));
      if (e.end) keySet.add(monthKey(e.end));
    }
    const keys = Array.from(keySet).sort();
    const order = [
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-08",
      "2026-09",
    ];
    return order.filter((k) => keys.includes(k));
  }, []);
  const filteredEvents = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return EVENTS.filter((e) => {
      const inCat = activeCats.includes(e.category);
      const inQuery = !q || `${e.title} ${e.category}`.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }, [activeCats, deferredQuery]);

  const monthEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of filteredEvents) {
      const keys = [monthKey(e.start), e.end ? monthKey(e.end) : null].filter(Boolean) as string[];
      for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  const visibleMonths = useMemo(
    () => months.filter((m) => !hideEarlierMonths || m >= currentMonthKey),
    [months, hideEarlierMonths, currentMonthKey]
  );

  useEffect(() => {
    if (hideEarlierMonths && onlyMonth && onlyMonth < currentMonthKey) {
      setOnlyMonth(null);
    }
  }, [hideEarlierMonths, onlyMonth, currentMonthKey]);

  // Pierwsze nadchodzące/aktywne wydarzenie (do auto-przewinięcia i markera "Dziś")
  const firstUpcomingId = useMemo(() => {
    const sorted = [...filteredEvents].sort(
      (a, b) => createLocalDate(a.start).getTime() - createLocalDate(b.start).getTime()
    );
    const found = sorted.find((e) => isEventUpcomingOrOngoing(e));
    return found?.id ?? null;
  }, [filteredEvents, isEventUpcomingOrOngoing]);

  const firstUpcomingRef = useRef<HTMLLIElement | null>(null);
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);

  useEffect(() => {
    if (hasAutoScrolled) return;
    if (firstUpcomingRef.current) {
      firstUpcomingRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setHasAutoScrolled(true);
    }
  }, [hasAutoScrolled]);

  function toggleCat(cat: Category) {
    setActiveCats((prev) => (prev.length === 1 && prev[0] === cat ? ALL_CATEGORIES : [cat]));
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
      .replace(/\s*\((?=[^)]*[0-9])(?=[^)]*[.:])[^)]*\)\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return withoutDateParens;
  };
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Topbar – zgodny stylistycznie z resztą aplikacji */}
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/70 border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-zinc-200" />
          <div className="font-semibold">Harmonogram - Rok szkolny 2025/2026</div>
          <div className="ml-auto">
            <Button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="rounded-xl border-zinc-700 bg-zinc-900 text-zinc-100 shadow-sm"
              aria-label="Pokaż/ukryj filtry"
              aria-expanded={filtersOpen}
            >
              <Filter className="h-4 w-4" /> Filtry
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-6">
        
        {/* Inline, slide-down filters panel with smooth height tween */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filters-panel"
              className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Kategorie</div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map((cat) => (
                      <Button
                        key={cat}
                        onClick={() => toggleCat(cat)}
                        size="sm"
                        className={`border px-3 py-1.5 text-sm rounded-full transition ${
                          activeCats.includes(cat)
                            ? CATEGORY_STYLES[cat] + " ring-1 ring-black/0"
                            : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                        }`}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Miesiące</div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => setHideEarlierMonths((v) => !v)}
                      size="sm"
                      className={`rounded-full border text-xs transition ${
                        hideEarlierMonths
                          ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                      }`}
                      title="Ukryj wcześniejsze miesiące i pokaż bieżący oraz kolejne"
                    >
                      Ukryj wcześniejsze
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setOnlyMonth(null)}
                      size="sm"
                      className="rounded-full border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Pokaż wszystkie
                    </Button>
                  </div>
                </div>
                {/* Mobile: siatka 2-kolumnowa dla czytelności */}
                <div className="grid grid-cols-2 gap-2 sm:hidden">
                  {visibleMonths.map((m) => {
                    const active = onlyMonth === m;
                    const isNow = !onlyMonth && m === currentMonthKey;
                    const count = monthEventCounts[m] ?? 0;
                    return (
                      <Button
                        key={`m-mobile-${m}`}
                        type="button"
                        size="sm"
                        onClick={() => setOnlyMonth((cur) => (cur === m ? null : m))}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                          active
                            ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                            : isNow
                              ? "border-zinc-600 bg-zinc-800/70 text-zinc-100"
                              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        }`}
                        title={`${monthLabel(m)}${active ? " – filtr aktywny" : " – kliknij, aby filtrować"}`}
                      >
                        <span className="truncate text-left">{monthLabel(m)}</span>
                        <span className="ml-2 rounded-full border border-zinc-700 bg-black/20 px-1.5 py-0.5 text-xs text-zinc-300">{count}</span>
                      </Button>
                    );
                  })}
                </div>
                {/* Desktop: układ chipów zwijający się w wiersze */}
                <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
                  {visibleMonths.map((m) => {
                    const active = onlyMonth === m;
                    const isNow = !onlyMonth && m === currentMonthKey;
                    const count = monthEventCounts[m] ?? 0;
                    return (
                      <Button
                        key={`m-desktop-${m}`}
                        type="button"
                        size="sm"
                        onClick={() => setOnlyMonth((cur) => (cur === m ? null : m))}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          active
                            ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                            : isNow
                              ? "border-zinc-600 bg-zinc-800/70 text-zinc-100"
                              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        }`}
                        title={`${monthLabel(m)}${active ? " – filtr aktywny" : " – kliknij, aby filtrować"}`}
                      >
                        {monthLabel(m)}
                        <span className="ml-2 rounded-full border border-zinc-700 bg-black/20 px-1.5 py-0.5 text-xs text-zinc-300">{count}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>

        {onlyMonth && (
          <div className="mt-4 flex items-center gap-3 text-sm text-zinc-300">
            <span>Filtr miesiąca:</span>
            <Badge variant="secondary" className="rounded-full bg-zinc-800 text-zinc-200 border-zinc-700">
              {monthLabel(onlyMonth)}
            </Badge>
            <Button
              type="button"
              onClick={() => setOnlyMonth(null)}
              size="sm"
              className="rounded-lg border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              <span className="inline-flex items-center gap-1"><X className="h-4 w-4"/>Wyczyść</span>
            </Button>
          </div>
        )}

        <section className="mt-6 space-y-6">
          {visibleMonths.map((m) => {
            if (onlyMonth && onlyMonth !== m) return null;
            const visibleForMonth = filteredEvents
              .filter(
                (e) => monthKey(e.start) === m || (e.end && monthKey(e.end) === m)
              )
              .sort((a, b) => createLocalDate(a.start).getTime() - createLocalDate(b.start).getTime());
            
            if (visibleForMonth.length === 0 && !query) return null;

            const past = visibleForMonth.filter((e) => isEventPast(e));
            const future = visibleForMonth.filter((e) => !isEventPast(e));
            const hasPast = past.length > 0;
            const isPastExpanded = expandedPastMonths.has(m);
            const togglePast = () => {
              setExpandedPastMonths((prev) => {
                const next = new Set(prev);
                if (next.has(m)) next.delete(m); else next.add(m);
                return next;
              });
            };

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
                    {/* Przeszłe – zwijane */}
                    {hasPast && !isPastExpanded && (
                      <li className="mb-4 ml-4">
                        <Button
                          type="button"
                          onClick={togglePast}
                          size="sm"
                          className="rounded-full border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          <ChevronDown className="h-4 w-4"/> Pokaż wcześniejsze ({past.length})
                        </Button>
                      </li>
                    )}
                    {isPastExpanded && past.map((ev) => (
                      <motion.li
                        key={ev.id}
                        initial={false}
                        className="mb-6 ml-4 opacity-70"
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
                    {isPastExpanded && hasPast && (
                      <li className="mb-4 ml-4">
                        <Button
                          type="button"
                          onClick={togglePast}
                          size="sm"
                          className="rounded-full border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          <ChevronUp className="h-4 w-4"/> Ukryj wcześniejsze
                        </Button>
                      </li>
                    )}

                    {/* Marker "Dziś" + nadchodzące */}
                    {future.map((ev) => (
                      <Fragment key={ev.id}>
                        {firstUpcomingId === ev.id && (
                          <li className="mb-3 ml-4">
                            <div className="relative -left-4 mr-4 flex items-center gap-2 text-xs font-medium text-emerald-300">
                              <span className="h-px flex-1 bg-emerald-900/60" />
                              <span className="whitespace-nowrap rounded-full border border-emerald-800 bg-emerald-900/30 px-2 py-0.5">Dziś / Teraz</span>
                              <span className="h-px flex-1 bg-emerald-900/60" />
                            </div>
                          </li>
                        )}
                        <motion.li
                          ref={firstUpcomingId === ev.id ? firstUpcomingRef : undefined}
                          initial={false}
                          className="mb-6 ml-4"
                        >
                          <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-emerald-600" />
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-medium leading-tight text-zinc-50">{cleanTitle(ev.title)}</h3>
                              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                                <Clock className="h-4 w-4"/>
                                <span>{formatDateRange(ev.start, ev.end)}</span>
                                {isEventOngoing(ev) && (
                                  <Badge variant="secondary" className="rounded-full bg-emerald-800/40 text-emerald-200 border-emerald-700">trwa</Badge>
                                )}
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
                      </Fragment>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-500">
          Opracowano na podstawie Kalendarza Roku Szkolnego 2025/2026. W razie uwag – proszę o komentarz.
        </footer>
      </div>
    </div>
  );
}
