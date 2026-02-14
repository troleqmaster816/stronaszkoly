import React from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { DateBadge as DateBadgeComp } from '@/features/attendance/components/DateBadge'
import { getPolishDayName, parseISODateLocal } from '@/lib/attendance'
import type { Action, AttendanceEntry, State } from '@/features/attendance/state/attendanceReducer'

type DayAttendanceProps = {
  dateISO: string
  entries: AttendanceEntry[]
  subjects: State['subjects']
  dispatch: React.Dispatch<Action>
}

export const DayAttendance = React.memo(function DayAttendance({
  dateISO,
  entries,
  subjects,
  dispatch,
}: DayAttendanceProps) {
  const dayName = getPolishDayName(parseISODateLocal(dateISO))

  function addRow() {
    const subj = subjects[0] || { key: 'matematyka', label: 'Matematyka' }
    const slot = `${dayName}#${entries.length + 1}`
    const id = `${dateISO}#${slot}`
    const entry: AttendanceEntry = {
      id,
      date: dateISO,
      dayName,
      slot,
      subjectKey: subj.key,
      subjectLabel: subj.label,
      present: true,
    }
    dispatch({ type: 'UPSERT_ENTRY', entry })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateBadgeComp dateISO={dateISO} label={getPolishDayName(parseISODateLocal(dateISO))} />
        <button onClick={addRow} className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition flex items-center gap-2">
          <Plus className="w-4 h-4"/>Dodaj lekcję
        </button>
      </div>
      <div className="space-y-2">
        {entries.map(e => (
          <div key={e.id} className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 overflow-hidden">
            <span className="w-16 text-xs opacity-70 flex-shrink-0">{e.slot.split('#')[1]}</span>
            <select value={e.subjectKey}
                    onChange={ev=>{
                      const key = ev.target.value
                      const label = subjects.find(s=>s.key===key)?.label || key
                      dispatch({ type:'UPSERT_ENTRY', entry: { ...e, subjectKey: key, subjectLabel: label }})
                    }}
                    className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm whitespace-normal break-words">
              {subjects.map(s => <option value={s.key} key={s.key}>{s.label}</option>)}
            </select>
            <button
              onClick={()=>dispatch({ type:'TOGGLE_PRESENT', dateISO: e.date, entryId: e.id })}
              className={`px-2.5 py-1.5 rounded border transition flex items-center gap-1 ${
                e.present ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500' : 'bg-red-600 hover:bg-red-500 border-red-500'
              }`}
              title={e.present ? 'Obecny - kliknij, aby ustawić nieobecność' : 'Nieobecny - kliknij, aby ustawić obecność'}
            >
              {e.present ? <Check className="w-4 h-4"/> : <X className="w-4 h-4"/>}
              <span className="text-xs">{e.present ? 'obecny' : 'nieobecny'}</span>
            </button>
            <button onClick={()=>dispatch({ type:'DELETE_ENTRY', dateISO: e.date, entryId: e.id })}
                    className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700">
              <Trash2 className="w-4 h-4"/>
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-sm opacity-70 border border-neutral-800 rounded p-3">
            Brak lekcji tego dnia. Dodaj ręcznie lub użyj <em>Uzupełnij z...</em>
          </div>
        )}
      </div>
    </div>
  )
})

export default DayAttendance
