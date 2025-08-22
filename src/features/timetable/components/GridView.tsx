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

export function GridView({
  daysInData,
  selectedDays,
  periods,
  activeLessons,
  isMobile,
  onSwipePrev,
  onSwipeNext,
  onRenderLesson,
}: {
  daysInData: string[]
  selectedDays: string[]
  periods: { lesson_num: string; time: string }[]
  activeLessons: Lesson[]
  isMobile: boolean
  onSwipePrev: () => void
  onSwipeNext: () => void
  onRenderLesson: (l: Lesson, key: React.Key) => React.ReactNode
}) {
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null)
  return (
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
          if (dx < 0) onSwipeNext(); else onSwipePrev();
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
                          {inCell.map((l, idx) => onRenderLesson(l, `${d}|${p.lesson_num}|${idx}`))}
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
  )
}


