import React from 'react'
import { cmpDay } from '@/lib/schedule'

export function FiltersBar({
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
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-2">
        {[...days].sort(cmpDay).map((d) => {
          const on = selectedDays.includes(d);
          return (
            <button
              key={d}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                on ? 'bg-zinc-200 text-zinc-900 border-zinc-300' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-800'
              }`}
              onClick={() => onToggleDay(d)}
            >
              {d}
            </button>
          );
        })}
      </div>
      {availableGroupMarks.length > 0 && (
        <div className="ml-auto inline-flex rounded-full bg-zinc-800 p-1">
          <button
            className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === 'all' ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
            onClick={() => setGroupHalf('all')}
            title="Pokaż wszystkie"
          >
            Wszystkie
          </button>
          {availableGroupMarks.map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 rounded-full text-sm transition ${groupHalf === m ? 'bg-zinc-900 border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'}`}
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


