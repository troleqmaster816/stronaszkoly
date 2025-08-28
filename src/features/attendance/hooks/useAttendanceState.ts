import { useEffect, useReducer, useRef, useState } from 'react';
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
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const remoteEnabled = useRef(false);
  const putInFlight = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect auth and load remote state if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
        const authed = !!(me && me.ok && me.authenticated);
        if (cancelled) return;
        setIsAuth(authed);
        if (authed) {
          const res = await fetch('/api/attendance', { credentials: 'include', cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            if (j && j.ok && j.data) {
              remoteEnabled.current = true;
              dispatch({ type: 'LOAD_STATE', payload: {
                subjects: Array.isArray(j.data.subjects) ? j.data.subjects : [],
                plans: Array.isArray(j.data.plans) ? j.data.plans : [],
                byDate: (j.data.byDate && typeof j.data.byDate === 'object') ? j.data.byDate : {},
              } as State });
              return;
            }
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist to local storage or remote API
  useEffect(() => {
    const doPersist = async () => {
      if (remoteEnabled.current) {
        try {
          await fetch('/api/attendance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ...state, version: 1 }),
          });
        } catch {}
        return;
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    };
    if (putInFlight.current) clearTimeout(putInFlight.current);
    putInFlight.current = setTimeout(doPersist, 200);
    return () => { if (putInFlight.current) clearTimeout(putInFlight.current); };
  }, [state]);

  return [state, dispatch] as const;
}


