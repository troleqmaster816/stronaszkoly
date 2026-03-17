import { useEffect, useState } from 'react'
import type { DocumentsData } from '../lib/types'

export function useDocuments() {
  const [data, setData] = useState<DocumentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/documents.json', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json: DocumentsData) => {
        if (cancelled) return
        setData(json)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError('Nie udało się wczytać dokumentów.')
        console.error('Documents load error', e)
      })
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}
