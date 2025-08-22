import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import Hub from './Hub'
import TimetableViewer from './TimetableViewer'
import Harmonogram from './harmonogram'
import StatutSzkolnyViewer from './statut'
import FrekwencjaPage from './FrekwencjaPage'
import './index.css'
import HomeFab from './HomeFab'

type Route = '/' | '/plan' | '/harmonogram' | '/statut' | '/frekwencja'

function useHashlessRouter() {
  const getPath = () => (window.location.pathname as Route) as Route
  const [path, setPath] = useState<Route>(getPath())
  useEffect(() => {
    const onPop = () => setPath(getPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = (to: Route) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to)
      setPath(to)
    }
  }
  return { path, navigate }
}

function RouterApp() {
  const { path, navigate } = useHashlessRouter()
  const [overlayActive, setOverlayActive] = useState(false)
  const view = useMemo(() => {
    switch (path) {
      case '/':
        return <Hub navigate={navigate} />
      case '/plan':
        return <>
          <TimetableViewer onOverlayActiveChange={setOverlayActive} />
          {!overlayActive && <HomeFab onClick={() => navigate('/')} />}
        </>
      case '/harmonogram':
        return <>
          <Harmonogram />
          {!overlayActive && <HomeFab onClick={() => navigate('/')} />}
        </>
      case '/statut':
        return <>
          <StatutSzkolnyViewer jsonSrc="/statut.json" />
          {!overlayActive && <HomeFab onClick={() => navigate('/')} />}
        </>
      case '/frekwencja':
        return <>
          <FrekwencjaPage />
          <HomeFab onClick={() => navigate('/')} />
        </>
      default:
        return <Hub navigate={navigate} />
    }
  }, [path, overlayActive])
  return view
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>
)
