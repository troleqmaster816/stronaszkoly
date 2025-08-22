import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Printer, Share2, Upload, Rows3, Columns3, Info, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { Overrides, Lesson, RefTables } from '@/types/schedule';
import { DAY_ORDER, cmpDay, cmpLesson, idToKind, prettyKind, extractHalfMark, normalizeSubjectKey } from '@/lib/schedule';
import { DataFileSchema, OverridesSchema, fetchJsonValidated } from '@/lib/api';
import { useHashId } from '@/features/timetable/hooks/useHashId';
import { GridView } from '@/features/timetable/components/GridView';
import { ListView } from '@/features/timetable/components/ListView';
import { EntityPicker } from '@/features/timetable/components/EntityPicker';
import { FiltersBar } from '@/features/timetable/components/FiltersBar';
import { AdminPanel } from '@/features/timetable/components/AdminPanel';


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
  const deferredQuery = useDeferredValue(query);
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
      const json = await fetchJsonValidated(`/timetable_data.json?t=${Date.now()}`, DataFileSchema);
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
      if (j?.ok && j.data) {
        const parsed = OverridesSchema.safeParse(j.data)
        if (parsed.success) setOverrides(parsed.data)
      }
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
    const q = deferredQuery.trim().toLowerCase();
    const withinTab = pickList.filter((x) => x.type === entityTab);
    if (!q) return withinTab.slice(0, 1000);
    return withinTab
      .filter((x) => x.label.toLowerCase().includes(q) || x.id.toLowerCase().includes(q))
      .slice(0, 1000);
  }, [pickList, entityTab, deferredQuery]);

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

  // Compact formatter for print cells
  const formatPrintCell = (l: Lesson): string => {
    const normalizedKey = normalizeSubjectKey(l.subject);
    const subjectDisplay = overrides.subjectOverrides[normalizedKey] ?? l.subject;
    const half = extractHalfMark(l.subject);
    const extraParts: string[] = [];
    const teacherName = l.teacher?.name ?? '';
    const roomName = l.room?.name ?? '';
    if (activeKind !== 'teacher' && teacherName) extraParts.push(teacherName);
    if (activeKind !== 'room' && roomName) extraParts.push(roomName);
    const groupText = activeKind === 'class' ? (l.group?.name ?? half ?? '') : (l.group?.name ?? '');
    const subjectWithGroup = groupText ? `${subjectDisplay} ${groupText}` : subjectDisplay;
    return extraParts.length > 0 ? `${subjectWithGroup} (${extraParts.join(', ')})` : subjectWithGroup;
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

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      const username = String(fd.get('username') || '');
      const password = String(fd.get('password') || '');
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
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
        <div className="print:hidden">
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
            <EntityPicker
              entityTab={entityTab as any}
              setEntityTab={(t) => setEntityTab(t)}
              query={query}
              setQuery={setQuery}
              options={filtered.map((x) => ({ id: x.id, label: x.label }))}
              selectedId={hashId}
              onSelectId={(id) => setHashId(id)}
              view={view}
              setView={setView}
            />

            {daysInData.length > 0 && (
              <FiltersBar
                days={daysInData}
                selectedDays={selectedDays}
                onToggleDay={(d) => setSelectedDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                availableGroupMarks={availableGroupMarks}
                groupHalf={groupHalf}
                setGroupHalf={setGroupHalf}
              />
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
            </div>

            <AnimatePresence mode="popLayout">
              {view === "grid" ? (
                <GridView
                  daysInData={daysInData}
                  selectedDays={selectedDays}
                  periods={periods}
                  activeLessons={activeLessons}
                  isMobile={isMobile}
                  onSwipePrev={goPrevDay}
                  onSwipeNext={goNextDay}
                  onRenderLesson={renderLessonCard}
                />
              ) : (
                <ListView
                  daysInData={daysInData}
                  selectedDays={selectedDays}
                  lessonsByDay={lessonsByDay}
                  isMobile={isMobile}
                  onSwipePrev={goPrevDay}
                  onSwipeNext={goNextDay}
                  onRenderLesson={renderLessonCard}
                />
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
        </div>

        {/* PRINT-ONLY simplified view */}
        {data && activeId && (
          <section className="print-only">
            <div className="print-page print-container" style={{ marginBottom: 0 }}>
              <div className="print-title">
                {prettyKind(activeKind)}: {activeName}
              </div>
              {/* Compact one-page matrix: Days as columns, lesson numbers as rows */}
              {(() => {
                const colDays = [...daysInData].sort(cmpDay);
                const lessonNumbers = Array.from(new Set(
                  (data?.timetables?.[activeId] || []).map((l) => l.lesson_num || '-')
                )).sort((a, b) => parseInt(a || '0', 10) - parseInt(b || '0', 10));

                return (
                  <table className="print-table matrix" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '6%' }}>Nr</th>
                        <th style={{ width: '14%' }}>Godziny</th>
                        {colDays.map((d) => (
                          <th key={d}>{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lessonNumbers.map((num) => {
                        // gather all lessons for this lesson number to pick the time per day
                        const perDay = colDays.map((d) => (data?.timetables?.[activeId] || []).filter((l) => l.day === d && (l.lesson_num || '-') === num));
                        const any = perDay.flat();
                        const time = any.find((l) => l.time)?.time || '—';
                        return (
                          <tr key={`row-${num}`}>
                            <td>{num}</td>
                            <td>{time}</td>
                            {perDay.map((list, i) => (
                              <td key={`${num}-c${i}`}>{
                                list.length === 0 ? '—' : list.map(formatPrintCell).join(' | ')
                              }</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </section>
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
        <AdminPanel
          isAuth={isAuth}
          onLogin={handleLogin}
          onLogout={handleLogout}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          overrides={overrides}
          setOverrides={setOverrides}
          subjectKeys={Array.from(new Set((data?.timetables ? Object.values(data.timetables).flat().map(l => normalizeSubjectKey(l.subject)) : []).filter(Boolean))) as string[]}
          subjectFilter={subjectFilter}
          setSubjectFilter={setSubjectFilter}
          teacherShortNames={Object.values(data?.teachers ?? {})}
          teacherFilter={teacherFilter}
          setTeacherFilter={setTeacherFilter}
          onClose={() => setAdminOpen(false)}
        />
      )}
      {/* Stopka – ukryta w trybie druku, żeby nie wymuszać drugiej strony */}
      <footer className={`${isMobile ? 'block' : 'hidden'} print:hidden mx-auto max-w-7xl px-4 py-8 text-xs text-zinc-500`}>
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

      {/* Style do druku przeniesione do src/styles/print.css */}
    </div>
  );
}