import React, { Suspense, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import './index.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './styles/print.css'
import HomeFab from './HomeFab'

const Hub = React.lazy(() => import('./Hub'))
const TimetableViewer = React.lazy(() => import('./TimetableViewer'))
const Harmonogram = React.lazy(() => import('./harmonogram'))
const StatutSzkolnyViewer = React.lazy(() => import('./statut'))
const FrekwencjaPage = React.lazy(() => import('./FrekwencjaPage'))

function HubRoute() {
  const navigate = useNavigate()
  return <Hub navigate={(to: string) => navigate(to)} />
}

function TimetableRoute({ setOverlayActive }: { setOverlayActive: (v: boolean) => void }) {
  const navigate = useNavigate()
  return <>
    <TimetableViewer onOverlayActiveChange={setOverlayActive} />
    <HomeFab onClick={() => navigate('/')} />
  </>
}

function PageWithFab({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return <>
    {children}
    <HomeFab onClick={() => navigate('/')} />
  </>
}

function AppRouter() {
  const [overlayActive, setOverlayActive] = useState(false)
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HubRoute />} />
          <Route path="/plan" element={<TimetableRoute setOverlayActive={setOverlayActive} />} />
          <Route path="/harmonogram" element={<PageWithFab><Harmonogram /></PageWithFab>} />
          <Route path="/statut" element={<PageWithFab><StatutSzkolnyViewer jsonSrc="/statut.json" /></PageWithFab>} />
          <Route path="/frekwencja" element={<PageWithFab><FrekwencjaPage /></PageWithFab>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
