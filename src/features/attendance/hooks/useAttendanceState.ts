import { useReducer } from 'react'
import {
  createDefaultAttendanceState,
  reducer,
  type State,
} from '@/features/attendance/state/attendanceReducer'
import { useAttendanceSync } from '@/features/attendance/hooks/useAttendanceSync'

const LS_KEY = 'frekwencja/v1'

function loadInitial(): State {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore local parse errors and use default
  }
  return createDefaultAttendanceState()
}

export function useAttendanceState() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as State, loadInitial)
  const { resetAllData } = useAttendanceSync({ state, dispatch })
  return [state, dispatch, resetAllData] as const
}
