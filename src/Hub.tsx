import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, FileText, ListChecks, School, ChevronRight, LogOut, KeyRound, Settings, FolderOpen, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import NewsSection from "./features/news/NewsSection";
import { useAuth } from "./features/auth/useAuth";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readErrorMessage } from "@/lib/http";
import type { Article } from "@/features/news/useArticles";
import { RightPanelShell, ArticlePanelContent, CloseBtn } from "@/features/hub/RightPanel";
import { apiFetch } from "@/lib/apiClient";

type HubProps = {
  navigate: (to: string) => void;
};

type HubAppId = 'timetable' | 'attendance' | 'schedule' | 'statute' | 'documents' | 'edziennik'
type HubAppVisibility = Record<HubAppId, boolean>

const DEFAULT_HUB_APP_VISIBILITY: HubAppVisibility = {
  timetable: true,
  attendance: true,
  schedule: true,
  statute: true,
  documents: true,
  edziennik: true,
}

type HubAppOption = {
  key: HubAppId
  title: string
  navDescription: string
  tileDescription: string
  Icon: React.ComponentType<{ className?: string }>
  externalUrl?: string
}

const HUB_APP_OPTIONS: HubAppOption[] = [
  {
    key: 'timetable',
    title: 'Plan lekcji',
    navDescription: 'Klasy, nauczyciele i sale',
    tileDescription: 'Przeglądaj interaktywny plan dla klas, nauczycieli i sal.',
    Icon: CalendarDays,
  },
  {
    key: 'attendance',
    title: 'Frekwencja',
    navDescription: 'Zarządzaj obecnościami i zajęciami',
    tileDescription: 'Zarządzaj obecnościami i planami zajęć.',
    Icon: ListChecks,
  },
  {
    key: 'schedule',
    title: 'Harmonogram',
    navDescription: 'Rady, terminy, zebrania',
    tileDescription: 'Wydarzenia, rady, terminy.',
    Icon: ListChecks,
  },
  {
    key: 'statute',
    title: 'Statut szkoły',
    navDescription: 'Przejrzyj regulamin',
    tileDescription: 'Przejrzyj statut szkoły.',
    Icon: FileText,
  },
  {
    key: 'documents',
    title: 'Dokumenty',
    navDescription: 'Regulaminy i plany nauczania',
    tileDescription: 'Przeglądaj dokumenty szkolne i ramowe plany nauczania.',
    Icon: FolderOpen,
  },
  {
    key: 'edziennik',
    title: 'E-dziennik',
    navDescription: 'Dziennik elektroniczny VULCAN',
    tileDescription: 'Otwórz dziennik elektroniczny UONET+.',
    Icon: BookOpen,
    externalUrl: 'https://uonetplus.vulcan.net.pl/powiatzdunskowolski/',
  },
]

const SPECIAL_HUB_BACKGROUND_ID = 'special-ela-clock'
const SPECIAL_CLOCK_TIME_ZONE = 'Europe/Warsaw'
const SPECIAL_CLOCK_SOURCE_WIDTH = 5468
const SPECIAL_CLOCK_SOURCE_HEIGHT = 3136
const SPECIAL_CLOCK_BOX = {
  x: 2215,
  y: 2121,
  width: 460,
  height: 109,
}

type HubBackgroundVariant = {
  width: number
  height: number | null
  url: string
}

type HubBackgroundEntry = {
  id: string
  kind: 'generated' | 'special'
  label: string
  sourceName: string | null
  locked: boolean
  protected: boolean
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseHubAppVisibility(value: unknown): HubAppVisibility {
  if (!isObjectRecord(value)) return { ...DEFAULT_HUB_APP_VISIBILITY }
  return {
    timetable: typeof value.timetable === 'boolean' ? value.timetable : true,
    attendance: typeof value.attendance === 'boolean' ? value.attendance : true,
    schedule: typeof value.schedule === 'boolean' ? value.schedule : true,
    statute: typeof value.statute === 'boolean' ? value.statute : true,
    documents: typeof value.documents === 'boolean' ? value.documents : true,
    edziennik: typeof value.edziennik === 'boolean' ? value.edziennik : true,
  }
}

function parseHubVisibilityPayload(value: unknown): HubAppVisibility | null {
  if (!isObjectRecord(value)) return null
  return parseHubAppVisibility(value)
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return 'brak danych'
  return parsed.toLocaleString()
}

function appendVersionParam(url: string, version: string | null) {
  if (!version) return url
  return url.includes('?') ? `${url}&v=${version}` : `${url}?v=${version}`
}

function appendVersionToSrcSet(srcSet: string, version: string | null) {
  if (!version) return srcSet
  return srcSet
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const splitIndex = item.lastIndexOf(' ')
      if (splitIndex <= 0) return appendVersionParam(item, version)
      const url = item.slice(0, splitIndex)
      const descriptor = item.slice(splitIndex + 1)
      return `${appendVersionParam(url, version)} ${descriptor}`
    })
    .join(', ')
}

function readActiveSpecialBackgroundId() {
  if (typeof window === 'undefined') return null
  const meta = document.querySelector('meta[name="hub-active-special-background"]')
  const value = meta?.getAttribute('content')?.trim()
  return value ? value : null
}

function readActiveBackgroundVersion() {
  if (typeof window === 'undefined') return null
  const meta = document.querySelector('meta[name="hub-active-background-version"]')
  const value = meta?.getAttribute('content')?.trim()
  return value ? value : null
}

function formatSpecialClockTime(date: Date) {
  return new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: SPECIAL_CLOCK_TIME_ZONE,
  }).format(date)
}

function getSpecialClockRect(viewportWidth: number, viewportHeight: number) {
  if (!viewportWidth || !viewportHeight) return null
  const scale = Math.max(
    viewportWidth / SPECIAL_CLOCK_SOURCE_WIDTH,
    viewportHeight / SPECIAL_CLOCK_SOURCE_HEIGHT
  )
  const renderedWidth = SPECIAL_CLOCK_SOURCE_WIDTH * scale
  const renderedHeight = SPECIAL_CLOCK_SOURCE_HEIGHT * scale
  const offsetX = (viewportWidth - renderedWidth) / 2
  const offsetY = (viewportHeight - renderedHeight) / 2
  return {
    left: offsetX + SPECIAL_CLOCK_BOX.x * scale,
    top: offsetY + SPECIAL_CLOCK_BOX.y * scale,
    width: SPECIAL_CLOCK_BOX.width * scale,
    height: SPECIAL_CLOCK_BOX.height * scale,
  }
}

