import { DAY_ORDER } from '@/lib/schedule';

// Types co-located with reducer for clarity and testability
export type AttendanceEntry = {
  id: string;           // date#slotId
  date: string;         // ISO YYYY-MM-DD
  dayName: string;      // "Poniedziałek"
  slot: string;         // e.g., "Poniedziałek#1" or with time
  subjectKey: string;
  subjectLabel: string;
  present: boolean;
};

export type PlanDay = {
  items: { slotHint?: string; subjectKey: string; subjectLabel: string }[];
};

export type Plan = {
  id: string;
  name: string;
  days: Record<string, PlanDay>;
  createdAt: number;
  source?: { kind: 'school'; classId: string; className: string; group?: string|null; meta?: any };
};

export type State = {
  subjects: { key: string; label: string }[];
  plans: Plan[];
  byDate: Record<string, AttendanceEntry[]>;
};

export type Action =
  | { type: 'ADD_SUBJECT'; label: string }
  | { type: 'RENAME_SUBJECT'; key: string; newLabel: string }
  | { type: 'REMOVE_SUBJECT'; key: string }
  | { type: 'UPSERT_PLAN'; plan: Plan }
  | { type: 'DELETE_PLAN'; id: string }
  | { type: 'FILL_DAY_FROM_PLAN'; dateISO: string; planId: string }
  | { type: 'FILL_WEEK_FROM_PLAN'; weekMondayISO: string; planId: string }
  | { type: 'UPSERT_ENTRY'; entry: AttendanceEntry }
  | { type: 'TOGGLE_PRESENT'; dateISO: string; entryId: string }
  | { type: 'DELETE_ENTRY'; dateISO: string; entryId: string }
  | { type: 'LOAD_STATE'; payload: State };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_SUBJECT': {
      const label = action.label.trim();
      if (!label) return state;
      const key = normalizeSubjectKey(label);
      if (state.subjects.some(s => s.key === key)) return state;
      const subjects = [...state.subjects, { key, label }];
      return { ...state, subjects };
    }
    case 'RENAME_SUBJECT': {
      const subjects = state.subjects.map(s => s.key === action.key ? { ...s, label: action.newLabel.trim() || s.label } : s);
      return { ...state, subjects };
    }
    case 'REMOVE_SUBJECT': {
      const subjects = state.subjects.filter(s => s.key !== action.key);
      return { ...state, subjects };
    }
    case 'UPSERT_PLAN': {
      const exists = state.plans.some(p => p.id === action.plan.id);
      const plans = exists ? state.plans.map(p => p.id === action.plan.id ? action.plan : p) : [action.plan, ...state.plans];
      const incoming = Object.values(action.plan.days).flatMap(d => d.items.map(it => ({ key: it.subjectKey, label: it.subjectLabel })));
      const toAdd = incoming.filter(n => !state.subjects.some(s => s.key === n.key));
      const subjects = toAdd.length ? [...state.subjects, ...uniqueByKey(toAdd)] : state.subjects;
      return { ...state, plans, subjects };
    }
    case 'DELETE_PLAN': {
      const plans = state.plans.filter(p => p.id !== action.id);
      return { ...state, plans };
    }
    case 'FILL_DAY_FROM_PLAN': {
      const plan = state.plans.find(p => p.id === action.planId);
      if (!plan) return state;
      const dateISO = action.dateISO;
      const dayName = getPolishDayName(parseISODateLocal(dateISO));
      const def = plan.days[dayName];
      if (!def) return state;
      const curr = state.byDate[dateISO] || [];
      const nextEntries: AttendanceEntry[] = [...curr];
      def.items.forEach((it, idx) => {
        const slot = `${dayName}#${it.slotHint || idx+1}`;
        const id = `${dateISO}#${slot}`;
        if (!nextEntries.some(e => e.id === id)) {
          nextEntries.push({
            id, date: dateISO, dayName,
            slot,
            subjectKey: it.subjectKey,
            subjectLabel: it.subjectLabel,
            present: true
          });
        }
      });
      const byDate = { ...state.byDate, [dateISO]: sortDay(nextEntries) };
      return { ...state, byDate };
    }
    case 'FILL_WEEK_FROM_PLAN': {
      const monday = parseISODateLocal(action.weekMondayISO);
      let s = state;
      for (let i=0;i<5;i++) {
        const dateISO = toISODate(addDays(monday, i));
        s = reducer(s, { type: 'FILL_DAY_FROM_PLAN', dateISO, planId: action.planId });
      }
      return s;
    }
    case 'UPSERT_ENTRY': {
      const list = [...(state.byDate[action.entry.date] || [])];
      const idx = list.findIndex(e => e.id === action.entry.id);
      if (idx >= 0) list[idx] = action.entry; else list.push(action.entry);
      const byDate = { ...state.byDate, [action.entry.date]: sortDay(list) };
      return { ...state, byDate };
    }
    case 'TOGGLE_PRESENT': {
      const list = [...(state.byDate[action.dateISO] || [])];
      const idx = list.findIndex(e => e.id === action.entryId);
      if (idx < 0) return state;
      list[idx] = { ...list[idx], present: !list[idx].present };
      const byDate = { ...state.byDate, [action.dateISO]: list };
      return { ...state, byDate };
    }
    case 'DELETE_ENTRY': {
      const list = (state.byDate[action.dateISO] || []).filter(e => e.id !== action.entryId);
      const byDate = { ...state.byDate, [action.dateISO]: list };
      return { ...state, byDate };
    }
    case 'LOAD_STATE': {
      return action.payload;
    }
    default:
      return state;
  }
}

// Internal helpers
function sortDay(arr: AttendanceEntry[]) {
  return [...arr].sort((a,b) => {
    const aNum = safeParseInt(a.slot.split('#')[1]);
    const bNum = safeParseInt(b.slot.split('#')[1]);
    if (aNum !== bNum) return aNum - bNum;
    return a.subjectLabel.localeCompare(b.subjectLabel, 'pl');
  });
}
function uniqueByKey(arr: {key:string;label:string}[]) {
  const seen = new Set<string>(); const out: {key:string;label:string}[] = [];
  for (const it of arr) if (!seen.has(it.key)) { seen.add(it.key); out.push(it); }
  return out;
}
function getPolishDayName(d: Date) {
  const WEEKDAY_PL = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  return WEEKDAY_PL[d.getDay()];
}
function parseISODateLocal(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(n => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function safeParseInt(s: string) {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
function normalizeSubjectKey(s: string) {
  const base = (s || '').toLowerCase().trim()
    .replace(/(?:\s|-)*(\d+\/\d+)(?=$|\b)/gi, '')
    .replace(/[\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ');
  if (base === 'r_matematyka') return 'matematyka';
  return base;
}


