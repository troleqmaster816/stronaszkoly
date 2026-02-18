import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type TeacherEntry = { id: string | null; shortName: string; originalName: string }

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
  teacherEntries,
  teacherFilter,
  setTeacherFilter,
  onSaveOverrides,
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
  teacherEntries: TeacherEntry[]
  teacherFilter: string
  setTeacherFilter: (v: string) => void
  onSaveOverrides: () => void | Promise<void>
  onClose: () => void
}) {
  return (
    <Modal
      onClose={onClose}
      overlayClassName="bg-black/70"
      panelClassName="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 m-4"
    >
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Panel administratora</div>
          <div className="flex items-center gap-2">
            {isAuth && (
              <Button onClick={onLogout} variant="outline" size="sm">Wyloguj</Button>
            )}
            <Button onClick={onClose} variant="outline" size="sm">Zamknij</Button>
          </div>
        </div>

        {!isAuth ? (
          <form onSubmit={onLogin} className="grid gap-2">
            <div className="text-sm text-zinc-400">Zaloguj się, aby zarządzać danymi.</div>
            <Input name="username" placeholder="Nazwa użytkownika" />
            <Input name="password" type="password" placeholder="Hasło" />
            <Button variant="primary" type="submit">Zaloguj</Button>
            <div className="text-xs text-zinc-500">Logowanie administratora działa tylko po ustawieniu `ADMIN_USER` i `ADMIN_PASS` po stronie serwera.</div>
          </form>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-xl border border-zinc-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Odświeżenie planu</div>
                <Button
                  onClick={onRefresh}
                  disabled={refreshing}
                  variant="outline"
                  className={`inline-flex items-center gap-2 ${refreshing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  title="Uruchom scraper i uaktualnij plik timetable_data.json"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Odświeżanie…' : 'Odśwież teraz'}
                </Button>
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
                    <Input
                      className="text-xs px-2 py-1 !w-48"
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
                        <div key={key} className="p-2 border-b border-zinc-800 last:border-b-0">
                          <div className="text-xs text-zinc-400 truncate" title={key}>{key}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              className="text-sm px-2 py-1 !w-48 shrink-0"
                              placeholder="Wyświetlana nazwa"
                              value={overrides.subjectOverrides[key] ?? ''}
                              onChange={(e) => setOverrides((s) => ({ ...s, subjectOverrides: { ...s.subjectOverrides, [key]: e.target.value } }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOverrides((s) => {
                                const copy = { ...s.subjectOverrides };
                                delete copy[key];
                                return { ...s, subjectOverrides: copy };
                              })}
                            >Wyczyść</Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm">Nauczyciele (skrót → pełna nazwa)</div>
                    <Input
                      className="text-xs px-2 py-1 !w-48"
                      placeholder="Szukaj nauczyciela"
                      value={teacherFilter}
                      onChange={(e) => setTeacherFilter(e.target.value)}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded-md">
                    {teacherEntries
                      .filter((entry) => {
                        const q = teacherFilter.toLowerCase().trim()
                        if (!q) return true
                        return entry.shortName.toLowerCase().includes(q)
                          || entry.originalName.toLowerCase().includes(q)
                          || String(entry.id || '').toLowerCase().includes(q)
                      })
                      .slice(0, 300)
                      .sort((a, b) => a.shortName.localeCompare(b.shortName, 'pl', { sensitivity: 'base' }))
                      .map((entry) => (
                        <div key={`${entry.id ?? 'override'}:${entry.shortName}`} className="p-2 border-b border-zinc-800 last:border-b-0">
                          <div className="min-w-0">
                            <div className="text-xs text-zinc-300 truncate font-medium" title={entry.shortName}>
                              {entry.shortName}
                            </div>
                            {entry.originalName !== entry.shortName && (
                              <div className="text-[11px] text-zinc-500 truncate" title={entry.originalName}>
                                Oryginał: {entry.originalName}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              className="text-sm px-2 py-1 !w-48 shrink-0"
                              placeholder="Pełna nazwa"
                              value={overrides.teacherNameOverrides[entry.shortName] ?? ''}
                              onChange={(e) => setOverrides((s) => ({ ...s, teacherNameOverrides: { ...s.teacherNameOverrides, [entry.shortName]: e.target.value } }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOverrides((s) => {
                                const copy = { ...s.teacherNameOverrides };
                                delete copy[entry.shortName];
                                return { ...s, teacherNameOverrides: copy };
                              })}
                            >Wyczyść</Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => { void onSaveOverrides() }} variant="success">Zapisz nadpisania</Button>
                <Button onClick={() => { setOverrides({ subjectOverrides: {}, teacherNameOverrides: {} }); }} variant="outline">Wyczyść wszystko</Button>
              </div>
            </div>
          </div>
        )}
    </Modal>
  )
}

export default AdminPanel
