import React, { Suspense, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import './index.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './styles/print.css'
import HomeFab from './HomeFab'
import { AuthProvider } from './features/auth/AuthContext'

const Hub = React.lazy(() => import('./Hub'))
const TimetableViewer = React.lazy(() => import('./TimetableViewer'))
const Harmonogram = React.lazy(() => import('./harmonogram'))
const StatutSzkolnyViewer = React.lazy(() => import('./statut'))
const FrekwencjaPage = React.lazy(() => import('./FrekwencjaPage'))
const Docs = React.lazy(() => import('./Docs'))
const APP_TITLE = 'ZSE Zduńska Wola'

function resolvePageTitle(pathname: string): string {
  if (pathname === '/') return `Hub | ${APP_TITLE}`
  if (pathname === '/plan') return `Plan lekcji | ${APP_TITLE}`
  if (pathname === '/frekwencja') return `Frekwencja | ${APP_TITLE}`
  if (pathname === '/harmonogram') return `Harmonogram | ${APP_TITLE}`
  if (pathname === '/statut') return `Statut szkoły | ${APP_TITLE}`
  if (pathname === '/docs') return `Dokumentacja API | ${APP_TITLE}`
  return APP_TITLE
}

function DocumentTitleManager() {
  const location = useLocation()

  useEffect(() => {
    document.title = resolvePageTitle(location.pathname)
  }, [location.pathname])

  return null
}

export function HubRoute() {
  const navigate = useNavigate()
  return <Hub navigate={(to: string) => navigate(to)} />
}

export function TimetableRoute({
  overlayActive,
  setOverlayActive,
}: {
  overlayActive: boolean
  setOverlayActive: (v: boolean) => void
}) {
  const navigate = useNavigate()
  return <>
    <TimetableViewer onOverlayActiveChange={setOverlayActive} />
    {!overlayActive && <HomeFab onClick={() => navigate('/')} />}
  </>
}

export function PageWithFab({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return <>
    {children}
    <HomeFab onClick={() => navigate('/')} />
  </>
}

export function AppRouter() {
  const [overlayActive, setOverlayActive] = useState(false)
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={null}>
          <DocumentTitleManager />
          <Routes>
            <Route path="/" element={<HubRoute />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/plan" element={<TimetableRoute overlayActive={overlayActive} setOverlayActive={setOverlayActive} />} />
            <Route path="/harmonogram" element={<PageWithFab><Harmonogram /></PageWithFab>} />
            <Route path="/statut" element={<PageWithFab><StatutSzkolnyViewer jsonSrc="/statut.json" /></PageWithFab>} />
            <Route path="/frekwencja" element={<PageWithFab><FrekwencjaPage /></PageWithFab>} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
