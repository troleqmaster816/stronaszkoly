import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ShieldCheck, CalendarX } from 'lucide-react';
import { DateBadge as DateBadgeComp } from './DateBadge';
import type { State } from '../state/attendanceReducer';

// Polityka przedmiotów i stany commitów planera
export type SubjectPolicy = 'ABSOLUTE' | 'PREFERRED' | 'NEUTRAL' | 'TOLERATED';
export type CommitState = 'attend' | 'absent' | undefined;

type Stat = { present: number; total: number };

// Ustawienia planera per-przedmiot
interface SubjectSetting { priority: SubjectPolicy; margin: number; targetPct: number }

// Pomocnicze funkcje
function getPolishDayName(d: Date) {
  const WEEKDAY_PL = ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"];
  return WEEKDAY_PL[d.getDay()];
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODateLocal(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(n => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
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

function normalizeSubjectKey(s: string) {
  const base = (s || "").toLowerCase().trim()
    .replace(/(?:\s|-)*(\d+\/\d+)(?=$|\b)/gi, "") // usuń "1/2", "2/2", "1/3" itp.
    .replace(/[\s-]+$/g, "")
    .replace(/\s{2,}/g, " ");
  if (base === "r_matematyka") return "matematyka";
  return base;
}

function pluralLekcja(n: number) {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return 'lekcji';
  if (last === 1) return 'lekcja';
  if (last >= 2 && last <= 4) return 'lekcje';
  return 'lekcji';
}

interface AbsencePlannerProps {
  state: State;
  selectedPlanId?: string | null;
  subjectPolicy?: Record<string, SubjectPolicy>;
}

export default function AbsencePlanner({ state, selectedPlanId, subjectPolicy = {} }: AbsencePlannerProps) {
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

  // Tri-stan commitów: 'attend' | 'absent' | undefined
  const [commits, setCommits] = useState<Record<string, CommitState>>(() => {
    try { return JSON.parse(localStorage.getItem('planner:commits') || '{}'); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem('planner:commits', JSON.stringify(commits)); } catch {} }, [commits]);

  function toggleCommit(dateISO: string, next: Exclude<CommitState, undefined>) {
    setCommits(s => {
      const cur = s[dateISO];
      return { ...s, [dateISO]: (cur === next ? undefined : next) };
    });
  }

  // Ustawienia per-przedmiot (priorytet i wymagany zapas)
  const [subjectSettings, setSubjectSettings] = useState<Record<string, SubjectSetting>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('planner:subjectSettings') || '{}');
      // migracja: dopisz brakujący targetPct=50 i margin=1 jeśli nie istnieją
      const migrated: Record<string, SubjectSetting> = {};
      for (const [k, v] of Object.entries(raw || {})) {
        const vv: any = v || {};
        migrated[k] = {
          priority: (vv.priority as SubjectPolicy) ?? 'NEUTRAL',
          margin: Number.isFinite(vv.margin) ? Number(vv.margin) : 1,
          targetPct: Number.isFinite(vv.targetPct) ? Number(vv.targetPct) : 50,
        };
      }
      return migrated;
    } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem('planner:subjectSettings', JSON.stringify(subjectSettings)); } catch {} }, [subjectSettings]);

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  function getEffectivePolicy(keyRaw: string): SubjectPolicy {
    const key = normalizeSubjectKey(keyRaw);
    return subjectSettings[key]?.priority || subjectPolicy[key] || 'NEUTRAL';
  }

  function getRequiredMargin(keyRaw: string): number {
    const key = normalizeSubjectKey(keyRaw);
    const m = subjectSettings[key]?.margin;
    return Number.isFinite(m) ? Math.max(0, Math.min(10, m as number)) : 1;
  }

  function getTargetPct(keyRaw: string): number {
    const key = normalizeSubjectKey(keyRaw);
    const p = subjectSettings[key]?.targetPct;
    const val = Number.isFinite(p) ? (p as number) : 50;
    return Math.max(0, Math.min(100, val));
  }
  // licznik wybranych nieobecności (nieużywany w UI po uproszczeniu)

  // Delta od commitów (Idę/Nie idę), pomijając rozpatrywany dzień
  function getCommitDelta(excludeISO?: string) {
    const perSubject: Record<string, Stat> = {};
    let global: Stat = { present: 0, total: 0 };
    if (!plan) return { perSubject, global };
    for (const [iso, stateCommit] of Object.entries(commits)) {
      if (!stateCommit) continue;
      if (excludeISO && iso === excludeISO) continue;
      const d = parseISODateLocal(iso);
      const dayName = getPolishDayName(d);
      const def = plan.days[dayName];
      if (!def) continue;
      for (const it of def.items) {
        const key = normalizeSubjectKey(it.subjectKey);
        if (!perSubject[key]) perSubject[key] = { present: 0, total: 0 };
        perSubject[key].total += 1;
        global.total += 1;
        if (stateCommit === 'attend') {
          perSubject[key].present += 1;
          global.present += 1;
        }
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
    if (commits[dateISO] === 'attend') return { date, dateISO, lessons: lessonsInDay, risk: 'Zaplanowana obecność', tier: 'locked' as const };
    if (!def || lessonsInDay === 0) return { date, dateISO, lessons: 0, risk: 'Brak lekcji', tier: 'safe' as const };

    // ABSOLUTE: jeśli dzień zawiera przedmioty ABSOLUTE – nie rekomenduj opuszczenia
    const absoluteLabels: string[] = [];
    const preferredLabels: string[] = [];
    for (const it of def.items) {
      const key = normalizeSubjectKey(it.subjectKey);
      const label = state.subjects.find(s=>normalizeSubjectKey(s.key)===key)?.label || it.subjectLabel || key;
      const policy = getEffectivePolicy(key);
      if (policy === 'ABSOLUTE') absoluteLabels.push(label);
      if (policy === 'PREFERRED') preferredLabels.push(label);
    }
    if (absoluteLabels.length > 0) {
      return { date, dateISO, lessons: lessonsInDay, risk: `Priorytet absolutny: ${absoluteLabels.join(', ')}`, tier: 'priority' as const, absoluteLabels };
    }

    // Bazowe + deklaracje (bez rozpatrywanego dnia)
    const commitDelta = getCommitDelta(dateISO);

    // Globalne liczniki po ewentualnym opuszczeniu dnia
    let globalAfter: Stat = statPlus(baseStats.global, commitDelta.global);
    globalAfter = { present: globalAfter.present, total: globalAfter.total + def.items.length };

    // Per-przedmiot po ewentualnym opuszczeniu
    const perAfter: Record<string, Stat> = {};
    const perAfterAll: Record<string, Stat> = {};
    const subjectsInDayCount: Record<string, number> = {};
    for (const it of def.items) {
      const key = normalizeSubjectKey(it.subjectKey);
      subjectsInDayCount[key] = (subjectsInDayCount[key]||0) + 1;
    }
    const allKeys = new Set<string>([...Object.keys(baseStats.perSubject), ...Object.keys(subjectsInDayCount), ...Object.keys(commitDelta.perSubject)]);
    for (const key of allKeys) {
      const base = baseStats.perSubject[key];
      const add = commitDelta.perSubject[key];
      const dayMiss = subjectsInDayCount[key] || 0;
      const cur = statPlus(base, add);
      // Mapa bez tolerowanych (do oceny tier)
      // UWAGA: używaj efektywnej polityki (z ustawień użytkownika),
      // a nie wyłącznie subjectPolicy z propsów
      if (getEffectivePolicy(key) !== 'TOLERATED') {
        perAfter[key] = { present: cur.present, total: cur.total + dayMiss };
      }
      // Mapa pełna (do listy zagrożeń i szczegółów)
      perAfterAll[key] = { present: cur.present, total: cur.total + dayMiss };
    }

    // Bufory i ocena per-przedmiot
    function buffer(s: Stat) { return (2*s.present - s.total); }
    const globalBuf = buffer(globalAfter);
    let worstKey: string|undefined; let worstBuf = Infinity;
    let anyCritical = false; let anyDanger = false; let anyWarn = false;
    for (const [k, st] of Object.entries(perAfter)) {
      if (!subjectsInDayCount[k]) continue;
      if (getEffectivePolicy(k) === 'TOLERATED') continue;
      const b = buffer(st);
      const req = getRequiredMargin(k);
      // uwzględnij cel frekwencji: przesuń punkt odniesienia powyżej 50%
      const target = getTargetPct(k); // np. 50, 60, 75
      const targetBuf = Math.ceil((target/50 - 1) * st.total); // bufor wymagany dla celu (zaokrąglenie w górę)
      const effectiveReq = Math.max(req, targetBuf);
      if (b < worstBuf) { worstBuf = b; worstKey = k; }
      if (b < 0) anyCritical = true;
      else if (b === 0) anyDanger = true;
      else if (b < effectiveReq) anyWarn = true;
    }

    let tier: 'critical'|'danger'|'warn'|'safe' = 'safe';
    if (anyCritical) tier = 'critical';
    else if (anyDanger) tier = 'danger';
    else if (anyWarn) tier = 'warn';

    const risk = tier === 'safe'
      ? `Bezpieczny dzień do opuszczenia`
      : tier === 'warn'
        ? `Uwaga: bardzo mały zapas po opuszczeniu`
        : tier === 'danger'
          ? `Na granicy 50% – brak zapasu`
          : `Ryzyko spadku poniżej 50%`;

    // Lista zagrożonych przedmiotów (w tym tolerowane – z adnotacją)
    const threatened = Array.from(new Set(Object.keys(subjectsInDayCount))).map(key => {
      const st = perAfterAll[key];
      const buf = st ? (2*st.present - st.total) : 0;
      const label = state.subjects.find(s=>normalizeSubjectKey(s.key)===key)?.label || key;
      const isTolerated = getEffectivePolicy(key) === 'TOLERATED';
      const req = getRequiredMargin(key);
      const target = getTargetPct(key);
      const targetBuf = st ? Math.ceil((target/50 - 1) * st.total) : 0;
      const effectiveReq = Math.max(req, targetBuf);
      const projectedPct = st && st.total > 0 ? (st.present / st.total) * 100 : 0;
      const missingPctToTarget = Math.max(0, target - projectedPct);
      const t = Math.max(0, Math.min(100, target))/100;
      const missingLessonsToTarget = st ? (t >= 1 ? Infinity : Math.max(0, Math.ceil(((t * st.total) - Math.max(0,st.present)) / Math.max(1e-9,(1 - t))))) : 0;
      const present = st ? st.present : 0;
      const total = st ? st.total : 0;
      return { key, label, buf, isTolerated, req: effectiveReq, target, targetBuf, projectedPct, missingPctToTarget, missingLessonsToTarget, present, total };
    }).filter(x => x.buf < x.req || x.buf <= 0)
      .sort((a,b)=>a.buf-b.buf);

    // Dostępne przedmioty tego dnia (do selektora szczegółów)
    const daySubjects = Array.from(new Set(Object.keys(subjectsInDayCount))).map(key => ({
      key,
      label: state.subjects.find(s=>normalizeSubjectKey(s.key)===key)?.label || key
    })).sort((a,b)=>a.label.localeCompare(b.label,'pl'));

    return { date, dateISO, lessons: def.items.length, risk, tier, globalBuf, worstKey, worstBuf, perAfterAll, threatened, daySubjects };
  }

  const [detailByDate, setDetailByDate] = useState<Record<string, string | ''>>({});
  const rows = useMemo(() => {
    // Naturalna kolejność: dni w porządku chronologicznym bez dodatkowego sortowania
    return days.map(d => evaluateSkipFor(d));
  }, [days, plan, baseStats, commits, subjectPolicy, subjectSettings]);

  return (
    <div className="space-y-2">
      {!plan && (
        <div className="text-sm opacity-70 bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400"/> Wybierz plan, aby zaplanować nieobecności.
        </div>
      )}
      {plan && (
        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Ustawienia planera nieobecności</div>
            <button onClick={()=>setSettingsOpen(o=>!o)} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs">{settingsOpen ? 'Ukryj' : 'Pokaż'}</button>
          </div>
          {settingsOpen && (
            <div className="space-y-2">
              <div className="text-xs opacity-80">Cel określa, do jakiej frekwencji chcesz dążyć dla danego przedmiotu (domyślnie 50%). Zapas to liczba lekcji ponad ten cel, którą chcesz zachować po ewentualnym opuszczeniu dnia.</div>
              <div className="max-h-64 overflow-auto rounded border border-neutral-800">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-950/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Przedmiot</th>
                      <th className="text-left p-2 font-medium">Priorytet</th>
                      <th className="text-left p-2 font-medium">Cel frekwencji (%)</th>
                      <th className="text-left p-2 font-medium">Wymagany zapas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.subjects.slice().sort((a,b)=>a.label.localeCompare(b.label,'pl')).map(sub=>{
                      const key = normalizeSubjectKey(sub.key);
                      const existing = subjectSettings[key];
                      const cur = {
                        priority: (existing?.priority ?? subjectPolicy[key] ?? 'NEUTRAL') as SubjectPolicy,
                        margin: Number.isFinite(existing?.margin) ? (existing!.margin as number) : getRequiredMargin(key),
                        targetPct: Number.isFinite(existing?.targetPct) ? (existing!.targetPct as number) : 50
                      };
                      return (
                        <tr key={key} className="border-t border-neutral-800">
                          <td className="p-2 whitespace-nowrap">{sub.label}</td>
                          <td className="p-2">
                            <select value={cur.priority} onChange={e=>setSubjectSettings(s=>({ ...s, [key]: { priority: e.target.value as SubjectPolicy, margin: (s[key]?.margin ?? cur.margin), targetPct: (s[key]?.targetPct ?? cur.targetPct) } }))} className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1">
                              <option value="ABSOLUTE">Absolutny</option>
                              <option value="PREFERRED">Ważny</option>
                              <option value="NEUTRAL">Neutralny</option>
                              <option value="TOLERATED">Tolerowany</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="number" min={0} max={100} value={cur.targetPct} onChange={e=>{ const val = Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))); setSubjectSettings(s=>({ ...s, [key]: { priority: (s[key]?.priority ?? cur.priority), margin: (s[key]?.margin ?? cur.margin), targetPct: val } })); }} className="w-24 bg-neutral-950 border border-neutral-800 rounded px-2 py-1"/>
                          </td>
                          <td className="p-2">
                            <input type="number" min={0} max={10} value={cur.margin} onChange={e=>{ const val = Math.max(0, Math.min(10, parseInt(e.target.value || '0', 10))); setSubjectSettings(s=>({ ...s, [key]: { priority: (s[key]?.priority ?? cur.priority), margin: val, targetPct: (s[key]?.targetPct ?? cur.targetPct) } })); }} className="w-20 bg-neutral-950 border border-neutral-800 rounded px-2 py-1"/>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            <React.Fragment key={r.dateISO}>
              <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <DateBadgeComp dateISO={r.dateISO} label={getPolishDayName(r.date)} />
                  <div className="text-xs opacity-70 whitespace-nowrap">{r.lessons} lekcji</div>
                  <div className="text-sm font-medium truncate">
                    {r.tier === 'locked' ? (
                      <span className="text-emerald-400 inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4"/>Zaplanowana obecność</span>
                    ) : r.tier === 'priority' ? (
                      <span className="text-blue-300">{r.risk}</span>
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
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex gap-2">
                    <button
                      onClick={()=>toggleCommit(r.dateISO, 'absent')}
                      disabled={commits[r.dateISO]==='attend'}
                      className={`px-2 py-1 rounded border text-sm transition ${
                        commits[r.dateISO] === 'absent'
                          ? 'bg-red-900/40 border-red-700 text-red-200'
                          : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
                      } disabled:opacity-50`}
                    >
                      Nie idę
                    </button>
                    <button
                      onClick={()=>toggleCommit(r.dateISO, 'attend')}
                      disabled={commits[r.dateISO]==='absent'}
                      className={`px-2 py-1 rounded border text-sm transition ${
                        commits[r.dateISO] === 'attend'
                          ? 'bg-emerald-900/40 border-emerald-700 text-emerald-200'
                          : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
                      } disabled:opacity-50`}
                    >
                      Idę
                    </button>
                  </div>
                </div>
              </div>
              {/* Rozszerzone wyjaśnienie dnia */}
              <div className="mt-1 text-sm opacity-90 whitespace-normal break-words">
                {(() => {
                  if ((r as any).tier === 'priority') {
                    const abs = (r as any).absoluteLabels as string[] | undefined;
                    const list = Array.isArray(abs) && abs.length > 0 ? `: ${abs.join(', ')}` : '';
                    return `Tego dnia zaplanowano zajęcia o absolutnym priorytecie${list}. Ze względu na ich wagę nie rekomendujemy planowania nieobecności.`;
                  }
                  if ((r as any).tier === 'locked') return 'Zadeklarowałeś, że będziesz obecny. Ten dzień jest zablokowany; aby to zmienić, odznacz wybór „Idę” powyżej.';
                  if ((r as any).tier === 'filled') return 'Ten dzień jest już uzupełniony w dzienniku, dlatego nie planujemy dodatkowych nieobecności.';
                  const parts: React.ReactNode[] = [];
                  // 1) Global – pokazuj tylko, gdy zagrożony
                  const g = (r as any).globalBuf as number | undefined;
                  if (typeof g === 'number' && g <= 0) {
                    if (g < 0) parts.push(`Po opuszczeniu tego dnia całkowita frekwencja spadnie poniżej progu 50% (zabraknie ${Math.abs(g)} ${pluralLekcja(Math.abs(g))}).`);
                    else parts.push('Po opuszczeniu tego dnia całkowita frekwencja będzie dokładnie na progu 50% (bez zapasu).');
                  }
                  // 2) Lista zagrożonych przedmiotów
                  const th = (r as any).threatened as Array<{label:string;buf:number;isTolerated:boolean;req:number;target:number;targetBuf:number;projectedPct:number;missingPctToTarget:number;missingLessonsToTarget:number;present:number;total:number}> | undefined;
                  if (th && th.length > 0) {
                    const listNodes = th.map((x, idx) => {
                      const nTarget = x.missingLessonsToTarget;
                      const showShort = () => {
                        if (Number.isFinite(nTarget) && nTarget > 0) return <> {x.label}: brakuje {nTarget} {pluralLekcja(nTarget)} do celu {x.target}%</>;
                        if (x.buf < x.req) return <> {x.label}: zapas {x.buf} {pluralLekcja(x.buf)} (wymagane {x.req} {pluralLekcja(x.req)}) względem celu {x.target}%</>;
                        return <> {x.label}: cel {x.target}% osiągnięty z zapasem {Math.max(0,x.buf)} {pluralLekcja(Math.max(0,x.buf))}</>;
                      };
                      const tooltip = (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-neutral-950 border border-neutral-700 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div>Obecność: {Math.max(0,x.present)}/{Math.max(0,x.total)} ({Math.max(0,(x.projectedPct||0)).toFixed(1)}%)</div>
                          <div>Cel: {x.target}%</div>
                          <div>Wymagany zapas: {x.req} {pluralLekcja(x.req)}</div>
                          <div>Zapas po opuszczeniu: {x.buf} {pluralLekcja(x.buf)}</div>
                          {Number.isFinite(nTarget) && (nTarget>0) && <div>Brakuje do celu: {nTarget} {pluralLekcja(nTarget)}</div>}
                        </div>
                      );
                      return (
                        <span key={idx} className="relative group cursor-help">
                          <span className="underline decoration-dotted">{showShort()}</span>
                          {tooltip}
                          {idx < th.length - 1 && <span>; </span>}
                        </span>
                      );
                    });
                    parts.push(<span key="th">Wpływ na przedmioty w tym dniu: {listNodes}</span>);
                  } else {
                    parts.push('Żaden z przedmiotów nie jest na granicy – każdy ma komfortowy zapas.');
                  }
                  // 3) Szczegóły wybranego przedmiotu (selektor poniżej)
                  const sel = detailByDate[r.dateISO];
                  if (sel) {
                    const map = (r as any).perAfterAll as Record<string,{present:number;total:number}> | undefined;
                    if (map && map[sel]) {
                      const presentSel = Math.max(0, map[sel].present);
                      const totalSel = Math.max(0, map[sel].total);
                      const buf = 2*presentSel - totalSel;
                      const sLabel = (r as any).daySubjects?.find((ds:any)=>ds.key===sel)?.label || sel;
                      const tgt = getTargetPct(sel);
                      const rTarget = Math.max(0, Math.min(100, tgt))/100;
                      const needToTarget = rTarget >= 1 ? Infinity : Math.max(0, Math.ceil(((rTarget * totalSel) - presentSel) / Math.max(1e-9, (1 - rTarget))));
                      const baseMsg = buf >= 0
                        ? `Dla wybranego przedmiotu „${sLabel}” po opuszczeniu tego dnia pozostanie zapas ${buf} ${pluralLekcja(buf)}.`
                        : `Dla wybranego przedmiotu „${sLabel}” po opuszczeniu tego dnia będzie brakować ${Math.abs(buf)} ${pluralLekcja(Math.abs(buf))} do progu 50%.`;
                      const targetMsg = Number.isFinite(needToTarget) && needToTarget > 0
                        ? ` Aby osiągnąć cel ${tgt}%, potrzeba jeszcze ${needToTarget} ${pluralLekcja(needToTarget)} obecności.`
                        : '';
                      parts.push(baseMsg + targetMsg);
                    }
                  }
                  return <>{parts.filter(Boolean).map((node, i) => (<React.Fragment key={i}>{node}{i < parts.length - 1 ? ' ' : null}</React.Fragment>))}</>;
                })()}
              </div>
              {/* Selektor szczegółów per-przedmiot dla tego dnia */}
              {Array.isArray((r as any).daySubjects) && (r as any).daySubjects.length > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <label className="text-[11px] opacity-70">Pokaż szczegóły dla przedmiotu:</label>
                  <select
                    value={detailByDate[r.dateISO] || ''}
                    onChange={e=>setDetailByDate(s=>({ ...s, [r.dateISO]: e.target.value }))}
                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="">— wybierz przedmiot —</option>
                    {(r as any).daySubjects.map((ds:any)=> (
                      <option key={ds.key} value={ds.key}>{ds.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
