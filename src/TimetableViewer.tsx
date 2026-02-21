import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, Printer, Share2, Upload, Info, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { Lesson, RefTables } from '@/types/schedule';
import type { DataFile } from '@/lib/api';
import { cmpDay, cmpLesson, idToKind, prettyKind, extractHalfMark, normalizeSubjectKey, stripHalfMark } from '@/lib/schedule';
import { useNavigate, useParams } from 'react-router-dom';
import { useTimetableData } from '@/features/timetable/hooks/useTimetableData';
import { GridView } from '@/features/timetable/components/GridView';
import type { TimetableDensity } from '@/features/timetable/components/GridView';
import { ListView } from '@/features/timetable/components/ListView';
import { EntityPicker } from '@/features/timetable/components/EntityPicker';
import { FiltersBar } from '@/features/timetable/components/FiltersBar';
import { AnimatedBackdrop } from '@/features/timetable/components/AnimatedBackdrop';
import { extractRoomCode, formatRoomDisplay } from '@/features/timetable/lib/roomDisplay';
import {
  compactGroupLabel,
  compactRoomLabel,
  computeAdaptiveLayoutProfile,
  getAvailableShellWidth,
  type ChipLayoutMode,
  type LabelMode,
} from '@/features/timetable/lib/layoutProfile';
import {
  compactTeacherLabel,
  resolveTeacherOverrideKey,
  type TeacherOverrideEntry,
} from '@/features/timetable/lib/teacherOverrides';
import { useAuth } from '@/features/auth/useAuth';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/apiClient';
import { readErrorMessage } from '@/lib/http';

const AdminPanel = React.lazy(() => import('@/features/timetable/components/AdminPanel'))

function toRouteEntityToken(id: string | null | undefined): string {
  if (!id) return ''
  const kind = idToKind(id)
  if (kind && id.length > 1) return id.slice(1)
  return id
}

function resolveRouteEntityToken({
  token,
  refs,
  preferredType,
}: {
  token: string
  refs: { teachers: RefTables; classes: RefTables; rooms: RefTables }
  preferredType?: 'teachers' | 'classes' | 'rooms'
}): string | null {
  const t = token.trim()
  if (!t) return null

  const candidates: string[] = []
  const maybeDirect = t
  if (maybeDirect in refs.classes || maybeDirect in refs.teachers || maybeDirect in refs.rooms) candidates.push(maybeDirect)

  const classId = `o${t}`
  const teacherId = `n${t}`
  const roomId = `s${t}`
  if (classId in refs.classes) candidates.push(classId)
  if (teacherId in refs.teachers) candidates.push(teacherId)
  if (roomId in refs.rooms) candidates.push(roomId)

  const uniq = Array.from(new Set(candidates))
  if (uniq.length === 0) return null
  if (uniq.length === 1) return uniq[0]

  if (preferredType === 'classes') {
    const hit = uniq.find((id) => id.startsWith('o'))
    if (hit) return hit
  }
  if (preferredType === 'teachers') {
    const hit = uniq.find((id) => id.startsWith('n'))
    if (hit) return hit
  }
  if (preferredType === 'rooms') {
    const hit = uniq.find((id) => id.startsWith('s'))
    if (hit) return hit
  }

  return uniq[0]
}

