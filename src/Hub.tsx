import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, FileText, ListChecks, School } from "lucide-react";
import { motion } from "framer-motion";
import NewsSection from "./features/news/NewsSection";
import { useAuth } from "./features/auth/useAuth";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readErrorMessage } from "@/lib/http";
import { apiFetch } from "@/lib/apiClient";

type HubProps = {
  navigate: (to: string) => void;
};

type HubBackgroundVariant = {
  width: number
  height: number | null
  url: string
}

type HubBackgroundEntry = {
  id: string
  kind: string
  label: string
  sourceName: string | null
  locked: boolean
  createdAt: string
  lastSelectedAt: string
  previewUrl: string | null
  webpSrcSet: string
  jpegSrcSet: string
  fallbackUrl: string
  variants: {
    webp: HubBackgroundVariant[]
    jpeg: HubBackgroundVariant[]
  }
  isActive: boolean
}

type HubBackgroundState = {
  historyLimit: number
  activeId: string
  active: HubBackgroundEntry | null
  entries: HubBackgroundEntry[]
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return 'brak danych'
  return parsed.toLocaleString()
}

export default function Hub({ navigate }: HubProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "" });
  const [singleApiKey, setSingleApiKey] = useState<string | null>(null);
  const [apiKeyMeta, setApiKeyMeta] = useState<{ hasKey: boolean; preview: string | null; createdAt: number | null; lastUsedAt: number | null; format: string | null; requiresRotation?: boolean } | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [newsReloadSignal, setNewsReloadSignal] = useState(0);
  const [articlesJob, setArticlesJob] = useState<{ id: string; status: string } | null>(null);
  const [articlesBusy, setArticlesBusy] = useState(false);
  const [ttBusy, setTtBusy] = useState(false);
  const [backups, setBackups] = useState<{ filename: string; size: number; mtime: string }[] | null>(null);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupsVisible, setBackupsVisible] = useState(false);
  const [hubBackgrounds, setHubBackgrounds] = useState<HubBackgroundState | null>(null);
  const [hubBackgroundError, setHubBackgroundError] = useState<string | null>(null);
  const [hubBackgroundFile, setHubBackgroundFile] = useState<File | null>(null);
  const [hubBackgroundInputKey, setHubBackgroundInputKey] = useState(0);
  const [hubBackgroundAction, setHubBackgroundAction] = useState<string | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const { isAuth, me, login, register, logout } = useAuth()
  const toast = useToast()
  const isAdmin = me?.id === 'admin'
  const defaultHeroWebpSrcSet = '/hub-bg-right-640.webp 640w, /hub-bg-right-1024.webp 1024w, /hub-bg-right-1600.webp 1600w, /hub-bg-right-1920.webp 1920w, /hub-bg-right-2560.webp 2560w'
  const defaultHeroJpgSrcSet = '/hub-bg-right-640.jpg 640w, /hub-bg-right-1024.jpg 1024w, /hub-bg-right-1600.jpg 1600w, /hub-bg-right-1920.jpg 1920w, /hub-bg-right-2560.jpg 2560w'
  const heroSizes = '100vw'
  const activeHubBackground = hubBackgrounds?.active
  const heroWebpSrcSet = activeHubBackground?.webpSrcSet || defaultHeroWebpSrcSet
  const heroJpgSrcSet = activeHubBackground?.jpegSrcSet || defaultHeroJpgSrcSet
  const heroFallbackSrc = activeHubBackground?.fallbackUrl || '/hub-bg-right-1024.jpg'

  const getPreferredPlanPath = () => {
    try {
      const saved = (localStorage.getItem('timetable.lastPlanId') || '').trim()
      if (!saved) return '/plan'
      const token = (/^[nos]/i.test(saved) && saved.length > 1) ? saved.slice(1) : saved
      if (!token) return '/plan'
      return `/plan/${encodeURIComponent(token)}`
    } catch {
      return '/plan'
    }
  }

  const closeProfile = () => {
    setProfileOpen(false)
    setApiKeyVisible(false)
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(loginForm.username, loginForm.password)
    if (!result.ok) {
      toast.error(result.error || 'Logowanie nieudane')
      return
    }
    setLoginForm({ username: '', password: '' })
    await loadSingleKey()
  };
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await register(registerForm.username, registerForm.password)
    if (!result.ok) {
      toast.error(result.error || 'Rejestracja nieudana')
      return
    }
    setRegisterForm({ username: '', password: '' })
    await loadSingleKey()
  };
  const handleLogout = async () => {
    await logout()
    setSingleApiKey(null)
    setApiKeyMeta(null)
    setApiKeyVisible(false)
  };
  const loadSingleKey = async () => {
    try {
      const res = await apiFetch('/v1/apikey');
      const j = await res.json();
      if (j?.ok && j?.data) {
        setApiKeyMeta(j.data)
        setSingleApiKey(null)
        setApiKeyVisible(false)
      }
    } catch { /* ignore */ }
  };
  const regenSingleKey = async () => {
    try {
      const res = await apiFetch('/v1/apikey/regenerate', { method: 'POST' });
      if (!res.ok) {
        toast.error(await readErrorMessage(res, 'Nie udało się zregenerować klucza API'))
        return
      }
      const j = await res.json();
      if (j?.ok && j?.data?.apiKey) {
        setSingleApiKey(j.data.apiKey);
        setApiKeyMeta((prev) => ({
          hasKey: true,
          preview: j.data.preview || prev?.preview || null,
          createdAt: typeof j.data.createdAt === 'number' ? j.data.createdAt : prev?.createdAt || null,
          lastUsedAt: prev?.lastUsedAt || null,
          format: j.data.format || 'structured',
          requiresRotation: false,
        }))
        setApiKeyVisible(false)
        toast.success('Zregenerowano klucz API.')
      }
    } catch {
      toast.error('Nie udało się zregenerować klucza API')
    }
  };

  const refreshTimetable = async () => {
    try {
      setTtBusy(true);
      const res = await apiFetch('/v1/refresh', { method: 'POST' });
      if (!res.ok) { toast.error(await readErrorMessage(res, 'Nie udało się uruchomić odświeżania')); return; }
      toast.success('Plan został odświeżony.');
    } finally {
      setTtBusy(false);
    }
  };

  const loadBackups = async () => {
    try {
      setBackupsError(null)
      const res = await apiFetch('/v1/timetable/backups');
      if (!res.ok) {
        setBackups([])
        setBackupsError(await readErrorMessage(res, 'Nie udało się pobrać kopii zapasowych.'))
        return
      }
      const j = await res.json();
      if (!j?.ok) {
        const detail = typeof j?.detail === 'string' ? j.detail : 'Nie udało się pobrać kopii zapasowych.'
        setBackups([])
        setBackupsError(detail)
        return
      }
      if (!Array.isArray(j?.data)) {
        setBackups([])
        setBackupsError('Serwer zwrócił nieprawidłową odpowiedź podczas pobierania kopii zapasowych.')
        return
      }
      setBackups(j.data)
    } catch {
      setBackups([])
      setBackupsError('Nie udało się pobrać kopii zapasowych. Sprawdź połączenie i spróbuj ponownie.')
    }
  };

  const toggleBackups = async () => {
    if (backupsVisible) {
      setBackupsVisible(false)
      return
    }

    setBackupsVisible(true)
    if (backups === null || backupsError) {
      await loadBackups()
    }
  }

  const restoreBackup = async (filename: string) => {
    try {
      const res = await apiFetch('/v1/timetable/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
      if (!res.ok) { toast.error(await readErrorMessage(res, 'Nie udało się przywrócić kopii')); return; }
      toast.success('Przywrócono wybrany plan.');
    } catch {
      toast.error('Nie udało się przywrócić kopii')
    }
  };

  const startArticlesScrape = async () => {
    const schedulePoll = (fn: () => void, delayMs: number) => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(fn, delayMs);
    };
    try {
      setArticlesBusy(true);
      const res = await apiFetch('/v1/jobs/articles-scrape', { method: 'POST' });
      if (!res.ok) { toast.error(await readErrorMessage(res, 'Nie udało się uruchomić zadania')); setArticlesBusy(false); return; }
      const j = await res.json();
      const jobId = j?.data?.jobId;
      if (!jobId) { setArticlesBusy(false); return; }
      setArticlesJob({ id: jobId, status: 'queued' });
      // Poll co 2s do zakończenia
      const poll = async () => {
        if (!mountedRef.current) return;
        try {
          const st = await apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}`);
          const jj = await st.json();
          const jobData = jj?.data;
          if (!mountedRef.current) return;
          setArticlesJob({ id: jobId, status: jobData?.status || 'unknown' });
          if (jobData?.status === 'succeeded' || jobData?.status === 'failed' || jobData?.status === 'timeout') {
            setArticlesBusy(false);
            if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
            if (jobData?.status === 'succeeded') {
              setNewsReloadSignal((v) => v + 1);
              toast.success('Aktualności zostały odświeżone.')
            } else if (jobData?.status === 'timeout') {
              toast.error(jobData?.error ? String(jobData.error) : 'Zadanie przekroczyło limit czasu.')
            } else if (jobData?.error) {
              toast.error(String(jobData.error))
            }
            return;
          }
          schedulePoll(poll, 2000);
        } catch {
          schedulePoll(poll, 2000);
        }
      };
      schedulePoll(poll, 1500);
    } catch {
      setArticlesBusy(false);
      toast.error('Nie udało się uruchomić zadania')
    }
  };

  const loadHubBackgrounds = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      const res = await apiFetch('/v1/hub-backgrounds')
      if (!res.ok) {
        const detail = await readErrorMessage(res, 'Nie udało się pobrać listy teł strony głównej.')
        setHubBackgroundError(detail)
        if (!silent && isAdmin) toast.error(detail)
        return null
      }
      const j = await res.json()
      if (!j?.ok || !j?.data) {
        const detail = typeof j?.detail === 'string'
          ? j.detail
          : 'Serwer zwrócił nieprawidłową odpowiedź dla teł strony głównej.'
        setHubBackgroundError(detail)
        if (!silent && isAdmin) toast.error(detail)
        return null
      }
      setHubBackgrounds(j.data)
      setHubBackgroundError(null)
      return j.data as HubBackgroundState
    } catch {
      const detail = 'Nie udało się pobrać listy teł strony głównej.'
      setHubBackgroundError(detail)
      if (!silent && isAdmin) toast.error(detail)
      return null
    }
  }, [isAdmin, toast])

  const uploadHubBackground = async () => {
    if (!hubBackgroundFile) {
      toast.error('Najpierw wybierz plik obrazu.')
      return
    }
    try {
      setHubBackgroundAction('upload')
      setHubBackgroundError(null)
      const formData = new FormData()
      formData.append('image', hubBackgroundFile)
      const res = await apiFetch('/v1/hub-backgrounds', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        toast.error(await readErrorMessage(res, 'Nie udało się wgrać nowego tła.'))
        return
      }
      const j = await res.json()
      if (!j?.ok || !j?.data) {
        toast.error('Serwer nie zwrócił poprawnego stanu po aktualizacji tła.')
        return
      }
      setHubBackgrounds(j.data)
      setHubBackgroundError(null)
      setHubBackgroundFile(null)
      setHubBackgroundInputKey((value) => value + 1)
      toast.success('Nowe tło zostało przygotowane i ustawione jako aktywne.')
    } catch {
      toast.error('Nie udało się wgrać nowego tła.')
    } finally {
      setHubBackgroundAction(null)
    }
  }

  const activateHubBackground = async (entryId: string) => {
    try {
      setHubBackgroundAction(`activate:${entryId}`)
      const res = await apiFetch(`/v1/hub-backgrounds/${encodeURIComponent(entryId)}/activate`, {
        method: 'POST',
      })
      if (!res.ok) {
        toast.error(await readErrorMessage(res, 'Nie udało się przywrócić wybranego tła.'))
        return
      }
      const j = await res.json()
      if (!j?.ok || !j?.data) {
        toast.error('Serwer nie zwrócił poprawnego stanu po przywróceniu tła.')
        return
      }
      setHubBackgrounds(j.data)
      setHubBackgroundError(null)
      toast.success('Wybrane tło zostało ustawione jako aktywne.')
    } catch {
      toast.error('Nie udało się przywrócić wybranego tła.')
    } finally {
      setHubBackgroundAction(null)
    }
  }

  const setHubBackgroundLock = async (entryId: string, locked: boolean) => {
    try {
      setHubBackgroundAction(`lock:${entryId}`)
      const res = await apiFetch(`/v1/hub-backgrounds/${encodeURIComponent(entryId)}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked }),
      })
      if (!res.ok) {
        toast.error(await readErrorMessage(res, 'Nie udało się zmienić blokady tła.'))
        return
      }
      const j = await res.json()
      if (!j?.ok || !j?.data) {
        toast.error('Serwer nie zwrócił poprawnego stanu po zmianie blokady tła.')
        return
      }
      setHubBackgrounds(j.data)
      setHubBackgroundError(null)
      toast.success(locked ? 'Tło zostało zablokowane w historii.' : 'Tło zostało odblokowane.')
    } catch {
      toast.error('Nie udało się zmienić blokady tła.')
    } finally {
      setHubBackgroundAction(null)
    }
  }

  const deleteHubBackground = async (entryId: string) => {
    try {
      setHubBackgroundAction(`delete:${entryId}`)
      const res = await apiFetch(`/v1/hub-backgrounds/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast.error(await readErrorMessage(res, 'Nie udało się usunąć wybranego tła.'))
        return
      }
      const j = await res.json()
      if (!j?.ok || !j?.data) {
        toast.error('Serwer nie zwrócił poprawnego stanu po usunięciu tła.')
        return
      }
      setHubBackgrounds(j.data)
      setHubBackgroundError(null)
      toast.success('Tło zostało usunięte z zapisanych teł.')
    } catch {
      toast.error('Nie udało się usunąć wybranego tła.')
    } finally {
      setHubBackgroundAction(null)
    }
  }

  useEffect(() => {
    void loadHubBackgrounds({ silent: true })
  }, [loadHubBackgrounds])

  const displayedApiKey = useMemo(() => {
    if (singleApiKey) {
      if (apiKeyVisible) return singleApiKey
      const head = singleApiKey.slice(0, 6)
      const tail = singleApiKey.slice(-4)
      return `${head}••••••••${tail}`
    }
    if (apiKeyMeta?.preview) return apiKeyMeta.preview
    if (apiKeyMeta?.requiresRotation) return 'Klucz wymaga regeneracji'
    return apiKeyMeta?.hasKey ? 'Klucz istnieje (ukryty)' : 'Brak klucza API'
  }, [apiKeyVisible, apiKeyMeta, singleApiKey])

  return (
    <div className="relative min-h-[100svh] w-full">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-screen overflow-hidden"
        style={{ height: "100lvh" }}
      >
        {/* Background image (viewport-fixed to avoid jump on content pagination/scroll) */}
        <picture>
          <source srcSet={heroWebpSrcSet} sizes={heroSizes} type="image/webp" />
          <source srcSet={heroJpgSrcSet} sizes={heroSizes} type="image/jpeg" />
          <img
            src={heroFallbackSrc}
            srcSet={heroJpgSrcSet}
            sizes={heroSizes}
            decoding="async"
            loading="eager"
            fetchPriority="high"
            alt=""
            className="h-full w-full object-cover object-top sm:object-center"
          />
        </picture>
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/50" />
        {/* Subtle grid overlay to reinforce tech theme */}
        <div className="hidden sm:block absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
      </div>

      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/70 border-b border-zinc-800">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-2 flex items-center gap-3 text-white">
          <School className="w-5 h-5 text-zinc-200" />
          <div className="text-sm font-semibold text-zinc-100">ZSE Zduńska Wola</div>
          <div className="ml-auto">
            <Button
              onClick={() => { setProfileOpen(true); setApiKeyVisible(false); if (isAuth) loadSingleKey(); }}
              variant="outline"
              className="border-white/30 bg-black/40 text-white hover:bg-black/60 backdrop-blur"
            >
              {isAuth ? (me?.username || 'Profil') : 'Zaloguj / Rejestracja'}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-48px)] max-w-6xl flex-col items-center px-4 py-8 sm:py-10 text-white">

        <main className="w-full">
          {/* Symmetrical 2x2 grid on desktop, stacked on mobile */}
          <div className="mx-auto max-w-3xl grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
            <HubTile
              title="Plan lekcji"
              description="Przeglądaj interaktywny plan dla klas, nauczycieli i sal."
              icon={<CalendarDays className="h-6 w-6" />}
              onClick={() => navigate(getPreferredPlanPath())}
            />
            <HubTile
              title="Frekwencja"
              description="Zarządzaj obecnościami i planami zajęć."
              icon={<ListChecks className="h-6 w-6" />}
              onClick={() => navigate("/frekwencja")}
            />
            <HubTile
              title="Harmonogram"
              description="Wydarzenia, rady, terminy."
              icon={<ListChecks className="h-6 w-6" />}
              onClick={() => navigate("/harmonogram")}
            />
            <HubTile
              title="Statut szkoły"
              description="Przejrzyj statut szkoły."
              icon={<FileText className="h-6 w-6" />}
              onClick={() => navigate("/statut")}
            />
          </div>

          <div className="mt-12 sm:mt-16">
            <NewsSection reloadSignal={newsReloadSignal} />
          </div>
        </main>

        <footer className="mt-auto w-full pt-10 text-center text-xs text-zinc-200/90">
          © {new Date().getFullYear()} ZSE Zduńska Wola
        </footer>
      </div>

      {/* Profile modal */}
      {profileOpen && (
        <Modal
          onClose={closeProfile}
          panelClassName="w-full max-w-3xl max-h-[calc(100svh-2rem)] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-xl"
        >
            <div className="flex max-h-[calc(100svh-2rem)] flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-700 px-4 py-4">
              <div className="text-lg font-semibold">{isAuth ? 'Mój profil' : 'Zaloguj się lub zarejestruj'}</div>
              <Button onClick={closeProfile} variant="outline" size="sm">Zamknij</Button>
            </div>
            <div className="overflow-y-auto px-4 py-4">
            {!isAuth ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <form onSubmit={handleLogin} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Logowanie</div>
                  <Input className="mb-2" placeholder="Nazwa użytkownika"
                         value={loginForm.username} onChange={e=>setLoginForm(s=>({ ...s, username: e.target.value }))} />
                  <Input type="password" className="mb-2" placeholder="Hasło"
                         value={loginForm.password} onChange={e=>setLoginForm(s=>({ ...s, password: e.target.value }))} />
                  <Button variant="success" type="submit">Zaloguj</Button>
                </form>
                <form onSubmit={handleRegister} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Rejestracja</div>
                  <Input className="mb-2" placeholder="Nazwa użytkownika"
                         value={registerForm.username} onChange={e=>setRegisterForm(s=>({ ...s, username: e.target.value }))} />
                  <Input type="password" className="mb-2" placeholder="Hasło (min. 6)"
                         value={registerForm.password} onChange={e=>setRegisterForm(s=>({ ...s, password: e.target.value }))} />
                  <Button variant="primary" type="submit">Zarejestruj</Button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div>
                    <div className="text-sm">Zalogowano jako</div>
                    <div className="text-lg font-semibold">{me?.username}</div>
                  </div>
                  <Button onClick={handleLogout} variant="danger">Wyloguj</Button>
                </div>
                <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Klucz API (test)</div>
                  <div className="text-xs opacity-80 mb-2">
                    Pełny klucz można zobaczyć tylko bezpośrednio po regeneracji. Przechowuj go bezpiecznie.
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={displayedApiKey} className="flex-1 font-mono" />
                    <Button
                      onClick={() => {
                        if (apiKeyVisible) {
                          setApiKeyVisible(false)
                          return
                        }
                        if (!singleApiKey) {
                          toast.error('Pełny klucz jest dostępny tylko po regeneracji.')
                          return
                        }
                        setApiKeyVisible(true)
                      }}
                      variant="outline"
                    >
                      {apiKeyVisible ? 'Ukryj' : 'Pokaż'}
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!singleApiKey || !apiKeyVisible) return
                        try {
                          await navigator.clipboard.writeText(singleApiKey)
                          toast.success('Skopiowano klucz API do schowka.')
                        } catch {
                          toast.error('Nie udało się skopiować klucza API.')
                        }
                      }}
                      disabled={!singleApiKey || !apiKeyVisible}
                      variant="outline"
                    >
                      Kopiuj
                    </Button>
                    <Button onClick={regenSingleKey} variant="warning">Regeneruj</Button>
                  </div>
                  {apiKeyMeta?.createdAt ? (
                    <div className="mt-2 text-[11px] opacity-70">
                      Utworzono: {new Date(apiKeyMeta.createdAt).toLocaleString()}
                    </div>
                  ) : null}
                  {apiKeyMeta?.requiresRotation ? (
                    <div className="mt-1 text-[11px] text-amber-300">
                      Wykryto stary format klucza. Zregeneruj klucz, aby dalej używać API.
                    </div>
                  ) : null}
                </section>
                {isAdmin ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-sm font-medium mb-2">Aktualności</div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={startArticlesScrape}
                        disabled={articlesBusy}
                        variant={articlesBusy ? 'neutral' : 'success'}
                      >
                        {articlesBusy ? 'Aktualizuję…' : 'Aktualizuj artykuły'}
                      </Button>
                      {articlesJob ? (
                        <span className="text-xs opacity-80">Status: {articlesJob.status}</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] mt-2 opacity-70">Po zakończeniu zadania nowe artykuły pojawią się w sekcji aktualności.</div>
                  </section>
                ) : null}
                {isAdmin ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-sm font-medium mb-2">Plan lekcji</div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button onClick={refreshTimetable} disabled={ttBusy} variant={ttBusy ? 'neutral' : 'primary'}>{ttBusy ? 'Odświeżam…' : 'Odśwież plan teraz'}</Button>
                      <Button onClick={() => { void toggleBackups() }} variant="outline">
                        {backupsVisible ? 'Ukryj kopie zapasowe' : 'Pokaż kopie zapasowe'}
                      </Button>
                    </div>
                    {backupsVisible && backupsError ? (
                      <div className="text-xs text-rose-300 mb-2">{backupsError}</div>
                    ) : null}
                    {backupsVisible && Array.isArray(backups) ? (
                      backups.length === 0 ? (
                        <div className="text-xs text-zinc-400">Brak kopii zapasowych.</div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto text-xs">
                          {backups.map((b) => (
                            <div key={b.filename} className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-b-0">
                              <div className="truncate pr-2">{b.filename}</div>
                              <div className="flex items-center gap-2">
                                <span className="opacity-70">{new Date(b.mtime).toLocaleString()}</span>
                                <Button onClick={() => restoreBackup(b.filename)} variant="success" size="sm">Przywróć</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : null}
                    <div className="text-[11px] mt-2 opacity-70">Przechowujemy 5 ostatnich różnych wersji planu.</div>
                  </section>
                ) : null}
                {isAdmin ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-sm font-medium mb-2">Tło strony głównej</div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          key={hubBackgroundInputKey}
                          type="file"
                          accept="image/*"
                          onChange={(e) => setHubBackgroundFile(e.target.files?.[0] ?? null)}
                          className="file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:text-white"
                        />
                        <Button
                          onClick={uploadHubBackground}
                          disabled={!hubBackgroundFile || hubBackgroundAction === 'upload'}
                          variant={hubBackgroundAction === 'upload' ? 'neutral' : 'success'}
                        >
                          {hubBackgroundAction === 'upload' ? 'Przetwarzam…' : 'Wgraj nowe tło'}
                        </Button>
                        <Button
                          onClick={() => { void loadHubBackgrounds() }}
                          disabled={!!hubBackgroundAction}
                          variant="outline"
                        >
                          Odśwież listę
                        </Button>
                      </div>
                      {hubBackgroundFile ? (
                        <div className="mt-2 text-[11px] opacity-70">
                          Wybrano plik: {hubBackgroundFile.name}
                        </div>
                      ) : null}
                    </div>
                    {hubBackgroundError ? (
                      <div className="mt-3 text-xs text-rose-300">{hubBackgroundError}</div>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {(hubBackgrounds?.entries || []).map((entry) => (
                        <div
                          key={entry.id}
                          className={`rounded-lg border p-2 ${entry.isActive ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/40'}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="h-24 w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 sm:w-40">
                              {entry.previewUrl ? (
                                <img src={entry.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-500">Brak podglądu</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium">{entry.label}</div>
                                {entry.isActive ? (
                                  <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">Aktywne</span>
                                ) : null}
                                {entry.locked ? (
                                  <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">Lock</span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] opacity-70">
                                Źródło: {entry.sourceName || 'wbudowane tło'}
                              </div>
                              <div className="text-[11px] opacity-70">
                                Dodano: {formatDateTime(entry.createdAt)}
                              </div>
                              <div className="text-[11px] opacity-70">
                                Ostatnio wybrane: {formatDateTime(entry.lastSelectedAt)}
                              </div>
                              <div className="text-[11px] opacity-70">
                                Warianty WebP: {entry.variants.webp.map((variant) => `${variant.width}px`).join(', ') || 'brak'}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:w-44 sm:flex-col sm:items-stretch">
                              <Button
                                onClick={() => { void activateHubBackground(entry.id) }}
                                disabled={entry.isActive || !!hubBackgroundAction}
                                variant={entry.isActive ? 'neutral' : 'success'}
                                size="sm"
                              >
                                {entry.isActive ? 'Aktywne teraz' : 'Przywróć'}
                              </Button>
                              <Button
                                onClick={() => { void setHubBackgroundLock(entry.id, !entry.locked) }}
                                disabled={!!hubBackgroundAction}
                                variant={entry.locked ? 'warning' : 'outline'}
                                size="sm"
                              >
                                {entry.locked ? 'Unlock' : 'Lock'}
                              </Button>
                              <Button
                                onClick={() => { void deleteHubBackground(entry.id) }}
                                disabled={!!hubBackgroundAction || entry.locked || (hubBackgrounds?.entries.length || 0) <= 1}
                                variant="danger"
                                size="sm"
                                title={entry.locked ? 'Najpierw odblokuj tło, aby je usunąć.' : undefined}
                              >
                                Usuń
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {hubBackgrounds && hubBackgrounds.entries.length === 0 ? (
                        <div className="text-xs text-zinc-400">Brak zapisanych teł.</div>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
            </div>
            </div>
        </Modal>
      )}
    </div>
  );
}

function HubTile({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 220, damping: 20, mass: 0.6 }}
      className="group relative flex h-[112px] sm:h-[120px] flex-col justify-between overflow-hidden rounded-2xl bg-white/10 p-3.5 sm:p-4 text-left text-white shadow-xl backdrop-blur-md"
    >
      {/* gradient border glow */}
      <span className="pointer-events-none absolute inset-px rounded-2xl bg-gradient-to-br from-cyan-300/10 via-emerald-300/10 to-violet-300/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
      {/* sheen */}
      <span className="pointer-events-none absolute -inset-10 translate-y-10 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white/20 text-white shadow-md">
          {icon}
        </span>
        <span className="text-base sm:text-lg font-semibold drop-shadow-sm">{title}</span>
      </div>

      <div className="relative">
        <p className="text-[11px] sm:text-xs text-zinc-100/95 leading-snug max-w-sm">{description}</p>
        <span className="mt-1 inline-block text-xs text-white/90 underline-offset-2 group-hover:underline">Przejdź</span>
      </div>
    </motion.button>
  );
}
