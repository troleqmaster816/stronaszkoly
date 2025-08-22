import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Printer, Share2, Upload, Rows3, Columns3, Info, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

// ==========================================
// Typy danych
// ==========================================
type RefTables = Record<string, string>; // np. { "n45": "SP" }

type Meta = {
  source?: string;
  scraped_on?: string; // data działania skryptu
  generation_date_from_page?: string; // data z VULCAN
};

type RefObj = { id: string; name: string } | null;

type Lesson = {
  day: string; // np. "Poniedziałek"
  lesson_num: string; // "1", "2" ...
  time: string; // "8:00- 8:45"
  subject: string; // np. "matematyka" albo "wf-1/2"
  teacher: RefObj; // null jeśli wyświetlamy plan nauczyciela
  group: RefObj; // null jeśli plan klasy
  room: RefObj; // null jeśli plan sali
};

type Timetables = Record<string, Lesson[]>; // klucz: n.., s.., o..

type DataFile = {
  metadata: Meta;
  teachers: RefTables;
  rooms: RefTables;
  classes: RefTables;
  timetables: Timetables;
};

type Overrides = {
  subjectOverrides: Record<string, string>; // klucz znormalizowanej nazwy przedmiotu -> nadpisanie
  teacherNameOverrides: Record<string, string>; // skrót nauczyciela -> pełne imię i nazwisko
};

// ==========================================
// Pomocnicze
// ==========================================
const DAY_ORDER: Record<string, number> = {
  "Poniedziałek": 1,
  "Wtorek": 2,
  "Środa": 3,
  "Czwartek": 4,
  "Piątek": 5,
  "Sobota": 6,
  "Niedziela": 7,
};

function cmpDay(a: string, b: string) {
  const da = DAY_ORDER[a] ?? 99;
  const db = DAY_ORDER[b] ?? 99;
  return da - db || a.localeCompare(b);
}

