// src/pages/FrekwencjaPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Plus,
  Download,
  Layers,
  Upload,
  BookOpenCheck,
  School,
  Trash2,
  Edit3,
  Save,
  XCircle,
  FilePlus2,
  ReplaceAll,
  Settings,
  CalendarX,
  AlertTriangle,
  ShieldCheck,
  Eraser,
  Shuffle
} from "lucide-react";

/* ----------------------------- UTILSY & TYPY ----------------------------- */

// Dni tygodnia (PL) i ich kolejność
import { DAY_ORDER, extractHalfMark as extractGroupMarker } from '@/lib/schedule';
import { OverlayCard } from '@/features/attendance/components/OverlayCard';
import { Section } from '@/features/attendance/components/Section';
import { Pill } from '@/features/attendance/components/Pill';
import { DateBadge as DateBadgeComp } from '@/features/attendance/components/DateBadge';
import { useAttendanceState } from '@/features/attendance/hooks/useAttendanceState';
import type { State, Action, Plan, PlanDay, AttendanceEntry } from '@/features/attendance/state/attendanceReducer';
const WEEKDAY_PL = ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"];

function getPolishDayName(d: Date) {
  return WEEKDAY_PL[d.getDay()];
}

function ManageTools({ state, dispatch }:{ state: State; dispatch: React.Dispatch<Action> }){
  const [targetPct, setTargetPct] = useState<number>(85);
  const [mode, setMode] = useState<'day'|'months'|'range'>('day');
  const todayISO = toISODate(new Date());
  const [singleDate, setSingleDate] = useState<string>(todayISO);
  const [rangeStart, setRangeStart] = useState<string>(`${new Date().getFullYear()}-01`);
  const [rangeEnd, setRangeEnd] = useState<string>(`${new Date().getFullYear()}-12`);
  const [rangeStartDate, setRangeStartDate] = useState<string>(todayISO);
  const [rangeEndDate, setRangeEndDate] = useState<string>(todayISO);
  const [planId, setPlanId] = useState<string>(state.plans[0]?.id || '');

  useEffect(()=>{ if (!state.plans.some(p=>p.id===planId)) setPlanId(state.plans[0]?.id || ''); }, [state.plans, planId]);

  function clearAllData(){
    try { localStorage.removeItem('frekwencja/v1'); } catch {}
    window.location.reload();
  }

  function randomize(){
    const plan = state.plans.find(p=>p.id===planId);
    if (!plan) return;

    const entries: any[] = [];
    if (mode === 'day') {
      const d = parseISODateLocal(singleDate);
      if (!Number.isFinite(d.getTime())) return;
      if (isWeekend(d)) {
        const shifted = startOfWeekMonday(d);
        d.setTime(shifted.getTime());
      }
      const dayName = getPolishDayName(d);
      const def = plan.days[dayName];
      if (def && def.items.length>0) {
        const dateISO = toISODate(d);
        def.items.forEach((it, idx)=>{
          const slot = `${dayName}#${it.slotHint || idx+1}`;
          entries.push({ dateISO, dayName, slot, key: it.subjectKey, label: it.subjectLabel });
        });
      }
    } else if (mode === 'months') {
      const [startY, startM] = rangeStart.split('-').map(n=>parseInt(n,10));
      const [endY, endM] = rangeEnd.split('-').map(n=>parseInt(n,10));
      if (!Number.isFinite(startY)||!Number.isFinite(startM)||!Number.isFinite(endY)||!Number.isFinite(endM)) return;
      const start = new Date(startY, startM-1, 1);
      const end = new Date(endY, endM, 0);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        if (isWeekend(d)) continue;
        const dayName = getPolishDayName(d);
        const def = plan.days[dayName];
        if (!def || def.items.length===0) continue;
        const dateISO = toISODate(d);
        def.items.forEach((it, idx)=>{
          const slot = `${dayName}#${it.slotHint || idx+1}`;
          entries.push({ dateISO, dayName, slot, key: it.subjectKey, label: it.subjectLabel });
        });
      }
    } else if (mode === 'range') {
      const start = parseISODateLocal(rangeStartDate);
      const end = parseISODateLocal(rangeEndDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;
      if (start > end) return;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        if (isWeekend(d)) continue;
        const dayName = getPolishDayName(d);
        const def = plan.days[dayName];
        if (!def || def.items.length===0) continue;
        const dateISO = toISODate(d);
        def.items.forEach((it, idx)=>{
          const slot = `${dayName}#${it.slotHint || idx+1}`;
          entries.push({ dateISO, dayName, slot, key: it.subjectKey, label: it.subjectLabel });
        });
      }
    }

    const target = Math.max(0, Math.min(100, targetPct));
    let presentSet = new Set<number>();
    if (entries.length > 0) {
      if (mode === 'day') {
        entries.forEach((_, i)=>{ if (Math.random()*100 < target) presentSet.add(i); });
      } else {
        const total = entries.length;
        const targetPresent = Math.round((target/100) * total);
        const idxs = [...entries.keys()];
        for (let i=idxs.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
        presentSet = new Set<number>(idxs.slice(0, targetPresent));
      }
    }

    const byDate: Record<string, any[]> = {};
    for (let i=0;i<entries.length;i++){
      const e = entries[i];
      const present = presentSet.has(i);
      const id = `${e.dateISO}#${e.slot}`;
      const entry = { id, date: e.dateISO, dayName: e.dayName, slot: e.slot, subjectKey: e.key, subjectLabel: e.label, present };
      (byDate[e.dateISO] ||= []).push(entry);
    }
    for (const k of Object.keys(byDate)){
      byDate[k] = byDate[k].sort((a,b)=>{
        const an = parseInt(String(a.slot).split('#')[1]||'0',10);
        const bn = parseInt(String(b.slot).split('#')[1]||'0',10);
        if (an!==bn) return an-bn; return String(a.subjectLabel).localeCompare(String(b.subjectLabel),'pl');
      });
    }
    dispatch({ type: 'LOAD_STATE', payload: { subjects: state.subjects, plans: state.plans, byDate } as any });
  }

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-xl">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2"><Shuffle className="w-5 h-5"/><h2 className="font-semibold">Narzędzia (testowe)</h2></div>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={clearAllData} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 transition flex items-center gap-2"><Eraser className="w-4 h-4"/>Wyczyść dane</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wide opacity-70">Plan do symulacji</label>
            <select className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none" value={planId} onChange={e=>setPlanId(e.target.value)}>
              {state.plans.length===0 && <option value="">Brak planów</option>}
              {state.plans.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wide opacity-70">Docelowa frekwencja globalna (%)</label>
            <input type="number" min={0} max={100} value={targetPct} onChange={e=>setTargetPct(parseInt(e.target.value||'0',10))}
                   className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wide opacity-70">Tryb zakresu</label>
            <select value={mode} onChange={e=>setMode(e.target.value as any)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none">
              <option value="day">Pojedynczy dzień</option>
              <option value="months">Zakres miesięcy</option>
              <option value="range">Od daty do daty</option>
            </select>
          </div>
          {mode === 'day' ? (
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide opacity-70">Data</label>
              <input type="date" value={singleDate} onChange={e=>setSingleDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
            </div>
          ) : mode === 'months' ? (
            <>
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wide opacity-70">Zakres miesięcy: od</label>
                <input type="month" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
              </div>
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wide opacity-70">Zakres miesięcy: do</label>
                <input type="month" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wide opacity-70">Zakres dat: od</label>
                <input type="date" value={rangeStartDate} onChange={e=>setRangeStartDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
              </div>
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wide opacity-70">Zakres dat: do</label>
                <input type="date" value={rangeEndDate} onChange={e=>setRangeEndDate(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Quick % presets and slider */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {[50, 60, 70, 80, 90, 100].map(pct => (
                <button key={pct} onClick={()=>setTargetPct(pct)}
                        className={`px-2 py-1 rounded border text-xs ${targetPct===pct? 'bg-neutral-700 border-neutral-600' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'}`}>{pct}%</button>
              ))}
            </div>
            <input type="range" min={0} max={100} value={targetPct} onChange={e=>setTargetPct(parseInt(e.target.value||'0',10))}
                   className="w-44"/>
          </div>

          <button onClick={randomize} disabled={!planId} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition flex items-center gap-2 disabled:opacity-50">
            <Shuffle className="w-4 h-4"/>Randomizer
          </button>
        </div>
      </div>
    </section>
  );
}

function startOfWeekMonday(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0..6, 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day); // poniedziałek jako start
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0,0,0,0);
  return copy;
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6;
}
function toISODate(d: Date) {
  // Zwraca lokalną datę w formacie YYYY-MM-DD niezależnie od strefy czasowej
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Bezpieczny parser dla łańcucha "YYYY-MM-DD" jako lokalnej daty
function parseISODateLocal(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(n => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

// Normalizacja przedmiotów: usuwanie markerów grup ("1/2" itd.),
// unifikacja spacji, myślników i dodatkowa reguła: r_matematyka => matematyka.
function normalizeSubjectKey(s: string) {
  const base = (s || "").toLowerCase().trim()
    .replace(/(?:\s|-)*(\d+\/\d+)(?=$|\b)/gi, "") // usuń "1/2", "2/2", "1/3" itp.
    .replace(/[\s-]+$/g, "")
    .replace(/\s{2,}/g, " ");
  if (base === "r_matematyka") return "matematyka";
  return base;
}
// extractGroupMarker provided by shared lib (alias of extractHalfMark)
function normalizeTimeRange(time: string) {
  // "8:00- 8:45" -> "8:00-8:45"
  return (time||"").replace(/\-\s+/, "-").trim();
}
function safeParseInt(s: string) {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

// Liczenie progów 50%:
// - ile brakuje do 50% przy przyszłych samych obecnościach: x >= t - 2a
// - ile można jeszcze opuścić i mieć >=50%: y <= 2a - t
function needToReach50(attended: number, total: number) {
  const need = Math.max(0, total - 2*attended);
  return need;
}
function canSkipAndKeep50(attended: number, total: number) {
  const can = Math.max(0, 2*attended - total);
  return can;
}

/* ------------------------------ KONTRAKT JSON ---------------------------- */
import type { Lesson as ScheduleLesson, DataFile as ScheduleDataFile } from '@/types/schedule';
type TimetableData = ScheduleDataFile;
type Lesson = ScheduleLesson;

// (zachowane kiedyś pomocnicze; usunięte jako nieużywane)

/* ------------------------------- STAN APLIK. ----------------------------- */

/* --------------------- IMPORT ZE SZKOŁY (timetable_data) ------------------ */

async function fetchSchoolData(): Promise<TimetableData> {
  // plik w /public, Vite serwuje go z /timetable_data.json
  const base = (import.meta as any)?.env?.BASE_URL ?? "/";
  const res = await fetch(`${base}timetable_data.json?t=${Date.now()}`);
  if (!res.ok) throw new Error("Nie udało się pobrać planu szkoły");
  const data = await res.json();
  return data as TimetableData;
}

type SchoolImportProps = {
  onPlanReady: (plan: Plan) => void;
  onClose: () => void;
};

function SchoolImportDialog({ onPlanReady, onClose }: SchoolImportProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TimetableData|null>(null);
  const [classId, setClassId] = useState<string>("");
  const [group, setGroup] = useState<string|""|null>("");
  const [preview, setPreview] = useState<{name: string; lessons: Lesson[]} | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchSchoolData();
        setData(d);
      } catch (e:any) {
        setError(e?.message || "Błąd pobierania");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!data || !classId) { setPreview(null); return; }
    const lessons = (data.timetables[classId] || []).filter(l => ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek"].includes(l.day));
    const className = data.classes[classId];
    setPreview({ name: className, lessons });
    // Ustal dostępne grupy po markerach "1/2", "2/2"...
  }, [data, classId]);

  const availableGroups = useMemo(() => {
    if (!preview) return [];
    const markers = new Set<string>();
    for (const l of preview.lessons) {
      const m = extractGroupMarker(l.subject);
      if (m) markers.add(m);
    }
    return Array.from(markers).sort();
  }, [preview]);

  function buildPlan(): Plan | null {
    if (!data || !preview) return null;
    const className = preview.name;
    const lessons = [...preview.lessons];

    // Filtrowanie pod grupę (jeśli wybrano)
    const selectedGroup = group || null;
    const filtered = selectedGroup
      ? lessons.filter(l => {
          const m = extractGroupMarker(l.subject);
          // bierzemy lekcje całoklasowe (bez markera) + lekcje wybranej grupy
          return !m || m === selectedGroup;
        })
      : lessons;

    // Grupuj po dniu, sortuj po lesson_num/time/subject
    const days: Record<string, PlanDay> = {};
    const sorted = filtered.slice().sort((a,b) => {
      const d = (DAY_ORDER[a.day]||99) - (DAY_ORDER[b.day]||99);
      if (d !== 0) return d;
      const an = safeParseInt(a.lesson_num), bn = safeParseInt(b.lesson_num);
      if (an !== bn) return an - bn;
      const at = (a.time||"").split("-")[0].trim();
      const bt = (b.time||"").split("-")[0].trim();
      if (at !== bt) return at.localeCompare(bt,"pl");
      return a.subject.localeCompare(b.subject, "pl");
    });

    for (const l of sorted) {
      const day = l.day;
      const cleanLabel = l.subject.replace(/(?:\s|-)*(\d+\/\d+)(?=$|\b)/gi, "").replace(/\s{2,}/g," ").replace(/[\s-]+$/,"").trim();
      const key = normalizeSubjectKey(cleanLabel);
      const slotHint = l.lesson_num || normalizeTimeRange(l.time);
      if (!days[day]) days[day] = { items: [] };
      days[day].items.push({ slotHint, subjectKey: key, subjectLabel: cleanLabel });
    }

    const id = `plan:${classId}:${selectedGroup||"all"}:${Date.now()}`;
    const p: Plan = {
      id,
      name: selectedGroup ? `${className} (gr. ${selectedGroup}) – z planu` : `${className} – z planu`,
      days,
      createdAt: Date.now(),
      source: { kind: "school", classId, className, group: selectedGroup, meta: data.metadata }
    };
    return p;
  }

  if (loading) return (
    <OverlayCard title="Dodaj ze szkoły">
      <p className="text-sm opacity-80">Ładowanie planu szkoły…</p>
    </OverlayCard>
  );
  if (error) return (
    <OverlayCard title="Dodaj ze szkoły">
      <p className="text-sm text-red-400">{error}</p>
      <div className="mt-4 flex justify-end"><button onClick={onClose} className="btn">Zamknij</button></div>
    </OverlayCard>
  );
  if (!data) return null;

  return (
    <OverlayCard title="Dodaj ze szkoły">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wide opacity-70 mb-1">Twoja klasa</label>
          <select value={classId} onChange={e=>setClassId(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none">
            <option value="">— wybierz —</option>
            {Object.entries(data.classes).sort((a,b)=>a[1].localeCompare(b[1],"pl")).map(([id,name])=>(
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {classId && availableGroups.length > 0 && (
          <div>
            <label className="block text-xs uppercase tracking-wide opacity-70 mb-1">Grupa (jeśli dotyczy)</label>
            <select value={group ?? ""} onChange={e=>setGroup(e.target.value || null)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none">
              <option value="">Cała klasa</option>
              {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <p className="text-xs mt-1 opacity-70">Lekcje całoklasowe zostaną dodane niezależnie od wyboru grupy.</p>
          </div>
        )}

        {data.metadata && (
          <div className="text-xs opacity-70">
            <span className="inline-block mr-3">Źródło planu: {data.metadata.source || "—"}</span>
            <span className="inline-block mr-3">Na stronie: {data.metadata.generation_date_from_page || "—"}</span>
            <span className="inline-block">Pobrano: {data.metadata.scraped_on || "—"}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition">Anuluj</button>
          <button
            disabled={!classId}
            onClick={()=>{
              const plan = buildPlan();
              if (plan) onPlanReady(plan);
              onClose();
            }}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-2 disabled:opacity-50">
            <School className="w-4 h-4"/><span>Dodaj plan</span>
          </button>
        </div>
      </div>
    </OverlayCard>
  );
}

/* ------------------------------ KOMPONENTY UI ---------------------------- */

/* ------------------------- Menedżer przedmiotów -------------------------- */

function SubjectsManager({ subjects, dispatch }:{subjects: State["subjects"]; dispatch: React.Dispatch<Action>}) {
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const visibleSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? subjects.filter(s => s.label.toLowerCase().includes(q)) : subjects;
    return list.slice().sort((a,b)=>a.label.localeCompare(b.label, "pl"));
  }, [subjects, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={label} onChange={e=>setLabel(e.target.value)}
               placeholder="Dodaj przedmiot (np. Matematyka)"
               className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
        <div className="flex gap-2">
          <input value={query} onChange={e=>setQuery(e.target.value)}
                 placeholder="Szukaj…"
                 className="w-40 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
          <button onClick={() => { if (label.trim()) { dispatch({ type: "ADD_SUBJECT", label }); setLabel(""); } }}
                  className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition flex items-center gap-2">
            <Plus className="w-4 h-4"/>Dodaj
          </button>
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900">
        <div className="max-h-[55vh] overflow-auto divide-y divide-neutral-800">
          {visibleSubjects.map(s => (
            <SubjectRow
              key={s.key}
              subj={s}
              onRename={(newLabel)=>dispatch({type:"RENAME_SUBJECT", key:s.key, newLabel})}
              onRemove={()=>dispatch({type:"REMOVE_SUBJECT", key:s.key})}
            />
          ))}
          {visibleSubjects.length === 0 && (
            <div className="p-3 text-sm opacity-70">Brak wyników</div>
          )}
        </div>
      </div>
      {/* świadomie bez dodatkowego opisu, by nie zaśmiecać UI */}
    </div>
  );
}
function SubjectRow({subj, onRename, onRemove}:{subj:{key:string;label:string}; onRename:(l:string)=>void; onRemove:()=>void}) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(subj.label);
  return (
    <li className="flex items-start sm:items-center justify-between px-3 py-2 gap-2">
      <div className="flex-1 min-w-0 pr-2">
        <div className="font-medium text-sm sm:text-base leading-snug whitespace-normal break-words" title={subj.label}>{subj.label}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {edit ? (
          <>
            <input value={val} onChange={e=>setVal(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm"/>
            <button aria-label="Zapisz nazwę przedmiotu" onClick={()=>{ onRename(val); setEdit(false); }}
                    className="p-2 rounded bg-emerald-600 hover:bg-emerald-500 transition"><Save className="w-4 h-4"/></button>
            <button aria-label="Anuluj edycję" onClick={()=>{ setEdit(false); setVal(subj.label); }}
                    className="p-2 rounded bg-neutral-800 hover:bg-neutral-700 transition"><XCircle className="w-4 h-4"/></button>
          </>
        ) : (
          <>
            <button aria-label="Edytuj przedmiot" onClick={()=>setEdit(true)} className="p-2 rounded bg-neutral-800 hover:bg-neutral-700 transition"><Edit3 className="w-4 h-4"/></button>
            <button aria-label="Usuń przedmiot" onClick={onRemove} className="p-2 rounded bg-red-600 hover:bg-red-500 transition"><Trash2 className="w-4 h-4"/></button>
          </>
        )}
      </div>
    </li>
  );
}

/* ----------------------------- Menedżer planów --------------------------- */

function PlansManager({ subjects, plans, dispatch }:{
  subjects: State["subjects"]; plans: State["plans"]; dispatch: React.Dispatch<Action>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Record<string, PlanDay>>({
    "Poniedziałek": { items: [] },
    "Wtorek": { items: [] },
    "Środa": { items: [] },
    "Czwartek": { items: [] },
    "Piątek": { items: [] },
  });

  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    Object.keys(DAY_ORDER).slice(0,5).forEach((d, idx) => { out[d] = idx === 0; });
    return out;
  });

  function addRow(day: string) {
    const first = subjects[0] || { key:"matematyka", label:"Matematyka" };
    setEditing(ed => ({
      ...ed,
      [day]: { items: [...ed[day].items, { subjectKey: first.key, subjectLabel: first.label }] }
    }));
  }

  function savePlan() {
    const id = `plan:custom:${Date.now()}`;
    const plan: Plan = {
      id,
      name: name.trim() || "Mój plan",
      days: editing,
      createdAt: Date.now()
    };
    dispatch({ type: "UPSERT_PLAN", plan });
    setName("");
    setEditing({
      "Poniedziałek": { items: [] },
      "Wtorek": { items: [] },
      "Środa": { items: [] },
      "Czwartek": { items: [] },
      "Piątek": { items: [] },
    });
    setOpenDays(prev => ({ ...prev, "Poniedziałek": true }));
  }

  function clearDay(day: string) {
    setEditing(ed => ({ ...ed, [day]: { items: [] } }));
  }

  function moveRow(day: string, index: number, delta: number) {
    setEditing(ed => {
      const items = [...ed[day].items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return ed;
      const tmp = items[index];
      items[index] = items[target];
      items[target] = tmp;
      return { ...ed, [day]: { items } };
    });
  }

  const [showImport, setShowImport] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nazwa planu (np. Semestr 1)"
               className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 outline-none"/>
        <button onClick={()=>setShowImport(true)}
                className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition flex items-center gap-2">
          <School className="w-4 h-4"/>Dodaj ze szkoły…
        </button>
        <button onClick={savePlan}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-2">
          <FilePlus2 className="w-4 h-4"/>Zapisz plan
        </button>
      </div>

      <div className="space-y-3">
        {Object.keys(DAY_ORDER).slice(0,5).map(day => (
          <div key={day} className="bg-neutral-900 border border-neutral-800 rounded">
            <div className="px-3 py-2 flex items-center justify-between border-b border-neutral-800">
              <div className="font-semibold flex items-center gap-2">
                <button aria-label={openDays[day] ? "Zwiń" : "Rozwiń"} onClick={()=>setOpenDays(d=>({...d,[day]:!d[day]}))} className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700">
                  {openDays[day] ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                </button>
                <span>{day}</span>
                <span className="text-xs opacity-70">({editing[day].items.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <button aria-label="Wyczyść dzień" onClick={()=>clearDay(day)} className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700"><Trash2 className="w-4 h-4"/></button>
                <button aria-label="Dodaj pozycję" onClick={()=>{ if (!openDays[day]) setOpenDays(d=>({...d,[day]:true})); addRow(day); }} className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700"><Plus className="w-4 h-4"/></button>
              </div>
            </div>
            {openDays[day] && (
              <div className="p-3">
                <div className="space-y-2">
                  {editing[day].items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 min-h-[40px]">
                      <input placeholder="nr / czas (np. 1 lub 08:00-08:45)" value={it.slotHint||""}
                             onChange={e=>{
                               const v = e.target.value;
                               setEditing(ed=>{
                                 const copy = {...ed};
                                 copy[day].items = copy[day].items.map((x,i)=> i===idx ? {...x, slotHint:v} : x);
                                 return copy;
                               });
                             }}
                              className="w-40 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm"/>
                      <select value={it.subjectKey}
                              onChange={e=>{
                                const key = e.target.value;
                                const label = subjects.find(s=>s.key===key)?.label || key;
                                setEditing(ed=>{
                                  const copy = {...ed};
                                  copy[day].items = copy[day].items.map((x,i)=> i===idx ? {...x, subjectKey:key, subjectLabel:label} : x);
                                  return copy;
                                });
                              }}
                              className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm whitespace-normal break-words">
                        {subjects
                          .slice()
                          .sort((a,b)=>a.label.localeCompare(b.label, 'pl'))
                          .map(s => (
                            <option value={s.key} key={s.key}>{s.label}</option>
                          ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <button aria-label="Przenieś w górę" onClick={()=>moveRow(day, idx, -1)} className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700"><ChevronUp className="w-4 h-4"/></button>
                        <button aria-label="Przenieś w dół" onClick={()=>moveRow(day, idx, 1)} className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700"><ChevronDown className="w-4 h-4"/></button>
                        <button aria-label="Usuń pozycję" onClick={()=>{
                          setEditing(ed=>{
                            const copy = {...ed};
                            copy[day].items = copy[day].items.filter((_,i)=>i!==idx);
                            return copy;
                          });
                        }} className="p-1.5 rounded bg-red-600 hover:bg-red-500"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                  {editing[day].items.length === 0 && (
                    <div className="text-sm opacity-70">Brak pozycji. Użyj „Dodaj pozycję”.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Twoje plany</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold break-words leading-tight">{p.name}</div>
                  <div className="text-xs opacity-70">
                    {p.source?.kind === "school" ? <Pill>z planu szkolnego</Pill> : <Pill>własny</Pill>}
                  </div>
                </div>
                <button aria-label="Usuń plan" onClick={()=>dispatch({type:"DELETE_PLAN", id: p.id})}
                        className="p-1.5 rounded bg-red-600 hover:bg-red-500"><Trash2 className="w-4 h-4"/></button>
              </div>
              {p.source?.meta && (
                <div className="mt-2 text-xs opacity-70">
                  Na stronie: {p.source.meta.generation_date_from_page || "—"} • Pobrano: {p.source.meta.scraped_on || "—"}
                </div>
              )}
              <div className="mt-2 text-xs opacity-70">
                Dni: {Object.keys(p.days).filter(d=>DAY_ORDER[d]<=5).length}/5
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showImport && (
          <SchoolImportDialog
            onPlanReady={(plan)=>dispatch({type:"UPSERT_PLAN", plan})}
            onClose={()=>setShowImport(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Dzienniczek ------------------------------ */

function DayAttendance({
  dateISO,
  entries,
  subjects,
  dispatch
}:{
  dateISO: string;
  entries: AttendanceEntry[];
  subjects: State["subjects"];
  dispatch: React.Dispatch<Action>;
}) {
  const dayName = getPolishDayName(parseISODateLocal(dateISO));

  function addRow() {
    // dodaj pusty slot z pierwszym przedmiotem z listy
    const subj = subjects[0] || { key: "matematyka", label: "Matematyka" };
    const slot = `${dayName}#${(entries.length+1)}`;
    const id = `${dateISO}#${slot}`;
    const entry: AttendanceEntry = {
      id, date: dateISO, dayName, slot,
      subjectKey: subj.key, subjectLabel: subj.label, present: true
    };
    dispatch({ type: "UPSERT_ENTRY", entry });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateBadgeComp dateISO={dateISO} label={getPolishDayName(parseISODateLocal(dateISO))} />
        <button onClick={addRow} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition flex items-center gap-2">
          <Plus className="w-4 h-4"/>Dodaj lekcję
        </button>
      </div>
      <div className="space-y-2">
        {entries.map(e => (
          <div key={e.id} className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 overflow-hidden">
            <span className="w-16 text-xs opacity-70 flex-shrink-0">{e.slot.split("#")[1]}</span>
            <select value={e.subjectKey}
                    onChange={ev=>{
                      const key = ev.target.value;
                      const label = subjects.find(s=>s.key===key)?.label || key;
                      dispatch({ type:"UPSERT_ENTRY", entry: { ...e, subjectKey: key, subjectLabel: label }});
                    }}
                    className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm whitespace-normal break-words">
              {subjects.map(s => <option value={s.key} key={s.key}>{s.label}</option>)}
            </select>
            <button
              onClick={()=>dispatch({ type:"TOGGLE_PRESENT", dateISO: e.date, entryId: e.id })}
              className={`px-2.5 py-1.5 rounded border transition flex items-center gap-1 ${
                e.present ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-500" : "bg-red-600 hover:bg-red-500 border-red-500"
              }`}
              title={e.present ? "Obecny – kliknij, aby ustawić nieobecność" : "Nieobecny – kliknij, aby ustawić obecność"}
            >
              {e.present ? <Check className="w-4 h-4"/> : <X className="w-4 h-4"/>}
              <span className="text-xs">{e.present ? "obecny" : "nieobecny"}</span>
            </button>
            <button onClick={()=>dispatch({ type:"DELETE_ENTRY", dateISO: e.date, entryId: e.id })}
                    className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700">
              <Trash2 className="w-4 h-4"/>
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-sm opacity-70 border border-neutral-800 rounded p-3">
            Brak lekcji tego dnia. Dodaj ręcznie lub użyj <em>Uzupełnij z…</em>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- Podsumowanie UI ---------------------------- */

function Summary({ state, focusSubjectKey }:{ state: State; focusSubjectKey?: string|null }) {
  const { total, present } = useMemo(()=>{
    const list = Object.values(state.byDate).flat();
    const filtered = focusSubjectKey ? list.filter(e => normalizeSubjectKey(e.subjectKey) === normalizeSubjectKey(focusSubjectKey)) : list;
    return {
      total: filtered.length,
      present: filtered.filter(e=>e.present).length
    };
  }, [state.byDate, focusSubjectKey]);

  const rate = total ? (present/total) : 0;
  const need = needToReach50(present, total); // ile kolejnych obecności, by mieć ≥50%
  const can = canSkipAndKeep50(present, total); // ile jeszcze można opuścić i wciąż mieć ≥50%

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <StatCard title={focusSubjectKey ? "Frekwencja (przedmiot)" : "Frekwencja ogólna"} value={
        <span className={rate>=0.5 ? "text-emerald-400" : "text-red-400"}>
          {(rate*100).toFixed(1)}%
        </span>
      } sub={`${present}/${total} lekcji`} />
      <StatCard title="Brakuje do 50%" value={<span>{need}</span>} sub="tyle kolejnych obecności daje ≥50%" />
      <StatCard title="Możesz jeszcze opuścić" value={<span>{can}</span>} sub="i nadal mieć ≥50%" />
    </div>
  );
}
function StatCard({title, value, sub}:{title:string; value:React.ReactNode; sub?:string}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
      <div className="text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  );
}

/* -------------------------------- STRONA --------------------------------- */

// Komponent przeglądu miesiąca - elegancki kalendarz z wizualnymi wskaźnikami wypełnienia dni
function MonthOverview({ 
  selected, 
  onDateSelect, 
  byDate,
  focusSubjectKey
}: { 
  selected: Date; 
  onDateSelect: (date: Date) => void; 
  byDate: Record<string, AttendanceEntry[]>;
  focusSubjectKey?: string | null;
}) {
  const firstDayOfMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);

  // Generuj dni miesiąca (tylko dni robocze)
  const weekdays: Date[] = [];
  for (let d = new Date(firstDayOfMonth); d <= lastDayOfMonth; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays.push(new Date(d));
    }
  }

  // Grupuj dni po tygodniach (pn-pt) z wypełnieniem brakujących dni nullami, 
  // aby pierwszy dzień miesiąca nie przesuwał się na poniedziałek, jeśli nim nie jest
  const weeks: (Date | null)[][] = [];
  let currentWeekStartISO: string | null = null;
  weekdays.forEach((date) => {
    const mondayISO = toISODate(startOfWeekMonday(date));
    if (!currentWeekStartISO || currentWeekStartISO !== mondayISO) {
      weeks.push([null, null, null, null, null]);
      currentWeekStartISO = mondayISO;
    }
    const col = Math.max(0, Math.min(4, date.getDay() - 1)); // pn=1 -> 0, ... pt=5 -> 4
    weeks[weeks.length - 1][col] = new Date(date);
  });

  // Statystyki miesiąca
  const monthStats = useMemo(() => {
    const monthEntries = weekdays.map(date => byDate[toISODate(date)] || [])
      .map(list => focusSubjectKey ? list.filter(e => (e.subjectKey||'').toLowerCase() === focusSubjectKey.toLowerCase()) : list)
      .flat();
    const totalLessons = monthEntries.length;
    const presentCount = monthEntries.filter(e => e.present).length;
    const filledDays = weekdays.filter(date => (byDate[toISODate(date)] || []).length > 0).length;
    return { totalLessons, presentCount, filledDays, totalWorkdays: weekdays.length };
  }, [weekdays, byDate, focusSubjectKey]);

  return (
    <>
      {/* Pasek kontekstu miesiąca */}
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 shadow-sm">
          <CalendarIcon className="w-4 h-4"/>
          <span className="text-sm font-medium capitalize">{firstDayOfMonth.toLocaleString('pl-PL', { month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Statystyki miesiąca */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 text-center select-none">
          <div className="text-2xl font-bold text-emerald-400">{monthStats.filledDays}</div>
          <div className="text-xs opacity-70">wypełnionych dni</div>
          <div className="text-xs opacity-50">z {monthStats.totalWorkdays} roboczych</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 text-center select-none">
          <div className="text-2xl font-bold text-blue-400">{monthStats.totalLessons}</div>
          <div className="text-xs opacity-70">lekcji w sumie</div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 text-center select-none">
          <div className="text-2xl font-bold text-emerald-400">
            {monthStats.totalLessons > 0 ? ((monthStats.presentCount / monthStats.totalLessons) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-xs opacity-70">frekwencja miesiąca</div>
        </div>
      </div>

      {/* Dni tygodnia header */}
      <div className="grid grid-cols-5 gap-2 mb-2">
        {['Pon', 'Wto', 'Śro', 'Czw', 'Pią'].map(day => (
          <div key={day} className="text-center text-xs font-medium opacity-70 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Kalendarz */}
      <div className="space-y-2 overflow-hidden">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-5 gap-2 min-w-0">
            {[0, 1, 2, 3, 4].map(dayIdx => {
              const date = week[dayIdx];
              if (!date) return <div key={dayIdx} className="h-14 sm:h-16 border border-transparent rounded-lg" />;

              const dateISO = toISODate(date);
              const entries = byDate[dateISO] || [];
              const isSelected = toISODate(date) === toISODate(selected);
              const isToday = toISODate(date) === toISODate(new Date());
              const hasEntries = entries.length > 0;
              const presentCount = entries.filter(e => e.present).length;
              const absentCount = entries.length - presentCount;

              return (
                <button
                  key={dayIdx}
                  onClick={() => onDateSelect(date)}
                  className={`relative h-14 sm:h-16 p-2 rounded-lg border transition-colors text-center group min-w-0 ${
                    isSelected 
                      ? 'border-emerald-500 bg-emerald-500/15' 
                      : isToday
                        ? 'border-blue-500 bg-blue-500/10'
                        : hasEntries 
                          ? 'border-neutral-700 bg-neutral-900 hover:border-emerald-400/50 hover:bg-neutral-800' 
                          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                  }`}
                  title={`${getPolishDayName(date)} ${date.getDate()}.${String(date.getMonth()+1).padStart(2,'0')} - ${entries.length} lekcji`}
                >
                  <div className="font-semibold text-sm leading-none">{date.getDate()}</div>

                  {hasEntries ? (
                    <div className="mt-1 space-y-1">
                      <div className="text-[11px] opacity-75 leading-none">{presentCount}/{entries.length}</div>
                      <div className="h-1.5 w-full bg-neutral-800 rounded overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, Math.round((presentCount/entries.length)*100)))}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs opacity-40 leading-none">-</div>
                  )}

                  {hasEntries && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-neutral-950 border border-neutral-700 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      {presentCount > 0 && <span className="text-emerald-400">{presentCount} obecnych</span>}
                      {presentCount > 0 && absentCount > 0 && <span className="mx-1">·</span>}
                      {absentCount > 0 && <span className="text-red-400">{absentCount} nieobecnych</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/* --------------------------- Planer nieobecności -------------------------- */

function AbsencePlanner({ state, selectedPlanId }:{ state: State; selectedPlanId?: string|null }) {
  const plan = state.plans.find(p => p.id === selectedPlanId);

  // Zakres: od dziś do piątku; jeśli weekend, pokaż pełny następny tydzień (pn–pt)
  const today = new Date();
  today.setHours(0,0,0,0);
  const thisMonday = startOfWeekMonday(today);
  let weekStart = thisMonday;
  let iterStart = new Date(today);
  let weekEndFriday = addDays(weekStart, 4);
  const dow = today.getDay();
  if (dow === 6 || dow === 0 || today > weekEndFriday) {
    weekStart = addDays(thisMonday, 7);
    weekEndFriday = addDays(weekStart, 4);
    iterStart = new Date(weekStart);
  }
  const days: Date[] = [];
  for (let d = new Date(iterStart); d <= weekEndFriday; d.setDate(d.getDate()+1)) {
    if (!isWeekend(d)) days.push(new Date(d));
  }

  type Stat = { present: number; total: number };

  // Bazowe statystyki z historii
  const baseStats = useMemo(() => {
    const perSubject: Record<string, Stat> = {};
    let global: Stat = { present: 0, total: 0 };
    for (const entries of Object.values(state.byDate)) {
      for (const e of entries) {
        const key = normalizeSubjectKey(e.subjectKey || e.subjectLabel);
        if (!perSubject[key]) perSubject[key] = { present: 0, total: 0 };
        perSubject[key].total += 1;
        if (e.present) perSubject[key].present += 1;
        global.total += 1;
        if (e.present) global.present += 1;
      }
    }
    return { perSubject, global };
  }, [state.byDate]);

  // Zaznaczenia „na pewno idę” – wpływają na analizę
  const [commitAttend, setCommitAttend] = useState<Record<string, boolean>>({});
  // Preferowane obecności (nie chcę opuszczać, jeśli te przedmioty są w dniu)
  const [preferredSubjects, setPreferredSubjects] = useState<Record<string, boolean>>({});
  // Tolerowane nieobecności (pomijaj próg 50% per przedmiot dla tych)
  const [toleratedSubjects, setToleratedSubjects] = useState<Record<string, boolean>>({});

  function toggleCommit(dateISO: string) {
    setCommitAttend(s => ({ ...s, [dateISO]: !s[dateISO] }));
  }

  // Delta od zadeklarowanych obecności (pomijając podany dzień)
  function getCommitDelta(excludeISO?: string) {
    const perSubject: Record<string, Stat> = {};
    let global: Stat = { present: 0, total: 0 };
    if (!plan) return { perSubject, global };
    for (const [iso, yes] of Object.entries(commitAttend)) {
      if (!yes) continue;
      if (excludeISO && iso === excludeISO) continue;
      const d = parseISODateLocal(iso);
      const dayName = getPolishDayName(d);
      const def = plan.days[dayName];
      if (!def) continue;
      for (const it of def.items) {
        const key = normalizeSubjectKey(it.subjectKey);
        if (!perSubject[key]) perSubject[key] = { present: 0, total: 0 };
        perSubject[key].present += 1;
        perSubject[key].total += 1;
        global.present += 1;
        global.total += 1;
      }
    }
    return { perSubject, global };
  }

  function statPlus(a: Stat|undefined, b: Stat|undefined): Stat {
    const aa = a || { present: 0, total: 0 };
    const bb = b || { present: 0, total: 0 };
    return { present: aa.present + bb.present, total: aa.total + bb.total };
  }

  function evaluateSkipFor(date: Date) {
    const dateISO = toISODate(date);
    if (!plan) return { date, dateISO, lessons: 0, risk: 'Brak planu', tier: 'disabled' as const };
    const dayName = getPolishDayName(date);
    const def = plan.days[dayName];
    const lessonsInDay = (def?.items?.length) || 0;
    // Jeśli w przyszłości dzień został już wypełniony w dzienniku, pokaż komunikat
    const todayISO = toISODate(new Date());
    if (dateISO > todayISO && ((state.byDate[dateISO]?.length) || 0) > 0) {
      return { date, dateISO, lessons: lessonsInDay, risk: 'Dzień już wypełniony w dzienniku', tier: 'filled' as const };
    }
    if (commitAttend[dateISO]) return { date, dateISO, lessons: lessonsInDay, risk: 'Zaplanowana obecność', tier: 'locked' as const };
    if (!def || lessonsInDay === 0) return { date, dateISO, lessons: 0, risk: 'Brak lekcji', tier: 'safe' as const };

    // Priorytet: jeśli dzień zawiera przedmioty oznaczone jako preferowane, nie rekomenduj opuszczania
    const preferredInDayLabels: string[] = [];
    for (const it of def.items) {
      const key = normalizeSubjectKey(it.subjectKey);
      if (preferredSubjects[key]) {
        const label = state.subjects.find(s=>normalizeSubjectKey(s.key)===key)?.label || it.subjectLabel || key;
        if (!preferredInDayLabels.includes(label)) preferredInDayLabels.push(label);
      }
    }
    if (preferredInDayLabels.length > 0) {
      return { date, dateISO, lessons: lessonsInDay, risk: `Priorytetowe zajęcia: ${preferredInDayLabels.join(', ')}`, tier: 'priority' as const };
    }

    // Bazowe + deklaracje (bez rozpatrywanego dnia)
    const commitDelta = getCommitDelta(dateISO);

    // Globalne liczniki po ewentualnym opuszczeniu dnia
    let globalAfter: Stat = statPlus(baseStats.global, commitDelta.global);
    globalAfter = { present: globalAfter.present, total: globalAfter.total + def.items.length };

    // Per-przedmiot po ewentualnym opuszczeniu
    const perAfter: Record<string, Stat> = {};
    const subjectsInDayCount: Record<string, number> = {};
    for (const it of def.items) {
      const key = normalizeSubjectKey(it.subjectKey);
      subjectsInDayCount[key] = (subjectsInDayCount[key]||0) + 1;
    }
    const allKeys = new Set<string>([...Object.keys(baseStats.perSubject), ...Object.keys(subjectsInDayCount), ...Object.keys(commitDelta.perSubject)]);
    for (const key of allKeys) {
      // Jeśli przedmiot jest tolerowany, wyłączamy go z oceny per-przedmiot (traktuj jakby brak)
      if (toleratedSubjects[key]) { continue; }
      const base = baseStats.perSubject[key];
      const add = commitDelta.perSubject[key];
      const dayMiss = subjectsInDayCount[key] || 0;
      const cur = statPlus(base, add);
      perAfter[key] = { present: cur.present, total: cur.total + dayMiss };
    }

    // Bufory
    function buffer(s: Stat) { return (2*s.present - s.total); }
    const globalBuf = buffer(globalAfter);
    let worstKey: string|undefined; let worstBuf = Infinity;
    for (const [k, st] of Object.entries(perAfter)) {
      if (!subjectsInDayCount[k]) continue; // tylko przedmioty z tego dnia
      if (toleratedSubjects[k]) continue; // pomijamy tolerowane w ocenie per-przedmiot
      const b = buffer(st);
      if (b < worstBuf) { worstBuf = b; worstKey = k; }
    }

    const minBuf = Math.min(globalBuf, worstBuf);
    let tier: 'critical'|'danger'|'warn'|'safe' = 'safe';
    if (minBuf < 0) tier = 'critical';
    else if (minBuf === 0) tier = 'danger';
    else if (minBuf <= 2) tier = 'warn';

    const worstLabel = worstKey ? (state.subjects.find(s=>normalizeSubjectKey(s.key)===worstKey)?.label || worstKey) : undefined;
    const risk = tier === 'safe'
      ? 'Bezpiecznie do opuszczenia'
      : tier === 'warn'
        ? `Uwaga: mały margines (ryzyko w: ${worstLabel})`
        : tier === 'danger'
          ? `Na limicie 50% (najgorszy: ${worstLabel})`
          : `Krytycznie: spadniesz poniżej 50% (najgorszy: ${worstLabel})`;

    return { date, dateISO, lessons: def.items.length, risk, tier, globalBuf, worstKey, worstBuf };
  }

  const rows = useMemo(() => days.map(d => evaluateSkipFor(d)), [days, plan, baseStats, commitAttend]);

  return (
    <div className="space-y-2">
      {!plan && (
        <div className="text-sm opacity-70 bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400"/> Wybierz plan, aby zaplanować nieobecności.
        </div>
      )}
      {plan && (
        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Preferuj obecność na</div>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.keys(preferredSubjects).filter(k=>preferredSubjects[k]).map(k=>{
                const label = state.subjects.find(s=>normalizeSubjectKey(s.key)===k)?.label || k;
                return (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-900/30 border border-blue-700 text-blue-200 text-xs">
                    {label}
                    <button aria-label="Usuń z preferowanych" onClick={()=>setPreferredSubjects(ps=>{ const c={...ps}; delete c[k]; return c; })} className="ml-1 opacity-80 hover:opacity-100">×</button>
                  </span>
                );
              })}
              <select value="" onChange={e=>{
                const key = normalizeSubjectKey(e.target.value);
                if (!key) return; setPreferredSubjects(ps=>({ ...ps, [key]: true })); e.currentTarget.value="";
              }} className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs">
                <option value="">Dodaj…</option>
                {state.subjects
                  .filter(s=>!preferredSubjects[normalizeSubjectKey(s.key)])
                  .sort((a,b)=>a.label.localeCompare(b.label,'pl'))
                  .map(s=> <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="text-[11px] opacity-60 mt-1">Dni z tymi zajęciami będą oznaczone jako „nie rekomenduję opuszczać”.</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Toleruj nieobecność na</div>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.keys(toleratedSubjects).filter(k=>toleratedSubjects[k]).map(k=>{
                const label = state.subjects.find(s=>normalizeSubjectKey(s.key)===k)?.label || k;
                return (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-900/20 border border-yellow-700 text-yellow-200 text-xs">
                    {label}
                    <button aria-label="Usuń z tolerowanych" onClick={()=>setToleratedSubjects(ts=>{ const c={...ts}; delete c[k]; return c; })} className="ml-1 opacity-80 hover:opacity-100">×</button>
                  </span>
                );
              })}
              <select value="" onChange={e=>{
                const key = normalizeSubjectKey(e.target.value);
                if (!key) return; setToleratedSubjects(ts=>({ ...ts, [key]: true })); e.currentTarget.value="";
              }} className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs">
                <option value="">Dodaj…</option>
                {state.subjects
                  .filter(s=>!toleratedSubjects[normalizeSubjectKey(s.key)])
                  .sort((a,b)=>a.label.localeCompare(b.label,'pl'))
                  .map(s=> <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="text-[11px] opacity-60 mt-1">Te zajęcia nie będą brane pod uwagę w limicie 50% per przedmiot.</div>
          </div>
        </div>
      )}
      {plan && days.length === 0 && (
        <div className="text-sm opacity-70 bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center gap-2">
          <CalendarX className="w-4 h-4"/> Bieżący tydzień szkolny już minął. Wróć w poniedziałek.
        </div>
      )}
      {plan && days.length > 0 && (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.dateISO} className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <DateBadgeComp dateISO={r.dateISO} label={getPolishDayName(r.date)} />
                <div className="text-xs opacity-70 whitespace-nowrap">{r.lessons} lekcji</div>
                <div className="text-sm font-medium truncate">
                  {r.tier === 'locked' ? (
                    <span className="text-emerald-400 inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4"/>Zaplanowana obecność</span>
                  ) : r.tier === 'priority' ? (
                    <span className="text-blue-300">Priorytet dnia: {r.risk.replace('Priorytetowe zajęcia: ','')}</span>
                  ) : r.tier === 'filled' ? (
                    <span className="text-blue-400">Dzień już wypełniony w dzienniku</span>
                  ) : r.tier === 'disabled' ? (
                    <span className="opacity-70">Brak planu</span>
                  ) : (
                    <span className={
                      r.tier === 'safe' ? 'text-emerald-400' : r.tier === 'warn' ? 'text-yellow-300' : r.tier === 'danger' ? 'text-orange-400' : 'text-red-400'
                    }>{r.risk}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={()=>toggleCommit(r.dateISO)}
                        className={`px-2 py-1 rounded border text-sm ${commitAttend[r.dateISO] ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500' : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'}`}>
                  {commitAttend[r.dateISO] ? 'Na pewno idę' : 'Zaznacz: idę'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FrekwencjaPage() {
  const [state, dispatch] = useAttendanceState();

  // Wybrany dzień – domyślnie dziś, ale jeśli to weekend, przesuń na najbliższy pon-pt
  const [selected, setSelected] = useState<Date>(() => {
    const now = new Date();
    const d = now.getDay();
    if (d === 0) return addDays(now, 1); // niedz -> pn
    if (d === 6) return addDays(now, 2); // sob -> pn
    return now;
  });

  const dateISO = toISODate(selected);
  const todayEntries = state.byDate[dateISO] || [];

  // wybór przedmiotu dla per-przedmiotowego podsumowania
  const [focus, setFocus] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [plannerPlanId, setPlannerPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!plannerPlanId && state.plans.length > 0) {
      setPlannerPlanId(state.plans[0].id);
    } else if (plannerPlanId && !state.plans.some(p=>p.id===plannerPlanId)) {
      setPlannerPlanId(state.plans[0]?.id ?? null);
    }
  }, [state.plans, plannerPlanId]);

  // state persistence handled by useAttendanceState hook

  function stepDay(delta: number) {
    let next = addDays(selected, delta);
    while (isWeekend(next)) {
      next = addDays(next, delta > 0 ? 1 : -1);
    }
    setSelected(next);
  }
  function stepWeek(deltaWeeks: number) {
    const next = addDays(selected, 7*deltaWeeks);
    setSelected(next);
  }

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur border-b border-neutral-900">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <BookOpenCheck className="w-5 h-5"/>
          <div className="font-semibold">Frekwencja</div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={()=>setManageOpen(true)} className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition flex items-center gap-2">
              <Settings className="w-4 h-4"/>
              <span>Zarządzaj</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        <Section
          title="Dzienniczek"
          icon={<CalendarIcon className="w-5 h-5"/>}
          right={
            <div className="flex items-center gap-2">
              <button onClick={()=>stepWeek(-1)} aria-label="Poprzedni tydzień" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800" title="Poprzedni tydzień"><ChevronLeft className="w-4 h-4"/></button>
              <button onClick={()=>stepDay(-1)} aria-label="Poprzedni dzień" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800" title="Poprzedni dzień"><ChevronLeft className="w-4 h-4"/></button>
              <input type="date" value={dateISO} onChange={e=>setSelected(parseISODateLocal(e.target.value))}
                     className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"/>
              <button onClick={()=>stepDay(1)} aria-label="Następny dzień" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800" title="Następny dzień"><ChevronRight className="w-4 h-4"/></button>
              <button onClick={()=>stepWeek(1)} aria-label="Następny tydzień" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800" title="Następny tydzień"><ChevronRight className="w-4 h-4"/></button>

              <PlanFillMenu
                plans={state.plans}
                onFillDay={(planId)=>dispatch({ type:"FILL_DAY_FROM_PLAN", dateISO, planId })}
                onFillWeek={(planId)=>dispatch({ type:"FILL_WEEK_FROM_PLAN", weekMondayISO: toISODate(startOfWeekMonday(selected)), planId })}
              />
            </div>
          }
        >
          <DayAttendance dateISO={dateISO} entries={todayEntries} subjects={state.subjects} dispatch={dispatch}/>
        </Section>

        <Section
          title="Podsumowanie frekwencji"
          icon={<Layers className="w-5 h-5"/>}
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <select value={focus || ""} onChange={e=>setFocus(e.target.value || null)}
                      className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm">
                <option value="">Wszystkie przedmioty</option>
                {state.subjects.map(s => <option value={s.key} key={s.key}>{s.label}</option>)}
              </select>
              {/* Nawigacja po miesiącu */}
              <div className="flex items-center gap-2">
                <button onClick={()=>setSelected(addDays(new Date(selected.getFullYear(), selected.getMonth(), 1), -1))} aria-label="Poprzedni miesiąc" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800">
                  <ChevronLeft className="w-4 h-4"/>
                </button>
                <input type="month" value={`${selected.getFullYear()}-${String(selected.getMonth()+1).padStart(2,'0')}`} onChange={e=>{
                  const [y,m] = e.target.value.split('-').map(v=>parseInt(v,10));
                  if(Number.isFinite(y)&&Number.isFinite(m)) setSelected(new Date(y,m-1,1));
                }} className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"/>
                <button onClick={()=>setSelected(new Date(selected.getFullYear(), selected.getMonth()+1, 1))} aria-label="Następny miesiąc" className="p-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800">
                  <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          }
        >
          <Summary state={state} focusSubjectKey={focus}/>
          <div className="mt-4">
            <MonthOverview 
              selected={selected} 
              onDateSelect={setSelected} 
              byDate={state.byDate}
              focusSubjectKey={focus}
            />
          </div>
        </Section>

        <Section
          title="Planer nieobecności"
          icon={<CalendarX className="w-5 h-5"/>}
          right={
            <div className="flex items-center gap-2">
              <select value={plannerPlanId || ''} onChange={e=>setPlannerPlanId(e.target.value || null)}
                      className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm min-w-[12rem]">
                {state.plans.length === 0 && <option value="">Brak planów</option>}
                {state.plans.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
              </select>
            </div>
          }
        >
          <div className="text-xs opacity-70 mb-2">Sugestie dotyczące bezpiecznych nieobecności do końca bieżącego tygodnia, z zachowaniem progu 50% per przedmiot i globalnie.</div>
          <AbsencePlanner state={state} selectedPlanId={plannerPlanId}/>
        </Section>

        <AnimatePresence>
          {manageOpen && (
            <ManageDialog state={state} dispatch={dispatch} onClose={()=>setManageOpen(false)}>
              <div className="grid md:grid-cols-2 gap-6">
                <section className="bg-neutral-950 border border-neutral-800 rounded-xl">
                  <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-2"><Download className="w-5 h-5"/><h2 className="font-semibold">Lista przedmiotów</h2></div>
                  </div>
                  <div className="p-5 space-y-3">
                    <SubjectsManager subjects={state.subjects} dispatch={dispatch}/>
                  </div>
                </section>
                <section className="bg-neutral-950 border border-neutral-800 rounded-xl">
                  <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-2"><Upload className="w-5 h-5"/><h2 className="font-semibold">Plany lekcji</h2></div>
                  </div>
                  <div className="p-5 space-y-3">
                    <PlansManager subjects={state.subjects} plans={state.plans} dispatch={dispatch}/>
                  </div>
                </section>
              </div>
            </ManageDialog>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlanFillMenu({
  plans,
  onFillDay,
  onFillWeek
}:{
  plans: Plan[];
  onFillDay: (planId: string)=>void;
  onFillWeek: (planId: string)=>void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)}
              className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition flex items-center gap-2">
        <ReplaceAll className="w-4 h-4"/>Uzupełnij z…
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute right-0 mt-2 w-80 bg-neutral-950 border border-neutral-800 rounded shadow-xl z-20 p-2"
          >
            {plans.length === 0 ? (
              <div className="text-sm opacity-70 p-2">Brak zapisanych planów.</div>
            ) : (
              <ul className="space-y-1">
                {plans.map(p => (
                  <li key={p.id} className="bg-neutral-900 border border-neutral-800 rounded">
                    <div className="px-3 py-2 text-sm font-medium">{p.name}</div>
                    <div className="px-2 pb-2 flex items-center gap-2">
                      <button onClick={()=>{ onFillDay(p.id); setOpen(false); }}
                              className="flex-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm">Uzupełnij <b>dzień</b></button>
                      <button onClick={()=>{ onFillWeek(p.id); setOpen(false); }}
                              className="flex-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm">Uzupełnij <b>tydzień</b></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ManageDialog({ children, onClose, state, dispatch }:{ children: React.ReactNode; onClose: ()=>void; state: State; dispatch: React.Dispatch<Action> }){
  return (
    <OverlayCard title="Zarządzanie" size="wide">
      <div className="max-h-[80dvh] overflow-auto space-y-4">
        {children}
        <ManageTools state={state} dispatch={dispatch} />
        <div className="flex justify-end"><button onClick={onClose} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition">Zamknij</button></div>
      </div>
    </OverlayCard>
  );
}
