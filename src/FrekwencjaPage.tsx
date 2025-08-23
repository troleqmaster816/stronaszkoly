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
  Settings
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
            <div className="flex items-center gap-2">
              <select value={focus || ""} onChange={e=>setFocus(e.target.value || null)}
                      className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm">
                <option value="">Wszystkie przedmioty</option>
                {state.subjects.map(s => <option value={s.key} key={s.key}>{s.label}</option>)}
              </select>
            </div>
          }
        >
          <Summary state={state} focusSubjectKey={focus}/>
        </Section>

        <AnimatePresence>
          {manageOpen && (
            <ManageDialog onClose={()=>setManageOpen(false)}>
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

function ManageDialog({ children, onClose }:{ children: React.ReactNode; onClose: ()=>void }){
  return (
    <OverlayCard title="Zarządzanie" size="wide">
      <div className="max-h-[80dvh] overflow-auto space-y-4">
        {children}
        <div className="flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition">Zamknij</button>
        </div>
      </div>
    </OverlayCard>
  );
}
