import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createDefaultAttendanceState, reducer, type State } from '@/features/attendance/state/attendanceReducer';

const LS_KEY = 'frekwencja/v1';

function loadInitial(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return createDefaultAttendanceState();
}

export function useAttendanceState() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as State, loadInitial);
  const remoteEnabled = useRef(false);
  const putInFlight = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressInitialHydrate = useRef(false);

  // Detect auth and load remote state if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch('/v1/users/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
        const authed = !!(me && me.ok && me.authenticated);
        if (cancelled) return;
        if (authed) {
          remoteEnabled.current = true;
          const res = await fetch('/v1/attendance', { credentials: 'include', cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled && !suppressInitialHydrate.current && j && j.ok && j.data) {
              dispatch({ type: 'LOAD_STATE', payload: {
                subjects: Array.isArray(j.data.subjects) ? j.data.subjects : [],
                plans: Array.isArray(j.data.plans) ? j.data.plans : [],
                byDate: (j.data.byDate && typeof j.data.byDate === 'object') ? j.data.byDate : {},
              } as State });
              return;
            }
          }
        } else {
          remoteEnabled.current = false;
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const resetAllData = useCallback(async () => {
    const empty = createDefaultAttendanceState();
    suppressInitialHydrate.current = true;
    if (putInFlight.current) clearTimeout(putInFlight.current);
    dispatch({ type: 'LOAD_STATE', payload: empty });
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }

    let shouldWriteRemote = remoteEnabled.current;
    if (!shouldWriteRemote) {
      try {
        const me = await fetch('/v1/users/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
        shouldWriteRemote = !!(me && me.ok && me.authenticated);
        if (shouldWriteRemote) remoteEnabled.current = true;
      } catch { /* ignore */ }
    }
    if (!shouldWriteRemote) return;

    try {
      const csrf = document.cookie.split('; ').find((c) => c.startsWith('csrf='))?.split('=')[1] || '';
      const res = await fetch('/v1/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'include',
        body: JSON.stringify({ ...empty, version: 1 }),
      });
      if (!res.ok) remoteEnabled.current = false;
    } catch {
      remoteEnabled.current = false;
    }
  }, []);

  // Persist to local storage or remote API
  useEffect(() => {
    const doPersist = async () => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
      if (!remoteEnabled.current) return;
      try {
        const csrf = document.cookie.split('; ').find((c) => c.startsWith('csrf='))?.split('=')[1] || '';
        const res = await fetch('/v1/attendance', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          credentials: 'include',
          body: JSON.stringify({ ...state, version: 1 }),
        });
        if (!res.ok) remoteEnabled.current = false;
      } catch {
        remoteEnabled.current = false;
      }
    };
    if (putInFlight.current) clearTimeout(putInFlight.current);
    putInFlight.current = setTimeout(doPersist, 200);
    return () => { if (putInFlight.current) clearTimeout(putInFlight.current); };
  }, [state]);

  return [state, dispatch, resetAllData] as const;
}
