import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
            <div className="text-xs text-zinc-500">Przykładowe konto: admin / admin123</div>
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
                      className="text-xs px-2 py-1 w-48"
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
                          <Input
                            className="text-sm px-2 py-1 w-48"
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
                      ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm">Nauczyciele (skrót → pełna nazwa)</div>
                    <Input
                      className="text-xs px-2 py-1 w-48"
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
                          <Input
                            className="text-sm px-2 py-1 w-48"
                            placeholder="Pełna nazwa"
                            value={overrides.teacherNameOverrides[shortName] ?? ''}
                            onChange={(e) => setOverrides((s) => ({ ...s, teacherNameOverrides: { ...s.teacherNameOverrides, [shortName]: e.target.value } }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOverrides((s) => {
                              const copy = { ...s.teacherNameOverrides };
                              delete copy[shortName];
                              return { ...s, teacherNameOverrides: copy };
                            })}
                          >Wyczyść</Button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => (document.getElementById('save-overrides') as HTMLButtonElement)?.click()} variant="success">Zapisz nadpisania</Button>
                <Button onClick={() => { setOverrides({ subjectOverrides: {}, teacherNameOverrides: {} }); }} variant="outline">Wyczyść wszystko</Button>
              </div>
            </div>
          </div>
        )}
    </Modal>
  )
}

export default AdminPanel