// ==========================================
// Komponent – główny (DARK ONLY)
// ==========================================
export default function TimetableViewer({ onOverlayActiveChange }: { onOverlayActiveChange?: (active: boolean) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate()
  const params = useParams<{ entity?: string }>()
  const routeEntityToken = (params.entity || '').trim()
  const [hashId, setHashIdState] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const setHashId = useCallback((id: string | null, replace = false) => {
    setHashIdState(id)
    if (!id) {
      navigate('/plan', { replace })
      return
    }
    const token = encodeURIComponent(toRouteEntityToken(id))
    navigate(`/plan/${token}`, { replace })
  }, [navigate])
  const setHashIdReplace = useCallback((id: string) => {
    setHashId(id, true)
  }, [setHashId])
  const { data, setData, error, setError, loading, loadTimetable, isTimetableLoading, overrides, setOverrides, loadData, loadOverrides } = useTimetableData({ setHashId: setHashIdReplace, hasRouteSelection: !!routeEntityToken })
  const { isAuth, me, login, logout } = useAuth()
  const isAdmin = me?.id === 'admin'
  const toast = useToast()
  // loginForm removed; handle form values from event target
  const [subjectFilter, setSubjectFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");

  // UI
  const [entityTab, setEntityTab] = useState<"teachers" | "classes" | "rooms">(() => {
    try {
      const saved = localStorage.getItem('timetable.lastEntityTab');
      if (saved === 'teachers' || saved === 'classes' || saved === 'rooms') return saved;
    } catch { /* ignore */ }
    return "classes";
  });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth);
  const [selectedDays, setSelectedDays] = useState<string[]>(["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"]);
  const [groupHalfByClass, setGroupHalfByClass] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('timetable.groupHalfByClass')
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const next: Record<string, string> = {}
      for (const [classId, mark] of Object.entries(parsed ?? {})) {
        if (typeof mark === 'string' && mark) next[classId] = mark
      }
      return next
    } catch {
      return {}
    }
  });
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('timetable.animationsEnabled') === '1';
    } catch {
      return false;
    }
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const prevDesktopView = useRef<"grid" | "list">("grid");
  const wasMobileRef = useRef(false);
  // const [showMobileFilters, setShowMobileFilters] = useState(false); // deprecated small filters toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // swipeStart removed; swipe gestures not used currently
  const shellClassName = 'mx-auto px-4'

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
    } catch {
      setError("Niepoprawny plik JSON.");
    }
  };

  const meta = data?.metadata;
  const refs = { teachers: data?.teachers ?? {}, rooms: data?.rooms ?? {}, classes: data?.classes ?? {} };

  useEffect(() => {
    if (!data) return
    if (!routeEntityToken) return
    let decoded = routeEntityToken
    try {
      decoded = decodeURIComponent(routeEntityToken)
    } catch {
      decoded = routeEntityToken
    }
    const resolved = resolveRouteEntityToken({
      token: decoded,
      refs,
      preferredType: entityTab,
    })
    setHashIdState(resolved)
  }, [data, entityTab, routeEntityToken])

  const teacherOverrideEntries = useMemo<TeacherOverrideEntry[]>(() => {
    const teachers = data?.teachers ?? {}
    const overrideKeys = new Set(Object.keys(overrides.teacherNameOverrides))
    const rows: TeacherOverrideEntry[] = Object.entries(teachers).map(([id, label]) => {
      const originalName = String(label ?? '').trim() || id
      const shortName = resolveTeacherOverrideKey({
        teacherId: id,
        teacherLabel: originalName,
        overrideKeys,
      })
      return { id, shortName, originalName }
    })

    const knownShort = new Set(rows.map((r) => r.shortName))
    for (const shortName of Object.keys(overrides.teacherNameOverrides)) {
      if (knownShort.has(shortName)) continue
      rows.push({ id: null, shortName, originalName: shortName })
    }

    rows.sort((a, b) => a.shortName.localeCompare(b.shortName, 'pl', { sensitivity: 'base' }))
    return rows
  }, [data, overrides.teacherNameOverrides]);

  // Zbuduj listy do wyszukiwania
  const pickList = useMemo(() => {
    if (!data) return [] as { id: string; label: string; type: "teachers" | "classes" | "rooms" }[];
    const isMainClass = (label: string) => /^\d/.test((label || '').trim());
    const teacherEntries = teacherOverrideEntries
      .filter((entry) => !!entry.id)
      .map((entry) => [
        entry.id as string,
        overrides.teacherNameOverrides[entry.shortName] ?? entry.originalName,
      ] as const)
    const entries = Object.entries({
      teachers: Object.fromEntries(teacherEntries),
      classes: Object.fromEntries(
        Object.entries(data.classes ?? {}).filter(([, label]) => isMainClass(String(label)))
      ),
      rooms: data.rooms ?? {},
    }) as ["teachers" | "classes" | "rooms", RefTables][];
    const list = entries.flatMap(([type, table]) =>
      Object.entries(table).map(([id, label]) => ({ id, label, type }))
    );
    return list;
  }, [data, overrides.teacherNameOverrides, teacherOverrideEntries]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const withinTab = pickList.filter((x) => x.type === entityTab);
    if (!q) return withinTab.slice(0, 1000);
    return withinTab
      .filter((x) => x.label.toLowerCase().includes(q) || x.id.toLowerCase().includes(q))
      .slice(0, 1000);
  }, [pickList, entityTab, deferredQuery]);

  // Aktualnie wybrany plan
  const hashKind = idToKind(hashId ?? undefined)
  const activeId = hashId && (
    (hashKind === 'class' && Object.prototype.hasOwnProperty.call(refs.classes, hashId)) ||
    (hashKind === 'teacher' && Object.prototype.hasOwnProperty.call(refs.teachers, hashId)) ||
    (hashKind === 'room' && Object.prototype.hasOwnProperty.call(refs.rooms, hashId))
  ) ? hashId : null;
  const activeKind = idToKind(activeId ?? undefined);
  const hasActiveTimetable = !!(activeId && Object.prototype.hasOwnProperty.call(data?.timetables ?? {}, activeId))
  const activeTimetableLoading = isTimetableLoading(activeId)
  const activeName = activeId ?
    (activeKind === "class" ? refs.classes[activeId] : activeKind === "teacher" ? refs.teachers[activeId] : refs.rooms[activeId]) : "";

  const activeDisplayName = activeKind === 'room' ? formatRoomDisplay(activeName) : activeName;
  const isClassView = activeKind === 'class'
  const activeClassId = isClassView ? activeId : null
  const groupHalf = activeClassId ? (groupHalfByClass[activeClassId] ?? 'all') : 'all'

  const setGroupHalf = useCallback((nextMark: string) => {
    if (!activeClassId) return
    setGroupHalfByClass((prev) => {
      if (nextMark === 'all') {
        if (!(activeClassId in prev)) return prev
        const { [activeClassId]: _removed, ...rest } = prev
        return rest
      }
      if (prev[activeClassId] === nextMark) return prev
      return { ...prev, [activeClassId]: nextMark }
    })
  }, [activeClassId])

  useEffect(() => {
    const appTitle = 'ZSE Zduńska Wola'
    const pageTitle = activeDisplayName ? `Plan lekcji - ${activeDisplayName}` : 'Plan lekcji'
    document.title = `${pageTitle} | ${appTitle}`
  }, [activeDisplayName])

  useEffect(() => {
    if (!activeId || !data) return
    if (Object.prototype.hasOwnProperty.call(data.timetables ?? {}, activeId)) return
    let cancelled = false
    void loadTimetable(activeId).then((resolvedId) => {
      if (cancelled) return
      if (resolvedId && resolvedId !== activeId) setHashId(resolvedId)
    })
    return () => {
      cancelled = true
    }
  }, [activeId, data, loadTimetable, setHashId])

  // Filtry: dni + grupa (1/2, 2/2, wszystkie)
  const activeLessons: Lesson[] = useMemo(() => {
    const arr: Lesson[] = (activeId && data?.timetables?.[activeId]) || [];
    return arr.filter((l: Lesson) => {
      if (!selectedDays.includes(l.day)) return false;
      if (!isClassView) return true;
      if (groupHalf === "all") return true;
      const mark = extractHalfMark(l.subject);
      // Pokaż lekcje bez oznaczenia (całoklasowe) oraz te, które pasują do wybranej podgrupy
      return !mark || mark === groupHalf;
    });
  }, [activeId, data, selectedDays, groupHalf, isClassView]);

  const daysInData = useMemo(() => {
    const dset = new Set<string>();
    (activeId && data?.timetables?.[activeId] ? data!.timetables[activeId] : []).forEach((l: Lesson) => dset.add(l.day));
    const all = Array.from(dset);
    all.sort(cmpDay);
    return all;
  }, [activeId, data]);

  // Dostępne podgrupy (np. 1/2, 2/2, opcjonalnie 1/3, 2/3, 3/3) tylko dla aktywnego planu
  const availableGroupMarks = useMemo(() => {
    if (!isClassView) return []
    const marks = new Set<string>();
    const lessons: Lesson[] = (activeId && data?.timetables?.[activeId]) || [];
    for (const l of lessons) {
      const m = extractHalfMark(l.subject);
      if (m) marks.add(m);
    }
    // sortuj po mianowniku, potem liczniku
    return Array.from(marks).sort((a, b) => {
      const fracA = a.match(/^(\d+)\/(\d+)$/)
      const fracB = b.match(/^(\d+)\/(\d+)$/)
      if (fracA && fracB) {
        const an = parseInt(fracA[1], 10)
        const ad = parseInt(fracA[2], 10)
        const bn = parseInt(fracB[1], 10)
        const bd = parseInt(fracB[2], 10)
        return ad - bd || an - bn
      }
      if (fracA) return -1
      if (fracB) return 1

      const jA = a.match(/^j(\d+)$/i)
      const jB = b.match(/^j(\d+)$/i)
      if (jA && jB) return parseInt(jA[1], 10) - parseInt(jB[1], 10)
      if (jA) return -1
      if (jB) return 1

      return a.localeCompare(b, 'pl', { numeric: true, sensitivity: 'base' })
    });
  }, [activeId, data, isClassView]);

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

  const visibleDayCount = useMemo(
    () => Math.max(1, daysInData.filter((d) => selectedDays.includes(d)).length),
    [daysInData, selectedDays]
  )

  const layoutProfile = useMemo(() => {
    if (isMobile) {
      return {
        density: 'comfortable' as TimetableDensity,
        chipLayoutMode: 'inline' as ChipLayoutMode,
        labelMode: 'full' as LabelMode,
        shellMaxWidth: getAvailableShellWidth(viewportWidth),
        cellMinPx: 220,
      }
    }
    return computeAdaptiveLayoutProfile({
      viewportWidth,
      dayCount: visibleDayCount,
      lessons: activeLessons,
    })
  }, [activeLessons, isMobile, viewportWidth, visibleDayCount])

  const shellStyle = useMemo(
    () => (isMobile ? undefined : { maxWidth: `${Math.round(layoutProfile.shellMaxWidth)}px` }),
    [isMobile, layoutProfile.shellMaxWidth]
  )

  const goTo = useCallback((id: string) => {
    const nextKind = idToKind(id)
    if (nextKind === 'class') setEntityTab('classes')
    if (nextKind === 'teacher') setEntityTab('teachers')
    if (nextKind === 'room') setEntityTab('rooms')
    setHashId(id)
  }, [setHashId])

  // Mobile detection and single-day navigation
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  useEffect(() => {
    if (!activeKind) return
    const targetTab = activeKind === 'class' ? 'classes' : activeKind === 'teacher' ? 'teachers' : 'rooms'
    setEntityTab((prev) => (prev === targetTab ? prev : targetTab))
  }, [activeKind])

  // Force list view on mobile and restore previous view when leaving mobile
  useEffect(() => {
    const wasMobile = wasMobileRef.current

    if (isMobile) {
      if (view !== "list") {
        prevDesktopView.current = view;
        setView("list");
      }
      wasMobileRef.current = true
      return;
    }

    if (wasMobile && view === "list" && prevDesktopView.current !== "list") {
      setView(prevDesktopView.current);
    }

    wasMobileRef.current = false
  }, [isMobile, view]);

  // Inform parent (router) whether an overlay/drawer is open, so it can hide FABs
  useEffect(() => {
    onOverlayActiveChange?.(isMobile && mobileMenuOpen);
    return () => onOverlayActiveChange?.(false)
  }, [isMobile, mobileMenuOpen, onOverlayActiveChange]);

  const goPrevDay = useCallback(() => {
    if (!mobileDay || daysInData.length === 0) return;
    const cur = daysInData.indexOf(mobileDay);
    const prev = (cur - 1 + daysInData.length) % daysInData.length;
    setMobileDay(daysInData[prev]);
  }, [mobileDay, daysInData])

  const goNextDay = useCallback(() => {
    if (!mobileDay || daysInData.length === 0) return;
    const cur = daysInData.indexOf(mobileDay);
    const next = (cur + 1) % daysInData.length;
    setMobileDay(daysInData[next]);
  }, [mobileDay, daysInData])

  // Persist key selections
  useEffect(() => {
    if (hashId) localStorage.setItem('timetable.lastPlanId', hashId);
  }, [hashId]);
  useEffect(() => {
    if (entityTab) localStorage.setItem('timetable.lastEntityTab', entityTab);
  }, [entityTab]);
  useEffect(() => {
    localStorage.setItem('timetable.groupHalfByClass', JSON.stringify(groupHalfByClass));
  }, [groupHalfByClass]);
  useEffect(() => {
    if (mobileDay) localStorage.setItem('timetable.lastDay', mobileDay);
  }, [mobileDay]);
  useEffect(() => {
    localStorage.setItem('timetable.animationsEnabled', animationsEnabled ? '1' : '0');
  }, [animationsEnabled]);

  const renderLessonCard = useCallback((l: Lesson, key: React.Key) => {
    const normalizedKey = normalizeSubjectKey(l.subject);
    const subjectRaw = overrides.subjectOverrides[normalizedKey] ?? l.subject;
    const subjectDisplay = stripHalfMark(subjectRaw) || subjectRaw;
    const half = extractHalfMark(l.subject);

    const cardPadding = layoutProfile.density === 'comfortable' ? 'p-2.5' : 'p-2'
    const lessonBadgeSize = 'h-8 w-8 text-base'
    const subjectTextSize = layoutProfile.density === 'comfortable' ? 'text-[15px]' : 'text-[14px]'
    const timeTextSize = 'text-[11px]'
    const chipTextSize = 'text-[11px]'
    const chipPadding = layoutProfile.density === 'tight' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'

    const classFull = l.group?.name ?? ''
    const teacherFull = l.teacher?.name || ''
    const roomFull = l.room?.name ?? ''
    const roomBase = extractRoomCode(roomFull) || roomFull.replace(/^(?:Sala|S)\.?\s*/i, '').trim() || roomFull
    const classLabel = compactGroupLabel(classFull)
    const teacherLabel = layoutProfile.labelMode === 'compact' ? compactTeacherLabel(teacherFull) : teacherFull
    const roomLabel = layoutProfile.labelMode === 'compact' ? compactRoomLabel(roomBase) : roomBase

    const renderChip = (
      kind: 'class' | 'teacher' | 'room',
      text: string,
      fullText: string,
      onClick: () => void
    ) => {
      const theme =
        kind === 'class'
          ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 border-blue-800'
          : kind === 'teacher'
            ? 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-200 border-emerald-800'
            : 'bg-violet-900/40 hover:bg-violet-900/60 text-violet-200 border-violet-800'

      return (
        <button
          type="button"
          className={`inline-flex min-w-0 items-center justify-center rounded-lg border ${chipPadding} ${chipTextSize} leading-none whitespace-nowrap transition ${theme}`}
          title={fullText}
          aria-label={fullText}
          onClick={onClick}
        >
          <span className="block min-w-0 truncate">{text}</span>
        </button>
      )
    }

    return (
      <article key={key} className={`rounded-lg border border-zinc-800 bg-zinc-900/95 ${cardPadding} shadow-sm transition-shadow hover:shadow`}>
        <div className="flex items-start gap-2.5">
          <div className={`flex shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 font-semibold text-zinc-200 ${lessonBadgeSize}`}>
            {l.lesson_num || '?'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className={`min-w-0 font-semibold leading-tight text-zinc-50 ${subjectTextSize}`}>
                {subjectDisplay || <span className="text-zinc-500">(brak nazwy)</span>}
              </div>
              {half && (
                <span
                  className="shrink-0 rounded-lg border border-amber-800 bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-200"
                  title="Lekcja w grupie"
                >
                  {half}
                </span>
              )}
            </div>

            <div className={`mt-0.5 text-zinc-400 ${timeTextSize}`}>
              {l.time || '(czas nieznany)'}
            </div>

            {layoutProfile.chipLayoutMode === 'inline' ? (
              <div className="mt-1 hidden gap-1.5 md:grid [grid-template-columns:minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
                {l.group ? (
                  renderChip('class', classLabel, `Przejdź do planu klasy ${classFull}`, () => goTo(l.group!.id))
                ) : (
                  <span className="h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
                {l.teacher ? (
                  renderChip('teacher', teacherLabel, `Przejdź do planu nauczyciela ${teacherFull}`, () => goTo(l.teacher!.id))
                ) : (
                  <span className="h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
                {l.room ? (
                  renderChip('room', roomLabel, `Przejdź do planu sali ${roomBase || roomLabel}`, () => goTo(l.room!.id))
                ) : (
                  <span className="h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div className="mt-1 hidden gap-1.5 md:grid md:grid-cols-2">
                {l.group ? (
                  <div className="col-span-2">
                    {renderChip('class', classLabel, `Przejdź do planu klasy ${classFull}`, () => goTo(l.group!.id))}
                  </div>
                ) : (
                  <span className="col-span-2 h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
                {l.teacher ? (
                  renderChip('teacher', teacherLabel, `Przejdź do planu nauczyciela ${teacherFull}`, () => goTo(l.teacher!.id))
                ) : (
                  <span className="h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
                {l.room ? (
                  renderChip('room', roomLabel, `Przejdź do planu sali ${roomBase || roomLabel}`, () => goTo(l.room!.id))
                ) : (
                  <span className="h-6 rounded-lg border border-zinc-800/60 bg-zinc-950/40" aria-hidden="true" />
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap gap-1 md:hidden">
              {l.group ? renderChip('class', classLabel, `Przejdź do planu klasy ${classFull}`, () => goTo(l.group!.id)) : null}
              {l.teacher ? renderChip('teacher', teacherLabel, `Przejdź do planu nauczyciela ${teacherFull}`, () => goTo(l.teacher!.id)) : null}
              {l.room ? renderChip('room', roomLabel, `Przejdź do planu sali ${roomBase || roomLabel}`, () => goTo(l.room!.id)) : null}
            </div>
          </div>
        </div>
      </article>
    );
  }, [goTo, layoutProfile.chipLayoutMode, layoutProfile.density, layoutProfile.labelMode, overrides.subjectOverrides])

  // Compact formatter for print cells
  const formatPrintCell = useCallback((l: Lesson): string => {
    const normalizedKey = normalizeSubjectKey(l.subject);
    const subjectRaw = overrides.subjectOverrides[normalizedKey] ?? l.subject;
    const subjectDisplay = stripHalfMark(subjectRaw) || subjectRaw;
    const half = extractHalfMark(l.subject);
    const extraParts: string[] = [];
    const teacherName = l.teacher?.name ?? '';
    const roomName = l.room?.name ?? '';
    if (activeKind !== 'teacher' && teacherName) extraParts.push(teacherName);
    if (activeKind !== 'room' && roomName) extraParts.push(formatRoomDisplay(roomName));
    const groupText = activeKind === 'class' ? (l.group?.name ?? half ?? '') : (l.group?.name ?? '');
    const subjectWithGroup = groupText ? `${subjectDisplay} ${groupText}` : subjectDisplay;
    return extraParts.length > 0 ? `${subjectWithGroup} (${extraParts.join(', ')})` : subjectWithGroup;
  }, [activeKind, overrides.subjectOverrides]);

  const handlePrint = () => window.print();
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Skopiowano link do schowka.");
    } catch {
      toast.error("Nie udało się skopiować linku. Skopiuj z paska adresu.");
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const res = await apiFetch("/v1/refresh", { method: "POST" });
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'Nie udało się uruchomić odświeżania');
        toast.error(`Błąd podczas odświeżania: ${msg}`);
        return;
      }
      await loadData();
      toast.success("Plan został odświeżony.");
    } catch {
      toast.error("Nie udało się uruchomić odświeżania.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveOverrides = async () => {
    try {
      const res = await apiFetch('/v1/overrides', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(overrides),
      })
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'Nie udało się zapisać nadpisań')
        toast.error(`Nie udało się zapisać nadpisań: ${msg}`)
        return
      }
      await loadOverrides()
      toast.success('Zapisano nadpisania.')
    } catch {
      toast.error('Nie udało się zapisać nadpisań.')
    }
  }

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const username = String(fd.get('username') || '');
    const password = String(fd.get('password') || '');
    const result = await login(username, password)
    if (!result.ok) {
      toast.error(result.error || 'Logowanie nieudane')
      return
    }
    await loadOverrides();
  };

  const handleLogout = async () => {
    await logout()
  };

  const subjectKeys = useMemo(
    () => {
      const keys = Object.keys(overrides.subjectOverrides)
      if (!adminOpen) return keys
      const fromTimetables = (data?.timetables ? Object.values(data.timetables).flat().map(l => normalizeSubjectKey(l.subject)) : []).filter(Boolean)
      return Array.from(new Set([...keys, ...fromTimetables])) as string[]
    },
    [adminOpen, data, overrides.subjectOverrides]
  )

  // saving overrides is handled in AdminPanel via props

  // ==========================================
  // RENDER (ciemny motyw)
  // ==========================================
  return (
    <div className={`relative min-h-dvh text-zinc-100 overflow-x-hidden ${animationsEnabled ? 'bg-gradient-to-b from-zinc-950 to-black' : 'bg-gradient-to-b from-zinc-900 via-zinc-950 to-black'}`}>
      {/* Desktop backdrop: animated on demand, otherwise static to reduce GPU usage */}
      {animationsEnabled ? (
        <AnimatedBackdrop text={activeDisplayName} variant={(activeKind ?? null) as 'class' | 'teacher' | 'room' | null} />
      ) : (
        <div
          aria-hidden
          className="hidden md:block pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(1200px 520px at 15% 10%, rgba(82,82,91,0.20), transparent 60%), radial-gradient(1000px 520px at 85% 90%, rgba(63,63,70,0.18), transparent 60%)',
          }}
        />
      )}
      {/* Minimal header – ukryty na mobile, bez tytułu, tylko akcje na desktop */}
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/70 border-b border-zinc-800">
        <div className={`${shellClassName} py-2 flex items-center gap-3`} style={shellStyle}>
          {!isMobile && <CalendarDays className="w-5 h-5 text-zinc-200" />}
          {!isMobile && <div className="text-sm font-semibold text-zinc-200">Plan lekcji</div>}
          {/* Mobile: nazwa planu + nawigacja po dniach w top barze */}
          {isMobile && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="text-base font-semibold truncate">{activeDisplayName || '—'}</div>
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
                <button
                  type="button"
                  role="switch"
                  aria-checked={animationsEnabled}
                  onClick={() => setAnimationsEnabled((prev) => !prev)}
                  title={animationsEnabled ? 'Wyłącz animacje tła' : 'Włącz animacje tła'}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 transition ${
                    animationsEnabled
                      ? 'border-emerald-700 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/55'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className={`relative h-5 w-9 rounded-full border ${animationsEnabled ? 'border-emerald-500/70 bg-emerald-500/30' : 'border-zinc-600 bg-zinc-700/70'}`}>
                    <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${animationsEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </span>
                  <span className="text-sm font-medium">Animacje: {animationsEnabled ? 'WŁ.' : 'WYŁ.'}</span>
                </button>
                <button onClick={handlePrint} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                  <Printer className="w-4 h-4" /> Drukuj / PDF
                </button>
                <button onClick={handleShare} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                  <Share2 className="w-4 h-4" /> Udostępnij
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setAdminOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                  >
                    Panel admina
                  </button>
                )}
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

      <main className={`relative z-10 ${shellClassName} py-6`} style={shellStyle}>
        <div className="print:hidden">
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
              entityTab={entityTab}
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
        {data && activeId && !hasActiveTimetable && activeTimetableLoading && (
          <section className="mt-1">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
              Wczytywanie planu…
            </div>
          </section>
        )}

        {data && activeId && hasActiveTimetable && (
          <section className="mt-1">
            <AnimatePresence mode="popLayout">
              {view === "grid" ? (
                <GridView
                  daysInData={daysInData}
                  selectedDays={selectedDays}
                  periods={periods}
                  activeLessons={activeLessons}
                  isMobile={isMobile}
                  density={layoutProfile.density}
                  dayCount={visibleDayCount}
                  cellMinPx={layoutProfile.cellMinPx}
                  onSwipePrev={goPrevDay}
                  onSwipeNext={goNextDay}
                  onRenderLesson={renderLessonCard}
                />
              ) : (
                <ListView
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
        {data && activeId && hasActiveTimetable && (
          <section className="print-only">
            <div className="print-page print-container" style={{ marginBottom: 0 }}>
              <div className="print-title">
                {prettyKind(activeKind)}: {activeName}
              </div>
              {/* Compact one-page matrix: Days as columns, lesson numbers as rows */}
              {(() => {
                const colDays = [...daysInData].sort(cmpDay);
                const lessonNumbers: string[] = Array.from(new Set<string>(
                  ((data?.timetables?.[activeId] || []) as Lesson[]).map((l: Lesson) => l.lesson_num || '-')
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
                        const perDay: Lesson[][] = colDays.map((d) => ((data?.timetables?.[activeId] || []) as Lesson[]).filter((l: Lesson) => l.day === d && (l.lesson_num || '-') === num));
                        const any: Lesson[] = perDay.flat();
                        const time = any.find((l: Lesson) => l.time)?.time || '—';
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
            <div className={`${shellClassName} grid gap-3`} style={shellStyle}>
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
                onChange={(e) => setEntityTab(e.target.value as 'teachers'|'classes'|'rooms')}
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
                    <option key={x.id} value={x.id}>{x.label}</option>
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
      {adminOpen && isAdmin && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 text-zinc-100">Ładowanie panelu administratora…</div>}>
          <AdminPanel
            isAuth={isAuth}
            onLogin={handleLogin}
            onLogout={handleLogout}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            overrides={overrides}
            setOverrides={setOverrides}
            subjectKeys={subjectKeys}
            subjectFilter={subjectFilter}
            setSubjectFilter={setSubjectFilter}
            teacherEntries={teacherOverrideEntries}
            teacherFilter={teacherFilter}
            setTeacherFilter={setTeacherFilter}
            onSaveOverrides={handleSaveOverrides}
            onClose={() => setAdminOpen(false)}
          />
        </React.Suspense>
      )}
      {/* Stopka – ukryta w trybie druku, żeby nie wymuszać drugiej strony */}
      <footer className={`relative z-10 block print:hidden ${shellClassName} py-8 text-xs text-zinc-400`} style={shellStyle}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {meta?.generation_date_from_page && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-900/70 px-2 py-1 text-emerald-100 shadow-sm shadow-emerald-950/60">
              <Info className="w-3.5 h-3.5" /> Aktualność planu (VULCAN): <strong className="ml-1">{meta.generation_date_from_page}</strong>
            </span>
          )}
          {meta?.scraped_on && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-700 bg-blue-900/70 px-2 py-1 text-blue-100 shadow-sm shadow-blue-950/60">
              <RefreshCw className="w-3.5 h-3.5" /> Zebrano: <strong className="ml-1">{meta.scraped_on}</strong>
            </span>
          )}
          {meta?.source && (
            <a href={meta.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-violet-700 bg-violet-900/70 px-2 py-1 text-violet-100 shadow-sm shadow-violet-950/60 hover:underline">
              Źródło planu
            </a>
          )}
        </div>
        {isMobile && meta?.source && (
          <div>
            Źródło oryginalne: <span className="underline break-all">{meta.source}</span>
          </div>
        )}
        {isMobile && <div className="mt-1">
          Wygenerowano z interaktywnej przeglądarki planu.
        </div>}
      </footer>

      {/* Style do druku przeniesione do src/styles/print.css */}
    </div>
  );
}
