// Shared schedule utilities – extracted for reuse across views

import type { Lesson } from '@/types/schedule';

export const DAY_ORDER: Record<string, number> = {
  "Poniedziałek": 1,
  "Wtorek": 2,
  "Środa": 3,
  "Czwartek": 4,
  "Piątek": 5,
  "Sobota": 6,
  "Niedziela": 7,
};

export function cmpDay(a: string, b: string) {
  const da = DAY_ORDER[a] ?? 99;
  const db = DAY_ORDER[b] ?? 99;
  return da - db || a.localeCompare(b, 'pl');
}

export function cmpLesson(a: Lesson, b: Lesson) {
  const na = parseInt(a.lesson_num, 10);
  const nb = parseInt(b.lesson_num, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  const ta = a.time?.split("-")?.[0] ?? "";
  const tb = b.time?.split("-")?.[0] ?? "";
  return ta.localeCompare(tb) || (a.subject ?? "").localeCompare(b.subject ?? "", 'pl');
}

export function idToKind(id: string | null | undefined): "teacher" | "room" | "class" | null {
  if (!id) return null;
  if (id.startsWith("n")) return "teacher";
  if (id.startsWith("s")) return "room";
  if (id.startsWith("o")) return "class";
  return null;
}

export function prettyKind(kind: ReturnType<typeof idToKind>) {
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

// Extracts group mark such as 1/2, 2/3 present at end or after dash/space
export function extractHalfMark(subject?: string | null): string | null {
  if (!subject) return null;
  const m = subject.match(/(?:^|\b|\-)(\d+\/\d+)(?=$|\b)/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, "");
}

// Normalizes subject key: removes group marks (e.g., 1/2), trims dashes/spaces, lowercases
export function normalizeSubjectKey(subject?: string | null): string {
  if (!subject) return "";
  let s = subject.toLowerCase().trim();
  s = s.replace(/(?:\s|\-)*(\d+\/\d+)(?=$|\b)/gi, "");
  s = s.replace(/[\s\-]+$/g, "").replace(/\s{2,}/g, " ");
  return s;
}


