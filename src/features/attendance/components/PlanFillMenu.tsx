import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ReplaceAll } from 'lucide-react'
import { buildPlanNameMap } from '@/features/attendance/lib/plans'
import type { Plan } from '@/features/attendance/state/attendanceReducer'

type PlanFillMenuProps = {
  plans: Plan[]
  onFillDay: (planId: string) => void
  onFillWeek: (planId: string) => void
}

export const PlanFillMenu = React.memo(function PlanFillMenu({
  plans,
  onFillDay,
  onFillWeek,
}: PlanFillMenuProps) {
  const [open, setOpen] = useState(false)
  const nameMap = useMemo(() => buildPlanNameMap(plans), [plans])

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
              className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition flex items-center gap-2">
        <ReplaceAll className="w-4 h-4"/>Uzupełnij z...
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
                    <div className="px-3 py-2 text-sm font-medium">{nameMap[p.id] || p.name}</div>
                    <div className="px-2 pb-2 flex items-center gap-2">
                      <button onClick={() => { onFillDay(p.id); setOpen(false) }}
                              className="flex-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm">Uzupełnij <b>dzień</b></button>
                      <button onClick={() => { onFillWeek(p.id); setOpen(false) }}
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
  )
})

export default PlanFillMenu
