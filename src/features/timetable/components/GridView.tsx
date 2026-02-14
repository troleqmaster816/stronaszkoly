import React from 'react'
import { motion } from 'framer-motion'
import { cmpDay } from '@/lib/schedule'

type Lesson = {
  day: string
  lesson_num: string
  time: string
  subject: string
  teacher: { id: string; name: string } | null
  group: { id: string; name: string } | null
  room: { id: string; name: string } | null
}

export type TimetableDensity = 'comfortable' | 'compact' | 'tight'

function GridViewImpl({
  daysInData,
  selectedDays,
  periods,
  activeLessons,
  isMobile,
  density,
  dayCount,
  cellMinPx,
  onSwipePrev,
  onSwipeNext,
  onRenderLesson,
}: {
  daysInData: string[]
  selectedDays: string[]
  periods: { lesson_num: string; time: string }[]
  activeLessons: Lesson[]
  isMobile: boolean
  density: TimetableDensity
  dayCount: number
  cellMinPx: number
  onSwipePrev: () => void
  onSwipeNext: () => void
  onRenderLesson: (l: Lesson, key: React.Key) => React.ReactNode
}) {
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null)
  const visibleDays = React.useMemo(
    () => daysInData.filter((d) => selectedDays.includes(d)).sort(cmpDay),
    [daysInData, selectedDays]
  )

  const lessonsByCell = React.useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of activeLessons) {
      const key = `${lesson.day}|${lesson.lesson_num}|${lesson.time}`
      const bucket = map.get(key)
      if (bucket) {
        bucket.push(lesson)
      } else {
        map.set(key, [lesson])
      }
    }
    return map
  }, [activeLessons])

  const cols = Math.max(1, Math.min(dayCount || 1, visibleDays.length || 1))
  const gridTemplateColumns = React.useMemo(() => {
    const minCell = Math.max(0, Math.round(cellMinPx || 0))
    if (minCell > 0) return `repeat(${cols}, minmax(${minCell}px, 1fr))`
    return `repeat(${cols}, minmax(0, 1fr))`
  }, [cellMinPx, cols])
  const cellPadding = density === 'comfortable' ? 'p-2' : density === 'compact' ? 'p-1.5' : 'p-1'
  const stackGap = density === 'comfortable' ? 'gap-2' : 'gap-1.5'
  const placeholderPad = density === 'tight' ? 'p-1.5' : 'p-2'
  const headerPad = density === 'tight' ? 'px-2 py-1.5' : 'px-2.5 py-2'

  return (
    <motion.div
      key="grid"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm"
      onTouchStart={(e) => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const st = swipeStart.current; swipeStart.current = null;
        if (!st || !isMobile) return;
        const dx = e.changedTouches[0].clientX - st.x;
        const dy = e.changedTouches[0].clientY - st.y;
        if (Math.abs(dx) > 40 && Math.abs(dy) < 30) {
          if (dx < 0) onSwipeNext(); else onSwipePrev();
        }
      }}
    >
      {periods.length === 0 ? (
        <div className="p-4 text-zinc-400">Brak danych do wyświetlenia dla wybranych filtrów.</div>
      ) : (
        <>
          <div
            className="grid border-b border-zinc-800 bg-zinc-800/70"
            style={{ gridTemplateColumns }}
          >
            {visibleDays.map((d) => (
              <div key={d} className={`${headerPad} text-left text-[13px] font-medium text-zinc-200`}>
                {d}
              </div>
            ))}
          </div>

          <div className="divide-y divide-zinc-800">
            {periods.map((p) => (
              <div
                key={`${p.lesson_num}|${p.time}`}
                className="grid"
                style={{ gridTemplateColumns }}
              >
                {visibleDays.map((d) => {
                  const inCell = lessonsByCell.get(`${d}|${p.lesson_num}|${p.time}`) ?? []
                  return (
                    <div key={`${d}|${p.lesson_num}`} className={cellPadding}>
                      {inCell.length === 0 ? (
                        <div className={`rounded-lg border border-dashed border-zinc-800 text-center text-[11px] text-zinc-600 ${placeholderPad}`}>
                          —
                        </div>
                      ) : (
                        <div className={`grid auto-rows-max ${stackGap}`}>
                          {inCell.map((l, idx) => onRenderLesson(l, `${d}|${p.lesson_num}|${idx}`))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

export const GridView = React.memo(GridViewImpl)
