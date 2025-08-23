import { useEffect, useReducer } from 'react';
import { reducer, type State } from '@/features/attendance/state/attendanceReducer';

const LS_KEY = 'frekwencja/v1';

function loadInitial(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    subjects: [
      { key: 'matematyka', label: 'Matematyka' },
      { key: 'j.polski', label: 'Język polski' },
      { key: 'informatyka', label: 'Informatyka' },
    ],
    plans: [],
    byDate: {},
  };
}

export function useAttendanceState() {
  const [state, dispatch] = useReducer(reducer, undefined as any, loadInitial);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [state]);

  return [state, dispatch] as const;
}


