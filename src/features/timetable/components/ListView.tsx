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

function ListViewImpl({
  selectedDays,
  lessonsByDay,
  isMobile,
  onSwipePrev,
  onSwipeNext,
  onRenderLesson,
}: {
  selectedDays: string[]
  lessonsByDay: Map<string, Lesson[]>
  isMobile: boolean
  onSwipePrev: () => void
  onSwipeNext: () => void
  onRenderLesson: (l: Lesson, key: React.Key) => React.ReactNode
}) {
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null)
  const visibleDays = React.useMemo(
    () => Array.from(lessonsByDay.keys()).filter((d) => selectedDays.includes(d)).sort(cmpDay),
    [lessonsByDay, selectedDays]
  )
  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid gap-4"
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
      {visibleDays.map((d) => (
          <div key={d} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
            {!isMobile && <div className="text-sm font-semibold mb-3 text-zinc-200">{d}</div>}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {lessonsByDay.get(d)!.map((l, i) => onRenderLesson(l, `${d}|${i}`))}
            </div>
          </div>
        ))}
    </motion.div>
  )
}

export const ListView = React.memo(ListViewImpl)
