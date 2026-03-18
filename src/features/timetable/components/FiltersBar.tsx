import React from 'react'
import { cmpDay } from '@/lib/schedule'

function FiltersBarImpl({
  days,
  selectedDays,
  onToggleDay,
  availableGroupMarks,
  groupHalf,
  setGroupHalf,
}: {
  days: string[]
  selectedDays: string[]
  onToggleDay: (day: string) => void
  availableGroupMarks: string[]
  groupHalf: string
  setGroupHalf: (v: string) => void
}) {
  const sortedDays = React.useMemo(() => [...days].sort(cmpDay), [days])
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-2">
        {sortedDays.map((d) => {
          const on = selectedDays.includes(d);
          return (
            <button
              key={d}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                on
                  ? 'bg-zinc-700 text-zinc-100 border-zinc-600 font-medium'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/60'
              }`}
              onClick={() => onToggleDay(d)}
            >
              {d}
            </button>
          );
        })}
      </div>
      {availableGroupMarks.length > 0 && (
        <div className="ml-auto inline-flex rounded-full bg-zinc-900 border border-zinc-700/60 p-1 gap-0.5">
          <button
            className={`px-3 py-1.5 rounded-full text-sm transition-all ${groupHalf === 'all' ? 'bg-zinc-700 text-zinc-100 border border-zinc-500 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'}`}
            onClick={() => setGroupHalf('all')}
            title="Pokaż wszystkie"
          >
            Wszystkie
          </button>
          {availableGroupMarks.map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 rounded-full text-sm transition-all ${groupHalf === m ? 'bg-zinc-700 text-zinc-100 border border-zinc-500 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'}`}
              onClick={() => setGroupHalf(m)}
              title={`Filtr grupy ${m}`}
            >
              {`Grupa ${m}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const FiltersBar = React.memo(FiltersBarImpl)
