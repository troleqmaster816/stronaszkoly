import { useCallback, useEffect, useState } from 'react'

export function useHashId() {
  const [hashId, setHashId] = useState<string | null>(() => {
    const h = window.location.hash.replace(/^#\/?/, '')
    return h || null
  })
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '')
      setHashId(h || null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Keep updater stable to avoid accidental effect loops in consumers
  const update = useCallback((id: string | null) => {
    if (!id) {
      history.replaceState(null, '', window.location.pathname)
      setHashId(null)
    } else {
      const hash = `#/${id}`
      if (window.location.hash !== hash) {
        history.replaceState(null, '', hash)
      }
      setHashId(id)
    }
  }, [])

  return [hashId, update] as const
}