const CLOCK_LED_COLOR = '#7da875'

function SpecialHubClockOverlay({ activeSpecialBackgroundId }: { activeSpecialBackgroundId: string | null }) {
  const [now, setNow] = useState(() => formatSpecialClockTime(new Date()))
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (activeSpecialBackgroundId !== SPECIAL_HUB_BACKGROUND_ID) return
    const tick = () => setNow(formatSpecialClockTime(new Date()))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [activeSpecialBackgroundId])

  if (activeSpecialBackgroundId !== SPECIAL_HUB_BACKGROUND_ID) return null
  if (viewport.width < 1024 || !viewport.height) return null

  const rect = getSpecialClockRect(viewport.width, viewport.height)
  if (!rect) return null

  const dotGap = Math.max(2, Math.round(rect.height / 18))
  const dotRadius = dotGap * 0.38

  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        background: '#080a07',
      }}
    >
      <div
        className="absolute flex items-center justify-center"
        style={{
          inset: 0,
          fontFamily: "'Latino Gothic', sans-serif",
          fontWeight: 'bold',
          WebkitTextStroke: '0.5px currentColor',
          color: CLOCK_LED_COLOR,
          fontSize: `${Math.min(rect.height * 1.1, rect.width * 0.21)}px`,
          lineHeight: 1,
          letterSpacing: '0.04em',
          filter: 'drop-shadow(0 0 1px rgba(125,168,117,0.3))',
        }}
      >
        {now}
      </div>
      <div
        className="absolute"
        style={{
          inset: 0,
          backgroundImage: `radial-gradient(circle, transparent ${dotRadius}px, rgba(8,10,7,0.55) ${dotRadius + 0.4}px)`,
          backgroundSize: `${dotGap}px ${dotGap}px`,
          mixBlendMode: 'darken',
        }}
      />
    </div>
  )
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────

function NavItem({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="hub-nav-item hub-fade-up w-full text-left">
      <div className="hub-nav-icon">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold leading-[1.2]" style={{ color: 'var(--hub-text-primary)' }}>{title}</div>
        <div className="text-[12px] mt-0.5 leading-[1.3] truncate" style={{ color: 'var(--hub-text-secondary)' }}>{desc}</div>
      </div>
      <div className="hub-nav-arrow">
        <ChevronRight className="w-[14px] h-[14px]" />
      </div>
    </button>
  )
}

// ── Main Hub component ────────────────────────────────────────────────────────

