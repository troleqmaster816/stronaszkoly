import React, { Suspense, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
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

export function HubRoute() {
  const navigate = useNavigate()
  return <Hub navigate={(to: string) => navigate(to)} />
}

export function TimetableRoute({ setOverlayActive }: { setOverlayActive: (v: boolean) => void }) {
  const navigate = useNavigate()
  return <>
    <TimetableViewer onOverlayActiveChange={setOverlayActive} />
    <HomeFab onClick={() => navigate('/')} />
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
  const [, setOverlayActive] = useState(false)
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HubRoute />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/plan" element={<TimetableRoute setOverlayActive={setOverlayActive} />} />
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
