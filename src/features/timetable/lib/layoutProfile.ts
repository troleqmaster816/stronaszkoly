import { extractHalfMark, stripHalfMark } from '@/lib/schedule'
import { extractRoomCode } from '@/features/timetable/lib/roomDisplay'
import type { Lesson } from '@/types/schedule'
import type { TimetableDensity } from '@/features/timetable/components/GridView'
import { compactTeacherLabel } from '@/features/timetable/lib/teacherOverrides'

export type ChipLayoutMode = 'inline' | 'stacked'
export type LabelMode = 'full' | 'compact'

export type AdaptiveLayoutProfile = {
  density: TimetableDensity
  chipLayoutMode: ChipLayoutMode
  labelMode: LabelMode
  shellMaxWidth: number
  cellMinPx: number
}

export function compactRoomLabel(label: string): string {
  const trimmed = (label || '').trim()
  const base = extractRoomCode(trimmed) || trimmed
  return base.length > 8 ? base.slice(0, 8) : base
}

export function compactGroupLabel(label: string): string {
  const cleaned = (label || '').replace(/\s*\(?\d+\/\d+\)?\s*$/i, '').trim()
  return cleaned || (label || '').trim()
}

export function getAvailableShellWidth(viewportWidth: number): number {
  const outerGutter = viewportWidth >= 1920 ? 56 : viewportWidth >= 1440 ? 44 : 32
  return Math.max(1024, viewportWidth - outerGutter)
}

let textMeasureCanvas: HTMLCanvasElement | null = null

function measureTextPx(text: string, sizePx: number, weight = 600): number {
  const value = (text || '').trim()
  if (!value) return 0
  if (typeof document === 'undefined') return Math.ceil(value.length * sizePx * 0.58)

  if (!textMeasureCanvas) textMeasureCanvas = document.createElement('canvas')
  const ctx = textMeasureCanvas.getContext('2d')
  if (!ctx) return Math.ceil(value.length * sizePx * 0.58)

  ctx.font = `${weight} ${sizePx}px "Space Grotesk", system-ui, sans-serif`
  return Math.ceil(ctx.measureText(value).width)
}

function chipWidthPx(label: string, sizePx: number, padX: number): number {
  return measureTextPx(label, sizePx, 600) + padX * 2 + 14
}

export function computeAdaptiveLayoutProfile(args: {
  viewportWidth: number
  dayCount: number
  lessons: Lesson[]
}): AdaptiveLayoutProfile {
  const { viewportWidth, dayCount, lessons } = args
  const available = getAvailableShellWidth(viewportWidth)
  const safeDays = Math.max(1, dayCount)
  const minShell = safeDays <= 3 ? 980 : safeDays === 4 ? 1120 : 1240

  const options: Array<{
    density: TimetableDensity
    chipLayoutMode: ChipLayoutMode
    labelMode: LabelMode
    chipFontPx: number
    chipPadX: number
    subjectFontPx: number
    cardPadX: number
  }> = [
    { density: 'comfortable', chipLayoutMode: 'inline', labelMode: 'full', chipFontPx: 11, chipPadX: 8, subjectFontPx: 15, cardPadX: 10 },
    { density: 'compact', chipLayoutMode: 'inline', labelMode: 'compact', chipFontPx: 11, chipPadX: 7, subjectFontPx: 14, cardPadX: 8 },
    { density: 'tight', chipLayoutMode: 'stacked', labelMode: 'compact', chipFontPx: 11, chipPadX: 6, subjectFontPx: 14, cardPadX: 8 },
  ]

  let fallback: AdaptiveLayoutProfile | null = null
  for (const opt of options) {
    let maxCard = 232
    for (const lesson of lessons) {
      const classFull = lesson.group?.name ?? ''
      const classLabel = compactGroupLabel(classFull)
      const teacherFull = lesson.teacher?.name ?? ''
      const roomRaw = lesson.room?.name ?? ''
      const roomBase = extractRoomCode(roomRaw) || roomRaw.replace(/^(?:Sala|S)\.?\s*/i, '').trim() || roomRaw
      const teacherLabel = opt.labelMode === 'compact' ? compactTeacherLabel(teacherFull) : teacherFull
      const roomLabel = opt.labelMode === 'compact' ? compactRoomLabel(roomBase) : roomBase

      const classW = lesson.group ? chipWidthPx(classLabel, opt.chipFontPx, opt.chipPadX) : 0
      const teacherW = lesson.teacher ? chipWidthPx(teacherLabel, opt.chipFontPx, opt.chipPadX) : 0
      const roomW = lesson.room ? chipWidthPx(roomLabel, opt.chipFontPx, opt.chipPadX) : 0

      const chips = [classW, teacherW, roomW].filter((w) => w > 0)
      const gap = 6
      let chipsRowWidth = 0

      if (opt.chipLayoutMode === 'inline') {
        chipsRowWidth = chips.length ? chips.reduce((a, b) => a + b, 0) + Math.max(0, chips.length - 1) * gap : 0
      } else {
        const top = classW
        const bottomParts = [teacherW, roomW].filter((w) => w > 0)
        const bottom = bottomParts.length ? bottomParts.reduce((a, b) => a + b, 0) + Math.max(0, bottomParts.length - 1) * gap : 0
        chipsRowWidth = Math.max(top, bottom)
      }

      const subject = stripHalfMark(lesson.subject) || lesson.subject || ''
      const subjectW = measureTextPx(subject, opt.subjectFontPx, 700) + (extractHalfMark(lesson.subject) ? 38 : 0)
      const timeW = measureTextPx(lesson.time || '', 11, 500)
      const rightMin = Math.max(136, subjectW, timeW, chipsRowWidth)
      const cardW = opt.cardPadX * 2 + 32 + 10 + rightMin
      if (cardW > maxCard) maxCard = cardW
    }

    const required = Math.ceil(maxCard * safeDays + 34)
    const shell = Math.min(available, Math.max(minShell, required))
    const fits = required <= available
    const fittedCellMin = fits
      ? Math.ceil(maxCard)
      : Math.max(200, Math.floor((available - 34) / safeDays))

    const profile: AdaptiveLayoutProfile = {
      density: opt.density,
      chipLayoutMode: opt.chipLayoutMode,
      labelMode: opt.labelMode,
      shellMaxWidth: shell,
      cellMinPx: Math.max(200, fittedCellMin),
    }

    fallback = profile
    if (fits) return profile
  }

  return fallback ?? {
    density: 'tight',
    chipLayoutMode: 'stacked',
    labelMode: 'compact',
    shellMaxWidth: available,
    cellMinPx: Math.max(220, Math.floor((available - 34) / safeDays)),
  }
}