export default function Hub({ navigate }: HubProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  // Desktop right panel (replaces modal on lg+)
  type RightPanelContent = { kind: 'article'; article: Article } | { kind: 'profile' }
  const [rightPanel, setRightPanel] = useState<RightPanelContent | null>(null);
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
  const [hubAppVisibility, setHubAppVisibility] = useState<HubAppVisibility | null>(null)
  const [hubVisibilityLoading, setHubVisibilityLoading] = useState(true)
  const [hubVisibilityAction, setHubVisibilityAction] = useState<HubAppId | null>(null)
  const [hubBackgrounds, setHubBackgrounds] = useState<HubBackgroundState | null>(null);
  const [hubBackgroundsLoading, setHubBackgroundsLoading] = useState(false);
  const [hubBackgroundError, setHubBackgroundError] = useState<string | null>(null);
  const [hubBackgroundFile, setHubBackgroundFile] = useState<File | null>(null);
  const [hubBackgroundInputKey, setHubBackgroundInputKey] = useState(0);
  const [hubBackgroundAction, setHubBackgroundAction] = useState<string | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const { isAuth, me, login, register, logout } = useAuth()
  const toast = useToast()
  const isAdmin = me?.id === 'admin'
  const [activeSpecialBackgroundId, setActiveSpecialBackgroundId] = useState(() => readActiveSpecialBackgroundId())
  const [heroRefreshToken, setHeroRefreshToken] = useState<string | null>(() => readActiveBackgroundVersion())
  const defaultHeroWebpSrcSet = '/hub-bg-right-640.webp 640w, /hub-bg-right-1024.webp 1024w, /hub-bg-right-1600.webp 1600w, /hub-bg-right-1920.webp 1920w, /hub-bg-right-2560.webp 2560w'
  const defaultHeroJpgSrcSet = '/hub-bg-right-640.jpg 640w, /hub-bg-right-1024.jpg 1024w, /hub-bg-right-1600.jpg 1600w, /hub-bg-right-1920.jpg 1920w, /hub-bg-right-2560.jpg 2560w'
  const heroSizes = '100vw'
  const heroWebpSrcSet = appendVersionToSrcSet(defaultHeroWebpSrcSet, heroRefreshToken)
  const heroJpgSrcSet = appendVersionToSrcSet(defaultHeroJpgSrcSet, heroRefreshToken)
  const heroFallbackSrc = appendVersionParam('/hub-bg-right-1024.jpg', heroRefreshToken)

  const loadHubVisibility = useCallback(async ({ silent = false, applyState = true }: { silent?: boolean; applyState?: boolean } = {}) => {
    try {
      const res = await apiFetch('/v1/hub-visibility', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Nie udało się pobrać widoczności aplikacji huba.'))
      }
      const j = await res.json()
      const parsed = parseHubVisibilityPayload(j?.data)
      if (!j?.ok || !parsed) {
        throw new Error('Serwer zwrócił nieprawidłową konfigurację widoczności aplikacji.')
      }
      if (applyState) setHubAppVisibility(parsed)
      return parsed
    } catch (error) {
      if (applyState) setHubAppVisibility({ ...DEFAULT_HUB_APP_VISIBILITY })
      if (!silent && isAdmin) {
        toast.error(error instanceof Error ? error.message : 'Nie udało się pobrać widoczności aplikacji huba.')
      }
      return { ...DEFAULT_HUB_APP_VISIBILITY }
    }
  }, [isAdmin, toast])

  const getPreferredPlanPath = useCallback(() => {
    try {
      const saved = (localStorage.getItem('timetable.lastPlanId') || '').trim()
      if (!saved) return '/plan'
      const token = (/^[nos]/i.test(saved) && saved.length > 1) ? saved.slice(1) : saved
      if (!token) return '/plan'
      return `/plan/${encodeURIComponent(token)}`
    } catch {
      return '/plan'
    }
  }, [])

  const closeProfile = () => {
    setProfileOpen(false)
    setApiKeyVisible(false)
  }

  // Desktop: open profile in right panel
  const openProfileDesktop = () => {
    setProfileOpen(false)
    setRightPanel({ kind: 'profile' })
    setApiKeyVisible(false)
    if (isAuth) loadSingleKey()
  }

  // Mobile: open profile in modal (unchanged)
  const openProfile = () => {
    setRightPanel(null)
    setProfileOpen(true)
    setApiKeyVisible(false)
    if (isAuth) loadSingleKey()
  }

  const closePanel = () => setRightPanel(null)

  const isAdminBackgroundPanelVisible = isAdmin && (profileOpen || rightPanel?.kind === 'profile')

  const syncHeroBackgroundRuntime = useCallback((state: HubBackgroundState | null | undefined) => {
    const nextSpecialId = state?.active?.kind === 'special' ? state.active.id : null
    const nextVersionToken = state?.active
      ? `${state.active.id}-${Date.parse(state.active.lastSelectedAt || state.active.createdAt || '') || Date.now()}`
      : Date.now().toString(36)
    setActiveSpecialBackgroundId(nextSpecialId)
    setHeroRefreshToken(nextVersionToken)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const desktopMedia = window.matchMedia('(min-width: 1024px)')
    const syncResponsiveOverlays = (isDesktop: boolean) => {
      if (isDesktop) {
        setProfileOpen(false)
        return
      }
      setRightPanel(null)
    }

    syncResponsiveOverlays(desktopMedia.matches)
    const handleChange = (event: MediaQueryListEvent) => syncResponsiveOverlays(event.matches)

    desktopMedia.addEventListener('change', handleChange)
    return () => desktopMedia.removeEventListener('change', handleChange)
  }, [])

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

  const updateHubAppVisibility = async (appKey: HubAppId, visible: boolean) => {
    const previousVisibility = hubAppVisibility ?? { ...DEFAULT_HUB_APP_VISIBILITY }
    const nextVisibility: HubAppVisibility = {
      ...previousVisibility,
      [appKey]: visible,
    }
    setHubAppVisibility(nextVisibility)
    setHubVisibilityAction(appKey)
    try {
      const res = await apiFetch('/v1/hub-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextVisibility),
      })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Nie udało się zapisać widoczności aplikacji.'))
      }
      setHubAppVisibility(nextVisibility)
      const label = HUB_APP_OPTIONS.find((entry) => entry.key === appKey)?.title || 'Aplikacja'
      toast.success(visible ? `Pokazano „${label}” w hubie.` : `Ukryto „${label}” w hubie.`)
    } catch (error) {
      setHubAppVisibility(previousVisibility)
      toast.error(error instanceof Error ? error.message : 'Nie udało się zapisać widoczności aplikacji.')
    } finally {
      setHubVisibilityAction(null)
    }
  }

  const loadHubBackgrounds = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    setHubBackgroundsLoading(true)
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
      setActiveSpecialBackgroundId(j.data.active?.kind === 'special' ? j.data.active.id : null)
      return j.data as HubBackgroundState
    } catch {
      const detail = 'Nie udało się pobrać listy teł strony głównej.'
      setHubBackgroundError(detail)
      if (!silent && isAdmin) toast.error(detail)
      return null
    } finally {
      setHubBackgroundsLoading(false)
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
      syncHeroBackgroundRuntime(j.data)
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
      syncHeroBackgroundRuntime(j.data)
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
      syncHeroBackgroundRuntime(j.data)
      toast.success('Tło zostało usunięte z zapisanych teł.')
    } catch {
      toast.error('Nie udało się usunąć wybranego tła.')
    } finally {
      setHubBackgroundAction(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    setHubVisibilityLoading(true)
    void loadHubVisibility({ silent: true }).finally(() => {
      if (!cancelled) setHubVisibilityLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [loadHubVisibility])

  useEffect(() => {
    if (!isAdminBackgroundPanelVisible || hubBackgrounds) return
    void loadHubBackgrounds({ silent: true })
  }, [hubBackgrounds, isAdminBackgroundPanelVisible, loadHubBackgrounds])

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

  const visibleHubApps = useMemo(() => {
    if (!hubAppVisibility) return null
    return HUB_APP_OPTIONS
      .filter((app) => hubAppVisibility[app.key])
      .map((app) => ({
        ...app,
        onClick: () => {
          if (app.externalUrl) {
            window.open(app.externalUrl, '_blank', 'noopener,noreferrer')
            return
          }
          if (app.key === 'timetable') {
            navigate(getPreferredPlanPath())
            return
          }
          if (app.key === 'attendance') {
            navigate('/frekwencja')
            return
          }
          if (app.key === 'schedule') {
            navigate('/harmonogram')
            return
          }
          if (app.key === 'documents') {
            navigate('/dokumenty')
            return
          }
          navigate('/statut')
        },
      }))
  }, [getPreferredPlanPath, hubAppVisibility, navigate])

  // ── Shared background picture ───────────────────────────────────────────────
  const heroBg = (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ height: '100lvh', zIndex: 0 }}
    >
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
      <SpecialHubClockOverlay activeSpecialBackgroundId={activeSpecialBackgroundId} />
      {/* Desktop: directional gradient darkening from left (sidebar side) */}
      <div
        className="hidden lg:block absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.36) 45%, transparent 70%)',
        }}
      />
      {/* Mobile: simple overlay */}
      <div className="lg:hidden absolute inset-0 bg-black/50" />
      {/* Noise grain overlay (desktop) */}
      <div
        className="hidden lg:block absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
          opacity: 1,
        }}
      />
      {/* Mobile tech grid */}
      <div className="hidden sm:block lg:hidden absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
    </div>
  )

  // ── Profile modal (shared) ──────────────────────────────────────────────────
  const profileModal = profileOpen ? (
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
                <Input className="mb-2" placeholder="Nazwa użytkownika" autoComplete="username"
                       value={loginForm.username} onChange={e=>setLoginForm(s=>({ ...s, username: e.target.value }))} />
                <Input type="password" className="mb-2" placeholder="Hasło" autoComplete="current-password"
                       value={loginForm.password} onChange={e=>setLoginForm(s=>({ ...s, password: e.target.value }))} />
                <Button variant="success" type="submit">Zaloguj</Button>
              </form>
              <form onSubmit={handleRegister} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                <div className="text-sm font-medium mb-2">Rejestracja</div>
                <Input className="mb-2" placeholder="Nazwa użytkownika" autoComplete="username"
                       value={registerForm.username} onChange={e=>setRegisterForm(s=>({ ...s, username: e.target.value }))} />
                <Input type="password" className="mb-2" placeholder="Hasło (min. 6)" autoComplete="new-password"
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
                      if (apiKeyVisible) { setApiKeyVisible(false); return }
                      if (!singleApiKey) { toast.error('Pełny klucz jest dostępny tylko po regeneracji.'); return }
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
                    <Button onClick={startArticlesScrape} disabled={articlesBusy} variant={articlesBusy ? 'neutral' : 'success'}>
                      {articlesBusy ? 'Aktualizuję…' : 'Aktualizuj artykuły'}
                    </Button>
                    {articlesJob ? <span className="text-xs opacity-80">Status: {articlesJob.status}</span> : null}
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
                  {backupsVisible && backupsError ? <div className="text-xs text-rose-300 mb-2">{backupsError}</div> : null}
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
                      <Button onClick={uploadHubBackground} disabled={!hubBackgroundFile || hubBackgroundAction === 'upload'} variant={hubBackgroundAction === 'upload' ? 'neutral' : 'success'}>
                        {hubBackgroundAction === 'upload' ? 'Przetwarzam…' : 'Wgraj nowe tło'}
                      </Button>
                      <Button onClick={() => { void loadHubBackgrounds() }} disabled={!!hubBackgroundAction} variant="outline">Odśwież listę</Button>
                    </div>
                    {hubBackgroundFile ? <div className="mt-2 text-[11px] opacity-70">Wybrano plik: {hubBackgroundFile.name}</div> : null}
                  </div>
                  {hubBackgroundsLoading && !hubBackgrounds ? <div className="mt-3 text-xs text-zinc-400">Ładowanie zapisanych teł…</div> : null}
                  {hubBackgroundError ? <div className="mt-3 text-xs text-rose-300">{hubBackgroundError}</div> : null}
                  <div className="mt-3 grid gap-2">
                    {(hubBackgrounds?.entries || []).map((entry) => (
                      <div key={entry.id} className={`rounded-lg border p-2 ${entry.isActive ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/40'}`}>
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
                              {entry.isActive ? <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">Aktywne</span> : null}
                              {entry.protected ? <span className="rounded-full border border-cyan-400/50 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-100">Tło specjalne</span> : null}
                              {!entry.protected && entry.locked ? <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">Lock</span> : null}
                            </div>
                            <div className="mt-1 text-[11px] opacity-70">Źródło: {entry.sourceName || 'wbudowane tło'}</div>
                            <div className="text-[11px] opacity-70">Dodano: {formatDateTime(entry.createdAt)}</div>
                            <div className="text-[11px] opacity-70">Ostatnio wybrane: {formatDateTime(entry.lastSelectedAt)}</div>
                            <div className="text-[11px] opacity-70">Warianty WebP: {entry.variants.webp.map((v) => `${v.width}px`).join(', ') || 'brak'}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:w-44 sm:flex-col sm:items-stretch">
                            <Button onClick={() => { void activateHubBackground(entry.id) }} disabled={entry.isActive || !!hubBackgroundAction} variant={entry.isActive ? 'neutral' : 'success'} size="sm">
                              {entry.isActive ? 'Aktywne teraz' : 'Przywróć'}
                            </Button>
                            {!entry.protected ? (
                              <Button onClick={() => { void setHubBackgroundLock(entry.id, !entry.locked) }} disabled={!!hubBackgroundAction} variant={entry.locked ? 'warning' : 'outline'} size="sm">
                                {entry.locked ? 'Unlock' : 'Lock'}
                              </Button>
                            ) : null}
                            {!entry.protected ? (
                              <Button onClick={() => { void deleteHubBackground(entry.id) }} disabled={!!hubBackgroundAction || entry.locked || (hubBackgrounds?.entries.length || 0) <= 1} variant="danger" size="sm" title={entry.locked ? 'Najpierw odblokuj tło, aby je usunąć.' : undefined}>
                                Usuń
                              </Button>
                            ) : (
                              <div className="rounded-md border border-cyan-400/35 bg-cyan-400/10 px-2 py-1 text-center text-[11px] text-cyan-100">
                                Wpis systemowy
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {hubBackgrounds && hubBackgrounds.entries.length === 0 ? <div className="text-xs text-zinc-400">Brak zapisanych teł.</div> : null}
                  </div>
                </section>
              ) : null}
              {isAdmin ? (
                <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Widoczność aplikacji</div>
                  <HubVisibilitySection
                    hubAppVisibility={hubAppVisibility}
                    hubVisibilityLoading={hubVisibilityLoading}
                    hubVisibilityAction={hubVisibilityAction}
                    updateHubAppVisibility={updateHubAppVisibility}
                  />
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Modal>
  ) : null

  return (
    <div className="relative min-h-[100svh] w-full font-instrument">
      {heroBg}

      {/* ── DESKTOP SIDEBAR LAYOUT (lg+) ─────────────────────────────────── */}
      <aside
        className="hub-side-in hidden lg:flex fixed left-0 top-0 bottom-0 z-10 flex-col"
        style={{
          width: '430px',
          background: 'var(--hub-glass-bg)',
          borderRight: '1px solid var(--hub-glass-border)',
          backdropFilter: 'blur(28px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 shrink-0"
          style={{
            paddingTop: '22px',
            paddingBottom: '20px',
            borderBottom: '1px solid var(--hub-glass-border)',
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-[11px]">
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: '38px', height: '38px',
                borderRadius: '10px',
                background: 'var(--hub-accent)',
              }}
            >
              <School className="w-[19px] h-[19px]" style={{ color: '#1c1305' }} />
            </div>
            <div>
              <div className="font-bricolage text-[15px] font-semibold leading-[1.2] tracking-[0.01em]" style={{ color: 'var(--hub-text-primary)' }}>
                ZSE Zduńska Wola
              </div>
              <div className="text-[11.5px] mt-[1px] tracking-[0.02em]" style={{ color: 'var(--hub-text-secondary)' }}>
                Rok szkolny 2025 / 2026
              </div>
            </div>
          </div>

          {/* User chip */}
          <button
            type="button"
            onClick={openProfileDesktop}
            className="flex items-center gap-2 shrink-0 cursor-pointer transition-all rounded-full"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--hub-glass-border)',
              padding: '6px 13px 6px 6px',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.16)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--hub-glass-border)'
            }}
          >
            <div
              className="flex items-center justify-center text-[11px] font-bold"
              style={{
                width: '26px', height: '26px',
                borderRadius: '50%',
                background: 'var(--hub-accent)',
                color: '#1c1305',
              }}
            >
              {isAuth ? (
                me?.username?.[0]?.toUpperCase() || 'U'
              ) : (
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </div>
            <span className="text-[13px] font-medium" style={{ color: 'var(--hub-text-secondary)' }}>
              {isAuth ? (me?.username || 'Użytkownik') : 'Zaloguj'}
            </span>
          </button>
        </div>

        {/* Section label: Navigation */}
        <div
          className="text-[10.5px] font-semibold tracking-[0.13em] uppercase px-6 shrink-0"
          style={{ color: 'var(--hub-text-muted)', paddingTop: '20px', paddingBottom: '10px' }}
        >
          Nawigacja
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-[2px] px-3 shrink-0">
          {hubVisibilityLoading || visibleHubApps === null ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--hub-text-muted)' }}>
              Ładowanie aplikacji…
            </div>
          ) : visibleHubApps.length > 0 ? visibleHubApps.map((app) => (
            <NavItem
              key={app.key}
              icon={<app.Icon className="w-4 h-4" />}
              title={app.title}
              desc={app.navDescription}
              onClick={app.onClick}
            />
          )) : (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--hub-text-muted)' }}>
              Administrator ukrył wszystkie aplikacje w hubie.
            </div>
          )}
        </nav>

        {/* Divider */}
        <div className="mx-3 my-4 shrink-0" style={{ height: '1px', background: 'var(--hub-glass-border)' }} />

        {/* News section (sidebar variant — opens article in right panel) */}
        <NewsSection
          variant="sidebar"
          reloadSignal={newsReloadSignal}
          onOpenArticle={a => setRightPanel({ kind: 'article', article: a })}
        />
      </aside>

      {/* Footer credit (desktop) */}
      <div
        className="hidden lg:block fixed bottom-4 pointer-events-none"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.05em',
          zIndex: 5,
          whiteSpace: 'nowrap',
        }}
      >
        © {new Date().getFullYear()} ZSE Zduńska Wola
      </div>

      {/* ── MOBILE LAYOUT (< lg) ─────────────────────────────────────────── */}
      <div className="lg:hidden relative z-10 flex flex-col min-h-[100svh]">
        <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/70 border-b border-zinc-800">
          <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3 text-white">
            <School className="w-5 h-5 text-zinc-200" />
            <div className="text-sm font-semibold text-zinc-100">ZSE Zduńska Wola</div>
            <div className="ml-auto">
              <Button
                onClick={openProfile}
                variant="outline"
                className="border-white/30 bg-black/40 text-white hover:bg-black/60 backdrop-blur"
              >
                {isAuth ? (me?.username || 'Profil') : 'Zaloguj'}
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex flex-col items-center w-full max-w-6xl px-4 py-8 sm:py-10 text-white flex-1">
          <main className="w-full">
            {hubVisibilityLoading || visibleHubApps === null ? (
              <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-black/35 px-5 py-8 text-center shadow-xl backdrop-blur-md">
                <div className="text-lg font-semibold text-white">Ładowanie aplikacji</div>
                <p className="mt-2 text-sm text-zinc-200/90">Trwa pobieranie konfiguracji huba.</p>
              </div>
            ) : visibleHubApps.length > 0 ? (
              <div className="mx-auto max-w-3xl grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                {visibleHubApps.map((app) => (
                  <HubTile
                    key={app.key}
                    title={app.title}
                    description={app.tileDescription}
                    icon={<app.Icon className="h-6 w-6" />}
                    onClick={app.onClick}
                  />
                ))}
              </div>
            ) : (
              <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-black/35 px-5 py-8 text-center shadow-xl backdrop-blur-md">
                <div className="text-lg font-semibold text-white">Brak aktywnych aplikacji</div>
                <p className="mt-2 text-sm text-zinc-200/90">Administrator ukrył wszystkie pozycje w hubie.</p>
              </div>
            )}
            <div className="mt-12 sm:mt-16">
              <NewsSection reloadSignal={newsReloadSignal} />
            </div>
          </main>
          <footer className="mt-auto w-full pt-10 text-center text-xs text-zinc-200/90">
            © {new Date().getFullYear()} ZSE Zduńska Wola
          </footer>
        </div>
      </div>

      {/* Mobile modal (unchanged) */}
      {profileModal}

      {/* ── DESKTOP RIGHT PANEL (lg+) ─────────────────────────────────── */}
      <div className="hidden lg:block">
        <RightPanelShell
          open={rightPanel !== null}
          contentKey={rightPanel?.kind === 'article' ? `article:${rightPanel.article.url}` : 'profile'}
          onClose={closePanel}
        >
          {rightPanel?.kind === 'article' ? (
            <ArticlePanelContent article={rightPanel.article} onClose={closePanel} />
          ) : rightPanel?.kind === 'profile' ? (
            <ProfilePanelContent
              isAuth={isAuth}
              me={me}
              isAdmin={isAdmin}
              onClose={closePanel}
              loginForm={loginForm}
              setLoginForm={setLoginForm}
              registerForm={registerForm}
              setRegisterForm={setRegisterForm}
              handleLogin={handleLogin}
              handleRegister={handleRegister}
              handleLogout={handleLogout}
              displayedApiKey={displayedApiKey}
              apiKeyVisible={apiKeyVisible}
              setApiKeyVisible={setApiKeyVisible}
              singleApiKey={singleApiKey}
              apiKeyMeta={apiKeyMeta}
              regenSingleKey={regenSingleKey}
              toast={toast}
              articlesBusy={articlesBusy}
              articlesJob={articlesJob}
              startArticlesScrape={startArticlesScrape}
              hubAppVisibility={hubAppVisibility}
              hubVisibilityLoading={hubVisibilityLoading}
              hubVisibilityAction={hubVisibilityAction}
              updateHubAppVisibility={updateHubAppVisibility}
              ttBusy={ttBusy}
              refreshTimetable={refreshTimetable}
              backupsVisible={backupsVisible}
              backups={backups}
              backupsError={backupsError}
              toggleBackups={toggleBackups}
              restoreBackup={restoreBackup}
              hubBackgrounds={hubBackgrounds}
              hubBackgroundsLoading={hubBackgroundsLoading}
              hubBackgroundError={hubBackgroundError}
              hubBackgroundFile={hubBackgroundFile}
              setHubBackgroundFile={setHubBackgroundFile}
              hubBackgroundInputKey={hubBackgroundInputKey}
              hubBackgroundAction={hubBackgroundAction}
              uploadHubBackground={uploadHubBackground}
              loadHubBackgrounds={loadHubBackgrounds}
              activateHubBackground={activateHubBackground}
              setHubBackgroundLock={setHubBackgroundLock}
              deleteHubBackground={deleteHubBackground}
            />
          ) : null}
        </RightPanelShell>
      </div>
    </div>
  )
}

