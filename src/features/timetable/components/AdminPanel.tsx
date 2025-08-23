import React from 'react'
import { RefreshCw } from 'lucide-react'

export function AdminPanel({
  isAuth,
  onLogin,
  onLogout,
  refreshing,
  onRefresh,
  overrides,
  setOverrides,
  subjectKeys,
  subjectFilter,
  setSubjectFilter,
  teacherShortNames,
  teacherFilter,
  setTeacherFilter,
  onClose,
}: {
  isAuth: boolean
  onLogin: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>
  onLogout: () => void
  refreshing: boolean
  onRefresh: () => void
  overrides: { subjectOverrides: Record<string,string>; teacherNameOverrides: Record<string,string> }
  setOverrides: React.Dispatch<React.SetStateAction<{ subjectOverrides: Record<string,string>; teacherNameOverrides: Record<string,string> }>>
  subjectKeys: string[]
  subjectFilter: string
  setSubjectFilter: (v: string) => void
  teacherShortNames: string[]
  teacherFilter: string
  setTeacherFilter: (v: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Panel administratora</div>
          <div className="flex items-center gap-2">
            {isAuth && (
              <button onClick={onLogout} className="text-sm px-2 py-1 border border-zinc-700 rounded-md bg-zinc-800">Wyloguj</button>
            )}
            <button onClick={onClose} className="text-sm px-2 py-1 border border-zinc-700 rounded-md bg-zinc-800">Zamknij</button>
          </div>
        </div>

        {!isAuth ? (
          <form onSubmit={onLogin} className="grid gap-2">
            <div className="text-sm text-zinc-400">Zaloguj się, aby zarządzać danymi.</div>
            <input name="username" className="px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700" placeholder="Nazwa użytkownika" />
            <input name="password" type="password" className="px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700" placeholder="Hasło" />
            <button className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500">Zaloguj</button>
            <div className="text-xs text-zinc-500">Przykładowe konto: admin / admin123</div>
          </form>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-xl border border-zinc-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Odświeżenie planu</div>
                <button
                  onClick={onRefresh}
                  disabled={refreshing}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 ${refreshing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-zinc-700'}`}
                  title="Uruchom scraper i uaktualnij plik timetable_data.json"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Odświeżanie…' : 'Odśwież teraz'}
                </button>
              </div>
              <div className="text-xs text-zinc-400">Po zakończeniu plan zostanie ponownie wczytany.</div>
            </div>

            <div className="rounded-xl border border-zinc-800 p-3 grid gap-3">
              <div className="font-medium">Nadpisania nazw</div>
              <div className="text-xs text-zinc-400">Uzupełnij listy z poniższych propozycji i wpisz własne wartości. Klucze przedmiotów są normalizowane.</div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm">Przedmioty (oryginał → wyświetlana)</div>
                    <input
                      className="text-xs px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                      placeholder="Szukaj przedmiotu"
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-md">
                    {subjectKeys
                      .filter((key) => key.includes(subjectFilter.toLowerCase().trim()))
                      .slice(0, 200)
                      .sort()
                      .map((key) => (
                        <div key={key} className="flex items-center gap-2 p-2 border-b border-zinc-800 last:border-b-0">
                          <div className="text-xs text-zinc-400 min-w-0 flex-1 truncate" title={key}>{key}</div>
                          <input
                            className="text-sm px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                            placeholder="Wyświetlana nazwa"
                            value={overrides.subjectOverrides[key] ?? ''}
                            onChange={(e) => setOverrides((s) => ({ ...s, subjectOverrides: { ...s.subjectOverrides, [key]: e.target.value } }))}
                          />
                          <button
                            className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                            onClick={() => setOverrides((s) => {
                              const copy = { ...s.subjectOverrides };
                              delete copy[key];
                              return { ...s, subjectOverrides: copy };
                            })}
                          >Wyczyść</button>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm">Nauczyciele (skrót → pełna nazwa)</div>
                    <input
                      className="text-xs px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                      placeholder="Szukaj nauczyciela"
                      value={teacherFilter}
                      onChange={(e) => setTeacherFilter(e.target.value)}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-md">
                    {teacherShortNames
                      .filter((shortName) => shortName.toLowerCase().includes(teacherFilter.toLowerCase().trim()))
                      .slice(0, 300)
                      .sort()
                      .map((shortName) => (
                        <div key={shortName} className="flex items-center gap-2 p-2 border-b border-zinc-800 last:border-b-0">
                          <div className="text-xs text-zinc-400 min-w-0 flex-1 truncate" title={shortName}>{shortName}</div>
                          <input
                            className="text-sm px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 w-48"
                            placeholder="Pełna nazwa"
                            value={overrides.teacherNameOverrides[shortName] ?? ''}
                            onChange={(e) => setOverrides((s) => ({ ...s, teacherNameOverrides: { ...s.teacherNameOverrides, [shortName]: e.target.value } }))}
                          />
                          <button
                            className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                            onClick={() => setOverrides((s) => {
                              const copy = { ...s.teacherNameOverrides };
                              delete copy[shortName];
                              return { ...s, teacherNameOverrides: copy };
                            })}
                          >Wyczyść</button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => (document.getElementById('save-overrides') as HTMLButtonElement)?.click()} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500">Zapisz nadpisania</button>
                <button onClick={() => { setOverrides({ subjectOverrides: {}, teacherNameOverrides: {} }); }} className="px-3 py-2 rounded-md border border-zinc-700 hover:bg-zinc-800">Wyczyść wszystko</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