function cmpLesson(a: Lesson, b: Lesson) {
  const na = parseInt(a.lesson_num, 10);
  const nb = parseInt(b.lesson_num, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  // jeśli brak numeru, spróbuj po czasie
  const ta = a.time?.split("-")?.[0] ?? "";
  const tb = b.time?.split("-")?.[0] ?? "";
  return ta.localeCompare(tb) || (a.subject ?? "").localeCompare(b.subject ?? "");
}

function idToKind(id: string | null | undefined): "teacher" | "room" | "class" | null {
  if (!id) return null;
  if (id.startsWith("n")) return "teacher";
  if (id.startsWith("s")) return "room";
  if (id.startsWith("o")) return "class";
  return null;
}

function prettyKind(kind: ReturnType<typeof idToKind>) {
  switch (kind) {
    case "teacher":
      return "Nauczyciel";
    case "room":
      return "Sala";
    case "class":
      return "Klasa";
    default:
      return "Plan";
  }
}

// Wykrywanie podziału na 1/2 lub 2/2 w nazwie przedmiotu
function extractHalfMark(subject?: string | null): string | null {
  if (!subject) return null;
  // łapie m.in.: "wf-1/2", "PiKUAP-2/2", "aplikacje in-2/2", ale też warianty 1/3, 2/3, 3/3
  const m = subject.match(/(?:^|\b|\-)(\d+\/\d+)(?=$|\b)/i);
  if (!m) return null;
  const val = m[1].replace(/\s+/g, "");
  return val;
}

// Normalizacja klucza przedmiotu do nadpisań – usuwa oznaczenia 1/2, zbędne myślniki/spacje i lowercase
function normalizeSubjectKey(subject?: string | null): string {
  if (!subject) return "";
  let s = subject.toLowerCase().trim();
  // usuń wzorce grup typu 1/2, 2/2, 1/3, 2/3, 3/3 (z ewentualnym myślnikiem/spacją)
  s = s.replace(/(?:\s|\-)*(\d+\/\d+)(?=$|\b)/gi, "");
  // zredukuj wielokrotne spacje i myślniki na końcach
  s = s.replace(/[\s\-]+$/g, "").replace(/\s{2,}/g, " ");
  return s;
}

function useHashId() {
  const [hashId, setHashId] = useState<string | null>(() => {
    const h = window.location.hash.replace(/^#\/?/, "");
    return h || null;
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, "");
      setHashId(h || null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const update = (id: string | null) => {
    if (!id) {
      history.replaceState(null, "", window.location.pathname);
      setHashId(null);
    } else {
      const hash = `#/${id}`;
      if (window.location.hash !== hash) {
        history.replaceState(null, "", hash);
      }
      setHashId(id);
    }
  };
  return [hashId, update] as const;
}

// ==========================================
// Komponent – główny (DARK ONLY)
// ==========================================
export default function TimetableViewer({ onOverlayActiveChange }: { onOverlayActiveChange?: (active: boolean) => void }) {
  const [data, setData] = useState<DataFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hashId, setHashId] = useHashId();
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({ subjectOverrides: {}, teacherNameOverrides: {} });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [subjectFilter, setSubjectFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");

  // UI
  const [entityTab, setEntityTab] = useState<"teachers" | "classes" | "rooms">(() => {
    try {
      const saved = localStorage.getItem('timetable.lastEntityTab');
      if (saved === 'teachers' || saved === 'classes' || saved === 'rooms') return saved;
    } catch {}
    return "classes";
  });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"]);
  const [groupHalf, setGroupHalf] = useState<string>(() => {
    try {
      return localStorage.getItem('timetable.groupHalf') || 'all';
    } catch {
      return 'all';
    }
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const prevDesktopView = useRef<"grid" | "list">("grid");
  // const [showMobileFilters, setShowMobileFilters] = useState(false); // deprecated small filters toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // wczytaj JSON
  const loadData = async () => {
    try {
      setError(null);
      const res = await fetch(`/timetable_data.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DataFile;
      setData(json);
      if (!window.location.hash) {
        const saved = localStorage.getItem('timetable.lastPlanId');
        const hasSaved = saved && json.timetables && Object.prototype.hasOwnProperty.call(json.timetables, saved);
        const fallback = Object.keys(json.classes ?? {})[0] ?? null;
        const toUse = (hasSaved ? saved : fallback) as string | null;
        if (toUse) setHashId(toUse);
      }
    } catch (e: any) {
      setError("Nie udało się pobrać pliku /timetable_data.json. Możesz wczytać go ręcznie poniżej.");
    }
  };

  const loadOverrides = async () => {
    try {
      const res = await fetch(`/api/overrides`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      if (j?.ok && j.data) setOverrides(j.data as Overrides);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadData(), loadOverrides()]).finally(() => setLoading(false));
  }, []);

  // Load persisted UI prefs - moved to lazy initializers above

  const onPickLocalFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as DataFile;
      setData(json);
      setError(null);
      if (!hashId) {
        const firstClass = Object.keys(json.classes ?? {})[0] ?? null;
        if (firstClass) setHashId(firstClass);
      }
    } catch (e) {
      setError("Niepoprawny plik JSON.");
    }
  };

  const meta = data?.metadata;
  const refs = { teachers: data?.teachers ?? {}, rooms: data?.rooms ?? {}, classes: data?.classes ?? {} };

  // Zbuduj listy do wyszukiwania
  const pickList = useMemo(() => {
    if (!data) return [] as { id: string; label: string; type: "teachers" | "classes" | "rooms" }[];
    const entries = Object.entries({
      teachers: data.teachers ?? {},
      classes: data.classes ?? {},
      rooms: data.rooms ?? {},
    }) as ["teachers" | "classes" | "rooms", RefTables][];
    const list = entries.flatMap(([type, table]) =>
      Object.entries(table).map(([id, label]) => ({ id, label, type }))
    );
    return list;
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withinTab = pickList.filter((x) => x.type === entityTab);
    if (!q) return withinTab.slice(0, 1000);
    return withinTab
      .filter((x) => x.label.toLowerCase().includes(q) || x.id.toLowerCase().includes(q))
      .slice(0, 1000);
  }, [pickList, entityTab, query]);

  // Aktualnie wybrany plan
  const activeId = hashId && data?.timetables?.[hashId] ? hashId : null;
  const activeKind = idToKind(activeId ?? undefined);
  const activeName = activeId ?
    (activeKind === "class" ? refs.classes[activeId] : activeKind === "teacher" ? refs.teachers[activeId] : refs.rooms[activeId]) : "";

  // Filtry: dni + grupa (1/2, 2/2, wszystkie)
  const activeLessons: Lesson[] = useMemo(() => {
    const arr = (activeId && data?.timetables?.[activeId]) || [];
    return arr.filter((l) => {
      if (!selectedDays.includes(l.day)) return false;
      if (groupHalf === "all") return true;
      const mark = extractHalfMark(l.subject);
      // Pokaż lekcje bez oznaczenia (całoklasowe) oraz te, które pasują do wybranej podgrupy
      return !mark || mark === groupHalf;
    });
  }, [activeId, data, selectedDays, groupHalf]);

  const daysInData = useMemo(() => {
    const dset = new Set<string>();
    (activeId && data?.timetables?.[activeId] ? data!.timetables[activeId] : []).forEach((l) => dset.add(l.day));
    const all = Array.from(dset);
    all.sort(cmpDay);
    return all;
  }, [activeId, data]);

  // Dostępne podgrupy (np. 1/2, 2/2, opcjonalnie 1/3, 2/3, 3/3) tylko dla aktywnego planu
  const availableGroupMarks = useMemo(() => {
    const marks = new Set<string>();
    const lessons = (activeId && data?.timetables?.[activeId]) || [];
    for (const l of lessons) {
      const m = extractHalfMark(l.subject);
      if (m) marks.add(m);
    }
    // sortuj po mianowniku, potem liczniku
    return Array.from(marks).sort((a, b) => {
      const [an, ad] = a.split("/").map((x) => parseInt(x, 10));
      const [bn, bd] = b.split("/").map((x) => parseInt(x, 10));
      return ad - bd || an - bn;
    });
  }, [activeId, data]);

  // wymiary siatki (zbiór numerów lekcji + czasy)
  const periods = useMemo(() => {
    const map = new Map<string, { lesson_num: string; time: string }>();
    activeLessons.forEach((l) => {
      const key = `${l.lesson_num}|${l.time}`;
      if (!map.has(key)) map.set(key, { lesson_num: l.lesson_num, time: l.time });
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const na = parseInt(a.lesson_num, 10);
      const nb = parseInt(b.lesson_num, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return (a.time ?? "").localeCompare(b.time ?? "");
    });
    return arr;
  }, [activeLessons]);

  const lessonsByDay = useMemo(() => {
    const byDay = new Map<string, Lesson[]>();
    activeLessons.forEach((l) => {
      const list = byDay.get(l.day) ?? [];
      list.push(l);
      byDay.set(l.day, list);
    });
    for (const list of byDay.values()) list.sort(cmpLesson);
    return byDay;
  }, [activeLessons]);

  const goTo = (id: string) => setHashId(id);

  // Mobile detection and single-day navigation
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (daysInData.length === 0) return;
    setMobileDay((prev) => {
      if (prev && daysInData.includes(prev)) return prev;
      const savedDay = localStorage.getItem('timetable.lastDay') || undefined;
      const candidate = savedDay && daysInData.includes(savedDay) ? savedDay : (daysInData.find((d) => d === "Poniedziałek") || daysInData[0]);
      return candidate;
    });
  }, [daysInData]);

  useEffect(() => {
    if (isMobile && mobileDay) {
      setSelectedDays([mobileDay]);
    }
  }, [isMobile, mobileDay]);

  // Force list view on mobile and restore previous view when leaving mobile
  useEffect(() => {
    if (isMobile) {
      prevDesktopView.current = view;
      if (view !== "list") setView("list");
    } else {
      setView(prevDesktopView.current);
    }
  }, [isMobile]);

  // Inform parent (router) whether an overlay/drawer is open, so it can hide FABs
  useEffect(() => {
    onOverlayActiveChange?.(isMobile && mobileMenuOpen);
  }, [isMobile, mobileMenuOpen, onOverlayActiveChange]);

  const goPrevDay = () => {
    if (!mobileDay || daysInData.length === 0) return;
    const cur = daysInData.indexOf(mobileDay);
    const prev = (cur - 1 + daysInData.length) % daysInData.length;
    setMobileDay(daysInData[prev]);
  };
  const goNextDay = () => {
    if (!mobileDay || daysInData.length === 0) return;
    const cur = daysInData.indexOf(mobileDay);
    const next = (cur + 1) % daysInData.length;
    setMobileDay(daysInData[next]);
  };

  // Persist key selections
  useEffect(() => {
    if (hashId) localStorage.setItem('timetable.lastPlanId', hashId);
  }, [hashId]);
  useEffect(() => {
    if (entityTab) localStorage.setItem('timetable.lastEntityTab', entityTab);
  }, [entityTab]);
  useEffect(() => {
    if (groupHalf) localStorage.setItem('timetable.groupHalf', groupHalf);
  }, [groupHalf]);
  useEffect(() => {
    if (mobileDay) localStorage.setItem('timetable.lastDay', mobileDay);
  }, [mobileDay]);

  const renderLessonCard = (l: Lesson, key: React.Key) => {
    const parts: string[] = [];
    const normalizedKey = normalizeSubjectKey(l.subject);
    const subjectDisplay = overrides.subjectOverrides[normalizedKey] ?? l.subject;
    const teacherName = l.teacher?.name ?? null;
    const teacherDisplay = teacherName ? (overrides.teacherNameOverrides[teacherName] ?? teacherName) : null;
    if (activeKind !== "class" && l.group) parts.push(`Klasa: ${l.group.name}`);
    if (activeKind !== "teacher" && teacherDisplay) parts.push(`Nauczyciel: ${teacherDisplay}`);
    if (activeKind !== "room" && l.room) parts.push(`Sala: ${l.room.name}`);
    const half = extractHalfMark(l.subject);

    const crossLinks = (
      <div className="mt-1 flex flex-wrap gap-1">
        {l.group ? (
          <button
            className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 border border-blue-800"
            title={`Przejdź do planu klasy ${l.group.name}`}
            onClick={() => goTo(l.group!.id)}
          >
            {l.group.name}
          </button>
        ) : null}
        {l.teacher ? (
          <button
            className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-200 border border-emerald-800"
            title={`Przejdź do planu nauczyciela ${l.teacher.name}`}
            onClick={() => goTo(l.teacher!.id)}
          >
            {l.teacher.name}
          </button>
        ) : null}
        {l.room ? (
          <button
            className="text-xs px-2 py-0.5 rounded-full bg-violet-900/40 hover:bg-violet-900/60 text-violet-200 border border-violet-800"
            title={`Przejdź do planu sali ${l.room.name}`}
            onClick={() => goTo(l.room!.id)}
          >
            {l.room.name}
          </button>
        ) : null}
      </div>
    );

    return (
      <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-sm hover:shadow transition-shadow">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-200">
              {l.lesson_num || "?"}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-zinc-50 truncate">
                {subjectDisplay || <span className="text-zinc-500">(brak nazwy)</span>}
              </div>
              {half && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-200 border border-amber-800 whitespace-nowrap" title="Lekcja w grupie">
                  {half}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {l.time || "(czas nieznany)"}
            </div>
            {crossLinks}
          </div>
        </div>
      </div>
    );
  };

  const handlePrint = () => window.print();
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Skopiowano link do schowka.");
    } catch {
      alert("Nie udało się skopiować linku. Skopiuj z paska adresu.");
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) {
        const msg = await res.text();
        alert(`Błąd podczas odświeżania: ${msg || res.status}`);
        return;
      }
      await loadData();
      alert("Plan został odświeżony.");
    } catch (e) {
      alert("Nie udało się uruchomić odświeżania.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(loginForm),
      });
      if (!res.ok) {
        alert('Logowanie nieudane');
        return;
      }
      setIsAuth(true);
      await loadOverrides();
    } catch {}
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setIsAuth(false);
    }
  };

  const saveOverrides = async () => {
    try {
      const res = await fetch('/api/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(overrides),
      });
      if (!res.ok) {
        alert('Nie udało się zapisać zmian.');
        return;
      }
      alert('Zapisano zmiany.');
    } catch {
      alert('Błąd zapisu.');
    }
  };

  // ==========================================
  // RENDER (ciemny motyw)
  // ==========================================
  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-950 to-black text-zinc-100 overflow-x-hidden">
      {/* Minimal header – ukryty na mobile, bez tytułu, tylko akcje na desktop */}
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/70 border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-3">
          {!isMobile && <CalendarDays className="w-5 h-5 text-zinc-200" />}
          {/* Mobile: nazwa planu + nawigacja po dniach w top barze */}
          {isMobile && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="text-base font-semibold truncate">{activeName || '—'}</div>
              {daysInData.length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                    onClick={goPrevDay}
                    aria-label="Poprzedni dzień"
                    title="Poprzedni dzień"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <select
                    aria-label="Wybierz dzień"
                    className="px-2 py-1 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 max-w-[140px]"
                    value={mobileDay ?? ''}
                    onChange={(e) => setMobileDay(e.target.value)}
                  >
                    {[...daysInData].sort(cmpDay).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <button
                    className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                    onClick={goNextDay}
                    aria-label="Następny dzień"
                    title="Następny dzień"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 print:hidden">
            {!isMobile && (
              <>
                <button onClick={handlePrint} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                  <Printer className="w-4 h-4" /> Drukuj / PDF
                </button>
                <button onClick={handleShare} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                  <Share2 className="w-4 h-4" /> Udostępnij
                </button>
                <button
                  onClick={() => setAdminOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                >
                  Panel admina
                </button>
              </>
            )}
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-zinc-700 bg-zinc-800 text-white"
                aria-label="Otwórz menu"
              >
                <span aria-hidden="true" className="text-2xl font-bold leading-none">☰</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Pasek statusu/metadanych */}
        {!isMobile && (
        <section className="mb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {meta?.generation_date_from_page && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/40 text-emerald-200 border border-emerald-800">
                <Info className="w-3.5 h-3.5" /> Aktualność planu (VULCAN): <strong className="ml-1">{meta.generation_date_from_page}</strong>
              </span>
            )}
            {meta?.scraped_on && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-900/40 text-blue-200 border border-blue-800">
                <RefreshCw className="w-3.5 h-3.5" /> Zebrano: <strong className="ml-1">{meta.scraped_on}</strong>
              </span>
            )}
            {meta?.source && (
              <a href={meta.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-900/40 text-violet-200 border border-violet-800 hover:underline">
                Źródło planu
              </a>
            )}
          </div>
        </section>
        )}

        {/* Loader / błąd / upload lokalny */}
        {loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
            Wczytywanie danych planu…
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-amber-800 bg-zinc-900 p-4 text-amber-200">
            <p className="mb-3">{error}</p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer hover:bg-zinc-700">
              <Upload className="w-4 h-4" /> Wybierz plik JSON
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickLocalFile(f);
                }}
              />
            </label>
          </div>
        )}

        {/* Panel wyboru encji – desktop only */}
        {data && !isMobile && (
          <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm print:hidden ${isMobile ? 'p-3' : 'p-4'}`}>
            <div className="flex flex-wrap items-center gap-2">
              {!isMobile ? (
                <div className="inline-flex rounded-lg bg-zinc-800 p-1">
                  {([
                    { key: "teachers", label: "Nauczyciele" },
                    { key: "classes", label: "Klasy" },
                    { key: "rooms", label: "Sale" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        entityTab === t.key ? "bg-zinc-900 shadow border border-zinc-700" : "text-zinc-300 hover:text-zinc-100"
                      }`}
                      onClick={() => setEntityTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  aria-label="Typ planu"
                  className="px-3 py-1.5 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100"
                  value={entityTab}
                  onChange={(e) => setEntityTab(e.target.value as any)}
                >
                  <option value="teachers">Nauczyciele</option>
                  <option value="classes">Klasy</option>
                  <option value="rooms">Sale</option>
                </select>
              )}

              {!isMobile ? (
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                  <input
                    aria-label="Filtruj listę planów po nazwie lub ID"
                    className="w-full pl-8 pr-3 py-2 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    placeholder={`Szukaj po nazwie lub ID…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    list="entity-suggestions"
                  />
                  <datalist id="entity-suggestions">
                    {filtered.slice(0, 50).map((x) => (
                      <option key={x.id} value={x.label} />
                    ))}
                  </datalist>
                </div>
              ) : null}

              {!isMobile && (
                <div className="min-w-[200px]">
                  <select
                    aria-label="Wybierz plan z listy"
                    className="px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 w-full"
                    value={hashId ?? ""}
                    onChange={(e) => setHashId(e.target.value || null)}
                  >
                    <option value="">— Wybierz —</option>
                    {filtered.map((x) => (
                      <option key={x.id} value={x.id}>{x.label} ({x.id})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Przełącznik widoku */}
              {!isMobile && (
                <div className="ml-auto inline-flex rounded-lg bg-zinc-800 p-1">
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm transition inline-flex items-center gap-1 ${view === "grid" ? "bg-zinc-900 shadow border border-zinc-700" : "text-zinc-300 hover:text-zinc-100"}`}
                    onClick={() => setView("grid")}
                    title="Widok siatki (dni × lekcje)"
                  >
                    <Columns3 className="w-4 h-4" /> Siatka
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm transition inline-flex items-center gap-1 ${view === "list" ? "bg-zinc-900 shadow border border-zinc-700" : "text-zinc-300 hover:text-zinc-100"}`}
                    onClick={() => setView("list")}
                    title="Widok listy (dzień po dniu)"
                  >
                    <Rows3 className="w-4 h-4" /> Lista
                  </button>
                </div>
              )}
            </div>

            {/* Filtry: dni tygodnia + grupa 1/2 (desktop) */}
            {daysInData.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {!isMobile ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {[...daysInData].sort(cmpDay).map((d) => {
                        const on = selectedDays.includes(d);
                        return (
                          <button
                            key={d}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${
                              on ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-800"
                            }`}
                            onClick={() =>
                              setSelectedDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))
                            }
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>

                    {availableGroupMarks.length > 0 && (
                      <div className="ml-auto inline-flex rounded-full bg-zinc-800 p-1">
                        <button
                          className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === 'all' ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
                          onClick={() => setGroupHalf('all')}
                          title="Pokaż wszystkie"
                        >
                          Wszystkie
                        </button>
                        {availableGroupMarks.map((m) => (
                          <button
                            key={m}
                            className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === m ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
                            onClick={() => setGroupHalf(m)}
                            title={`Filtr grupy ${m}`}
                          >
                            {`Grupa ${m}`}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="inline-flex gap-2">
                      <button
                        className="px-3 py-1.5 rounded-full text-sm border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                        onClick={() => setSelectedDays(daysInData)}
                      >
                        Zaznacz wszystkie dni
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-full text-sm border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                        onClick={() => setSelectedDays([])}
                      >
                        Wyczyść dni
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        )}

        {/* Zawartość – wybrany plan */}
        {data && activeId && (
          <section className="mt-1">
              <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                {!isMobile && (
                  <h2 className="text-xl font-semibold tracking-tight">
                    {prettyKind(activeKind)}: {activeName}
                  </h2>
                )}
                {/* Przeniesiono wybór dnia do top bar (mobile). Tutaj nic nie renderujemy. */}
              </div>
                <div className={`print:hidden ${isMobile ? 'hidden' : ''}`}>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                >
                  <Printer className="w-4 h-4" /> Drukuj ten plan
                </button>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {view === "grid" ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm"
                  onTouchStart={(e) => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                  onTouchEnd={(e) => {
                    const st = swipeStart.current; swipeStart.current = null;
                    if (!st || !isMobile) return;
                    const dx = e.changedTouches[0].clientX - st.x;
                    const dy = e.changedTouches[0].clientY - st.y;
                    if (Math.abs(dx) > 40 && Math.abs(dy) < 30) {
                      if (dx < 0) goNextDay(); else goPrevDay();
                    }
                  }}
                >
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-800/70 border-b border-zinc-800">
                        {daysInData
                          .filter((d) => selectedDays.includes(d))
                          .sort(cmpDay)
                          .map((d) => (
                            <th key={d} className="p-3 text-left min-w-[220px] font-medium text-zinc-200">{d}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.length === 0 && (
                        <tr>
                          <td className="p-4 text-zinc-400" colSpan={99}>
                            Brak danych do wyświetlenia dla wybranych filtrów.
                          </td>
                        </tr>
                      )}
                      {periods.map((p) => (
                        <tr key={`${p.lesson_num}|${p.time}`} className="border-b border-zinc-800 last:border-b-0">
                          {daysInData
                            .filter((d) => selectedDays.includes(d))
                            .sort(cmpDay)
                            .map((d) => {
                              const inCell = activeLessons.filter(
                                (l) => l.day === d && l.lesson_num === p.lesson_num && l.time === p.time
                              );
                              return (
                                <td key={`${d}|${p.lesson_num}`} className="p-2 align-top">
                                  {inCell.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-600">
                                      —
                                    </div>
                                  ) : (
                                    <div className="grid gap-2">
                                      {inCell.map((l, idx) => renderLessonCard(l, `${d}|${p.lesson_num}|${idx}`))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="grid gap-4"
                  onTouchStart={(e) => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                  onTouchEnd={(e) => {
                    const st = swipeStart.current; swipeStart.current = null;
                    if (!st || !isMobile) return;
                    const dx = e.changedTouches[0].clientX - st.x;
                    const dy = e.changedTouches[0].clientY - st.y;
                    if (Math.abs(dx) > 40 && Math.abs(dy) < 30) {
                      if (dx < 0) goNextDay(); else goPrevDay();
                    }
                  }}
                >
                  {Array.from(lessonsByDay.keys())
                    .filter((d) => selectedDays.includes(d))
                    .sort(cmpDay)
                    .map((d) => (
                      <div key={d} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
                        {!isMobile && <div className="text-sm font-semibold mb-3 text-zinc-200">{d}</div>}
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {lessonsByDay.get(d)!.map((l, i) => renderLessonCard(l, `${d}|${i}`))}
                        </div>
                      </div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* brak wyboru */}
        {data && !activeId && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Wybierz nauczyciela, klasę lub salę, aby zobaczyć plan.
          </div>
        )}
      </main>

      {/* Mobile drawer menu */}
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-7xl grid gap-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Ustawienia planu</div>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span aria-hidden className="text-lg leading-none">✕</span>
                  Zamknij
                </button>
              </div>

              <select
                aria-label="Typ planu"
                className="px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100"
                value={entityTab}
                onChange={(e) => setEntityTab(e.target.value as any)}
              >
                <option value="teachers">Nauczyciele</option>
                <option value="classes">Klasy</option>
                <option value="rooms">Sale</option>
              </select>

              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  aria-label="Filtruj listę planów po nazwie lub ID"
                  className="w-full pl-8 pr-3 py-2 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  placeholder={`Szukaj po nazwie lub ID…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div>
                <select
                  aria-label="Wybierz plan z listy"
                  className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100"
                  value={hashId ?? ''}
                  onChange={(e) => setHashId(e.target.value || null)}
                >
                  <option value="">— Wybierz —</option>
                  {filtered.map((x) => (
                    <option key={x.id} value={x.id}>{x.label} ({x.id})</option>
                  ))}
                </select>
              </div>

              {availableGroupMarks.length > 0 && (
                <div className="inline-flex rounded-full bg-zinc-800 p-1">
                  <button
                    className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === 'all' ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
                    onClick={() => setGroupHalf('all')}
                    title="Pokaż wszystkie"
                  >
                    Wszystkie
                  </button>
                  {availableGroupMarks.map((m) => (
                    <button
                      key={m}
                      className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === m ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
                      onClick={() => setGroupHalf(m)}
                      title={`Filtr grupy ${m}`}
                    >
                      {`Grupa ${m}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel admina */}
      {adminOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Panel administratora</div>
              <div className="flex items-center gap-2">
                {isAuth && (
                  <button onClick={handleLogout} className="text-sm px-2 py-1 border border-zinc-700 rounded-md bg-zinc-800">Wyloguj</button>
                )}
                <button onClick={() => setAdminOpen(false)} className="text-sm px-2 py-1 border border-zinc-700 rounded-md bg-zinc-800">Zamknij</button>
              </div>
            </div>

            {!isAuth ? (
              <form onSubmit={handleLogin} className="grid gap-2">
                <div className="text-sm text-zinc-400">Zaloguj się, aby zarządzać danymi.</div>
                <input
                  className="px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700"
                  placeholder="Nazwa użytkownika"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
                />
                <input
                  type="password"
                  className="px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700"
                  placeholder="Hasło"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
                />
                <button className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500">Zaloguj</button>
                <div className="text-xs text-zinc-500">Przykładowe konto: admin / admin123</div>
              </form>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Odświeżenie planu</div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 ${refreshing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-zinc-700'}`}
                      title="Uruchom scraper i uaktualnij plik timetable_data.json"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Odświeżanie…' : 'Odśwież teraz'}
                    </button>
                  </div>
                  <div className="text-xs text-zinc-400">Po zakończeniu plan zostanie ponownie wczytany.</div>
                </div>

                <div className="rounded-xl border border-zinc-800 p-3 grid gap-3">
                  <div className="font-medium">Nadpisania nazw</div>
                  <div className="text-xs text-zinc-400">Uzupełnij listy z poniższych propozycji i wpisz własne wartości. Klucze przedmiotów są normalizowane (bez oznaczeń grup, np. 1/2, 2/3).</div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm">Przedmioty (oryginał → wyświetlana)</div>
                        <input
                          className="text-xs px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                          placeholder="Szukaj przedmiotu"
                          value={subjectFilter}
                          onChange={(e) => setSubjectFilter(e.target.value)}
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-md">
                        {Array.from(new Set((data?.timetables ? Object.values(data.timetables).flat().map(l => normalizeSubjectKey(l.subject)) : []).filter(Boolean)))
                          .filter((key) => key.includes(subjectFilter.toLowerCase().trim()))
                          .slice(0, 200)
                          .sort()
                          .map((key) => (
                            <div key={key as string} className="flex items-center gap-2 p-2 border-b border-zinc-800 last:border-b-0">
                              <div className="text-xs text-zinc-400 min-w-0 flex-1 truncate" title={key as string}>{key as string}</div>
                              <input
                                className="text-sm px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                                placeholder="Wyświetlana nazwa"
                                value={overrides.subjectOverrides[key as string] ?? ''}
                                onChange={(e) => setOverrides((s) => ({ ...s, subjectOverrides: { ...s.subjectOverrides, [key as string]: e.target.value } }))}
                              />
                              <button
                                className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                                onClick={() => setOverrides((s) => {
                                  const copy = { ...s.subjectOverrides };
                                  delete copy[key as string];
                                  return { ...s, subjectOverrides: copy };
                                })}
                              >Wyczyść</button>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm">Nauczyciele (skrót → pełna nazwa)</div>
                        <input
                          className="text-xs px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                          placeholder="Szukaj nauczyciela"
                          value={teacherFilter}
                          onChange={(e) => setTeacherFilter(e.target.value)}
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-md">
                        {Object.values(data?.teachers ?? {})
                          .filter((shortName) => shortName.toLowerCase().includes(teacherFilter.toLowerCase().trim()))
                          .slice(0, 300)
                          .sort()
                          .map((shortName) => (
                            <div key={shortName} className="flex items-center gap-2 p-2 border-b border-zinc-800 last:border-b-0">
                              <div className="text-xs text-zinc-400 min-w-0 flex-1 truncate" title={shortName}>{shortName}</div>
                              <input
                                className="text-sm px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                                placeholder="Pełna nazwa"
                                value={overrides.teacherNameOverrides[shortName] ?? ''}
                                onChange={(e) => setOverrides((s) => ({ ...s, teacherNameOverrides: { ...s.teacherNameOverrides, [shortName]: e.target.value } }))}
                              />
                              <button
                                className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                                onClick={() => setOverrides((s) => {
                                  const copy = { ...s.teacherNameOverrides };
                                  delete copy[shortName];
                                  return { ...s, teacherNameOverrides: copy };
                                })}
                              >Wyczyść</button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveOverrides} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500">Zapisz nadpisania</button>
                    <button onClick={() => { setOverrides({ subjectOverrides: {}, teacherNameOverrides: {} }); }} className="px-3 py-2 rounded-md border border-zinc-700 hover:bg-zinc-800">Wyczyść wszystko</button>
                  </div>
                  <div className="text-xs text-zinc-500">Zmiany przechowywane są w pliku public/overrides.json. Klucze przedmiotów są normalizowane, więc wpisz nazwę bez końcówki 1/2.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Stopka do druku – pokazuje źródło */}
      <footer className={`${isMobile ? 'block' : 'hidden'} print:block mx-auto max-w-7xl px-4 py-8 text-xs text-zinc-500`}>
        {isMobile && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {meta?.generation_date_from_page && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/40 text-emerald-200 border border-emerald-800">
                <Info className="w-3.5 h-3.5" /> Aktualność planu (VULCAN): <strong className="ml-1">{meta.generation_date_from_page}</strong>
              </span>
            )}
            {meta?.scraped_on && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-900/40 text-blue-200 border border-blue-800">
                <RefreshCw className="w-3.5 h-3.5" /> Zebrano: <strong className="ml-1">{meta.scraped_on}</strong>
              </span>
            )}
            {meta?.source && (
              <a href={meta.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-900/40 text-violet-200 border border-violet-800 hover:underline">
                Źródło planu
              </a>
            )}
          </div>
        )}
        {meta?.source && (
          <div>
            Źródło oryginalne: <span className="underline break-all">{meta.source}</span>
          </div>
        )}
        <div className="mt-1">
          Wygenerowano z interaktywnej przeglądarki planu.
        </div>
      </footer>

      {/* Style do druku (jasny, czytelny) */}
      <style>{`
        @media print {
          html, body {
            background-color: white !important;
            color: black !important;
          }
          header, .print\\:hidden, footer:not(print\\:block) { 
            display: none !important;
          }
          main { 
            padding: 0 !important; margin: 0 !important;
          }
          .rounded-xl, .rounded-2xl, .rounded-lg {
             border-radius: 0 !important;
          }
          .shadow-sm {
            box-shadow: none !important;
          }
          table { 
            page-break-inside: avoid; 
            width: 100% !important;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          td, th { 
            break-inside: avoid; 
          }
          .bg-zinc-900, .bg-zinc-950, .bg-zinc-800, .bg-zinc-800\\/70 { 
            background: white !important; 
          }
          .text-zinc-50, .text-zinc-100, .text-zinc-200, .text-zinc-300, .text-zinc-400, .text-zinc-500, .text-zinc-600 { 
            color: black !important; 
          }
          .border-zinc-800, .border-zinc-700 { 
            border-color: #ccc !important; 
          }
          .border-dashed {
            border-style: solid !important;
          }
        }
      `}</style>
    </div>
  );
}