// ── ProfilePanelContent (desktop right panel) ────────────────────────────────

type ApiKeyMeta = { hasKey: boolean; preview: string | null; createdAt: number | null; lastUsedAt: number | null; format: string | null; requiresRotation?: boolean }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10.5px] font-semibold tracking-[0.13em] uppercase px-1 pt-1 pb-2"
      style={{ color: 'var(--hub-text-muted)' }}
    >
      {children}
    </div>
  )
}

function HubVisibilitySection({
  hubAppVisibility,
  hubVisibilityLoading,
  hubVisibilityAction,
  updateHubAppVisibility,
}: {
  hubAppVisibility: HubAppVisibility | null
  hubVisibilityLoading: boolean
  hubVisibilityAction: HubAppId | null
  updateHubAppVisibility: (appKey: HubAppId, visible: boolean) => void | Promise<void>
}) {
  if (hubVisibilityLoading || !hubAppVisibility) {
    return (
      <p className="px-1 text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>
        Ładowanie konfiguracji widoczności aplikacji…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {HUB_APP_OPTIONS.map((app) => {
        const visible = hubAppVisibility[app.key]
        const isSaving = hubVisibilityAction === app.key
        return (
          <div
            key={app.key}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
            style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="min-w-0 text-[12.5px] font-medium" style={{ color: visible ? '#edeae4' : 'var(--hub-text-secondary)' }}>
              {app.title}
            </div>
            <Button
              onClick={() => updateHubAppVisibility(app.key, !visible)}
              disabled={isSaving}
              variant={visible ? 'outline' : 'success'}
              size="sm"
              className="h-7 shrink-0 px-2.5 text-[11px]"
            >
              {isSaving ? 'Zapis…' : visible ? 'Ukryj' : 'Pokaż'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function ProfilePanelContent({
  isAuth, me, isAdmin, onClose,
  loginForm, setLoginForm, registerForm, setRegisterForm,
  handleLogin, handleRegister, handleLogout,
  displayedApiKey, apiKeyVisible, setApiKeyVisible, singleApiKey, apiKeyMeta, regenSingleKey,
  toast,
  articlesBusy, articlesJob, startArticlesScrape,
  hubAppVisibility, hubVisibilityLoading, hubVisibilityAction, updateHubAppVisibility,
  ttBusy, refreshTimetable,
  backupsVisible, backups, backupsError, toggleBackups, restoreBackup,
  hubBackgrounds, hubBackgroundsLoading, hubBackgroundError, hubBackgroundFile, setHubBackgroundFile,
  hubBackgroundInputKey, hubBackgroundAction, uploadHubBackground, loadHubBackgrounds,
  activateHubBackground, setHubBackgroundLock, deleteHubBackground,
}: {
  isAuth: boolean
  me: { id: string; username: string } | null
  isAdmin: boolean
  onClose: () => void
  loginForm: { username: string; password: string }
  setLoginForm: (f: { username: string; password: string }) => void
  registerForm: { username: string; password: string }
  setRegisterForm: (f: { username: string; password: string }) => void
  handleLogin: (e: React.FormEvent) => void
  handleRegister: (e: React.FormEvent) => void
  handleLogout: () => void
  displayedApiKey: string
  apiKeyVisible: boolean
  setApiKeyVisible: (v: boolean) => void
  singleApiKey: string | null
  apiKeyMeta: ApiKeyMeta | null
  regenSingleKey: () => void
  toast: ReturnType<typeof useToast>
  articlesBusy: boolean
  articlesJob: { id: string; status: string } | null
  startArticlesScrape: () => void
  hubAppVisibility: HubAppVisibility | null
  hubVisibilityLoading: boolean
  hubVisibilityAction: HubAppId | null
  updateHubAppVisibility: (appKey: HubAppId, visible: boolean) => void | Promise<void>
  ttBusy: boolean
  refreshTimetable: () => void
  backupsVisible: boolean
  backups: { filename: string; size: number; mtime: string }[] | null
  backupsError: string | null
  toggleBackups: () => void
  restoreBackup: (f: string) => void
  hubBackgrounds: HubBackgroundState | null
  hubBackgroundsLoading: boolean
  hubBackgroundError: string | null
  hubBackgroundFile: File | null
  setHubBackgroundFile: (f: File | null) => void
  hubBackgroundInputKey: number
  hubBackgroundAction: string | null
  uploadHubBackground: () => void
  loadHubBackgrounds: () => void
  activateHubBackground: (id: string) => void
  setHubBackgroundLock: (id: string, locked: boolean) => void
  deleteHubBackground: (id: string) => void
}) {
  return (
    <>
      {/* Panel header */}
      <div
        className="shrink-0 px-5 pt-5 pb-4 flex items-center justify-between gap-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3">
          {isAuth && me ? (
            <div
              className="flex items-center justify-center text-[15px] font-bold shrink-0"
              style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--hub-accent)', color: '#1c1305' }}
            >
              {me.username[0]?.toUpperCase()}
            </div>
          ) : (
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Settings className="w-4 h-4" style={{ color: 'var(--hub-text-muted)' }} />
            </div>
          )}
          <div>
            <div className="font-bricolage text-[17px] font-semibold leading-tight" style={{ color: '#edeae4' }}>
              {isAuth ? me?.username : 'Konto'}
            </div>
            {isAuth && (
              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--hub-text-secondary)' }}>
                {isAdmin ? 'Administrator' : 'Użytkownik'}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAuth && (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12px] font-medium transition-opacity hover:opacity-75"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}
            >
              <LogOut className="w-3.5 h-3.5" /> Wyloguj
            </button>
          )}
          <CloseBtn onClick={onClose} />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-5">

        {!isAuth ? (
          /* ── Logged-out: login + register ── */
          <div className="grid grid-cols-2 gap-3">
            <form onSubmit={handleLogin} className="hub-profile-section flex flex-col gap-2">
              <SectionLabel>Logowanie</SectionLabel>
              <Input placeholder="Nazwa użytkownika" autoComplete="username"
                     value={loginForm.username}
                     onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
              <Input type="password" placeholder="Hasło" autoComplete="current-password"
                     value={loginForm.password}
                     onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
              <Button variant="success" type="submit" className="mt-1">Zaloguj</Button>
            </form>
            <form onSubmit={handleRegister} className="hub-profile-section flex flex-col gap-2">
              <SectionLabel>Rejestracja</SectionLabel>
              <Input placeholder="Nazwa użytkownika" autoComplete="username"
                     value={registerForm.username}
                     onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })} />
              <Input type="password" placeholder="Hasło (min. 6)" autoComplete="new-password"
                     value={registerForm.password}
                     onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} />
              <Button variant="primary" type="submit" className="mt-1">Zarejestruj</Button>
            </form>
          </div>
        ) : (
          /* ── Logged-in sections ── */
          <>
            {/* API Key */}
            <div className="hub-profile-section flex flex-col gap-2">
              <SectionLabel><span className="inline-flex items-center gap-1.5"><KeyRound className="w-3 h-3 inline" /> Klucz API</span></SectionLabel>
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--hub-text-secondary)' }}>
                Pełny klucz widoczny tylko po regeneracji. Przechowuj bezpiecznie.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={displayedApiKey} className="flex-1 font-mono text-[12px]" />
                <Button
                  onClick={() => {
                    if (apiKeyVisible) { setApiKeyVisible(false); return }
                    if (!singleApiKey) { toast.error('Pełny klucz jest dostępny tylko po regeneracji.'); return }
                    setApiKeyVisible(true)
                  }}
                  variant="outline" size="sm"
                >
                  {apiKeyVisible ? 'Ukryj' : 'Pokaż'}
                </Button>
                <Button
                  onClick={async () => {
                    if (!singleApiKey || !apiKeyVisible) return
                    try { await navigator.clipboard.writeText(singleApiKey); toast.success('Skopiowano klucz API.') }
                    catch { toast.error('Nie udało się skopiować klucza API.') }
                  }}
                  disabled={!singleApiKey || !apiKeyVisible}
                  variant="outline" size="sm"
                >
                  Kopiuj
                </Button>
                <Button onClick={regenSingleKey} variant="warning" size="sm">Regeneruj</Button>
              </div>
              {apiKeyMeta?.createdAt ? (
                <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>
                  Utworzono: {new Date(apiKeyMeta.createdAt).toLocaleString()}
                </p>
              ) : null}
              {apiKeyMeta?.requiresRotation ? (
                <p className="text-[11px] text-amber-300">
                  Wykryto stary format klucza — zregeneruj, aby dalej używać API.
                </p>
              ) : null}
            </div>

            {/* Admin sections */}
            {isAdmin && (
              <>
                <div className="text-[10.5px] font-semibold tracking-[0.13em] uppercase px-1" style={{ color: 'var(--hub-text-muted)' }}>
                  Panel administratora
                </div>

                {/* Aktualności */}
                <div className="hub-profile-section flex flex-col gap-2">
                  <SectionLabel>Aktualności</SectionLabel>
                  <div className="flex items-center gap-2">
                    <Button onClick={startArticlesScrape} disabled={articlesBusy} variant={articlesBusy ? 'neutral' : 'success'}>
                      {articlesBusy ? 'Aktualizuję…' : 'Aktualizuj artykuły'}
                    </Button>
                    {articlesJob ? <span className="text-[11px]" style={{ color: 'var(--hub-text-secondary)' }}>Status: {articlesJob.status}</span> : null}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Po zakończeniu nowe artykuły pojawią się w panelu bocznym.</p>
                </div>

                {/* Plan lekcji */}
                <div className="hub-profile-section flex flex-col gap-2">
                  <SectionLabel>Plan lekcji</SectionLabel>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={refreshTimetable} disabled={ttBusy} variant={ttBusy ? 'neutral' : 'primary'}>
                      {ttBusy ? 'Odświeżam…' : 'Odśwież plan teraz'}
                    </Button>
                    <Button onClick={() => { void toggleBackups() }} variant="outline">
                      {backupsVisible ? 'Ukryj kopie' : 'Kopie zapasowe'}
                    </Button>
                  </div>
                  {backupsVisible && backupsError ? <p className="text-[11px] text-rose-300">{backupsError}</p> : null}
                  {backupsVisible && Array.isArray(backups) ? (
                    backups.length === 0 ? (
                      <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Brak kopii zapasowych.</p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto rounded-lg text-[11px]" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                        {backups.map((b) => (
                          <div key={b.filename} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="truncate pr-2 flex-1" style={{ color: 'var(--hub-text-secondary)' }}>{b.filename}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span style={{ color: 'var(--hub-text-muted)' }}>{new Date(b.mtime).toLocaleDateString()}</span>
                              <Button onClick={() => restoreBackup(b.filename)} variant="success" size="sm">Przywróć</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                  <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Przechowujemy 5 ostatnich różnych wersji planu.</p>
                </div>

                {/* Tło */}
                <div className="hub-profile-section flex flex-col gap-2">
                  <SectionLabel>Tło strony głównej</SectionLabel>
                  <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>
                    Przechowujemy maksymalnie 2 poprzednie tła użytkownika. Tło specjalne jest wpisem systemowym i nie zużywa slotu historii.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      key={hubBackgroundInputKey}
                      type="file"
                      accept="image/*"
                      onChange={e => setHubBackgroundFile(e.target.files?.[0] ?? null)}
                      className="file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-xs file:text-white"
                    />
                    <Button onClick={uploadHubBackground} disabled={!hubBackgroundFile || hubBackgroundAction === 'upload'} variant={hubBackgroundAction === 'upload' ? 'neutral' : 'success'}>
                      {hubBackgroundAction === 'upload' ? 'Przetwarzam…' : 'Wgraj'}
                    </Button>
                    <Button onClick={() => { void loadHubBackgrounds() }} disabled={!!hubBackgroundAction} variant="outline">Odśwież</Button>
                  </div>
                  {hubBackgroundFile ? <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Plik: {hubBackgroundFile.name}</p> : null}
                  {hubBackgroundsLoading && !hubBackgrounds ? <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Ładowanie zapisanych teł…</p> : null}
                  {hubBackgroundError ? <p className="text-[11px] text-rose-300">{hubBackgroundError}</p> : null}
                  <div className="flex flex-col gap-2 mt-1">
                    {(hubBackgrounds?.entries || []).map(entry => (
                      <div
                        key={entry.id}
                        className="rounded-xl overflow-hidden"
                        style={{ border: entry.isActive ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.07)', background: entry.isActive ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)' }}
                      >
                        <div className="flex gap-3 p-2">
                          <div className="w-20 h-14 rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                            {entry.previewUrl
                              ? <img src={entry.previewUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                              : <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--hub-text-muted)' }}>brak</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[12px] font-medium" style={{ color: '#edeae4' }}>{entry.label}</span>
                              {entry.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>Aktywne</span>}
                              {entry.protected && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.14)', border: '1px solid rgba(34,211,238,0.32)', color: '#cffafe' }}>Tło specjalne</span>}
                              {!entry.protected && entry.locked && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }}>Lock</span>}
                            </div>
                            <div className="flex gap-1.5 flex-wrap mt-1">
                              <Button onClick={() => { void activateHubBackground(entry.id) }} disabled={entry.isActive || !!hubBackgroundAction} variant={entry.isActive ? 'neutral' : 'success'} size="sm">
                                {entry.isActive ? 'Aktywne' : 'Ustaw'}
                              </Button>
                              {!entry.protected ? (
                                <Button onClick={() => { void setHubBackgroundLock(entry.id, !entry.locked) }} disabled={!!hubBackgroundAction} variant={entry.locked ? 'warning' : 'outline'} size="sm">
                                  {entry.locked ? 'Unlock' : 'Lock'}
                                </Button>
                              ) : null}
                              {!entry.protected ? (
                                <Button onClick={() => { void deleteHubBackground(entry.id) }} disabled={!!hubBackgroundAction || entry.locked || (hubBackgrounds?.entries.length || 0) <= 1} variant="danger" size="sm">
                                  Usuń
                                </Button>
                              ) : (
                                <div className="rounded-md px-2 py-1 text-[10px]" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.26)', color: '#cffafe' }}>
                                  Wpis systemowy
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {hubBackgrounds?.entries.length === 0 && <p className="text-[11px]" style={{ color: 'var(--hub-text-muted)' }}>Brak zapisanych teł.</p>}
                  </div>
                </div>

                <div className="hub-profile-section flex flex-col gap-2">
                  <SectionLabel>Widoczność aplikacji</SectionLabel>
                  <HubVisibilitySection
                    hubAppVisibility={hubAppVisibility}
                    hubVisibilityLoading={hubVisibilityLoading}
                    hubVisibilityAction={hubVisibilityAction}
                    updateHubAppVisibility={updateHubAppVisibility}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ── HubTile (mobile only) ─────────────────────────────────────────────────────

function HubTile({
  title,
  description,
  icon,
  onClick,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
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
      <span className="pointer-events-none absolute inset-px rounded-2xl bg-gradient-to-br from-cyan-300/10 via-emerald-300/10 to-violet-300/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
      <span className="pointer-events-none absolute -inset-10 translate-y-10 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white/20 text-white shadow-md">{icon}</span>
        <span className="text-base sm:text-lg font-semibold drop-shadow-sm">{title}</span>
      </div>
      <div className="relative">
        <p className="text-[11px] sm:text-xs text-zinc-100/95 leading-snug max-w-sm">{description}</p>
        <span className="mt-1 inline-block text-xs text-white/90 underline-offset-2 group-hover:underline">Przejdź</span>
      </div>
    </motion.button>
  )
}
