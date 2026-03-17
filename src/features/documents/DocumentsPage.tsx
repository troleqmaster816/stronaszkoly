import { useMemo, useState } from 'react'
import { FileText, GraduationCap, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { useDocuments } from './hooks/useDocuments'
import DocumentsList from './components/DocumentsList'
import TeachingPlansGrid from './components/TeachingPlansGrid'

type Tab = 'documents' | 'plans'

export default function DocumentsPage() {
  const { data, loading, error } = useDocuments()
  const [tab, setTab] = useState<Tab>('documents')

  const teachingPlanDocuments = useMemo(
    () => (data ? Object.values(data.teachingPlans).reduce((sum, profile) => sum + profile.classes.length, 0) : 0),
    [data]
  )

  if (loading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-zinc-950 text-zinc-200">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          Ładowanie dokumentów…
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-zinc-950 text-zinc-200">
        <div className="flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error || 'Nie udało się wczytać danych.'}
        </div>
      </div>
    )
  }

  const hasPlans = teachingPlanDocuments > 0

  return (
    <div className="min-h-[100svh] bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Dokumenty szkolne</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Źródło: <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors inline-flex items-center gap-0.5">
                  zse-zdwola.pl <ExternalLink className="w-3 h-3" />
                </a>
                {data.scrapedAt && (
                  <> · Zaktualizowano: {new Date(data.scrapedAt).toLocaleDateString('pl-PL')}</>
                )}
              </p>
            </div>
          </div>

          {/* Tabs */}
          {hasPlans && (
            <div className="flex items-center gap-1 mt-3 -mb-px">
              <button
                onClick={() => setTab('documents')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${
                  tab === 'documents'
                    ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                Dokumenty
                <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-800 text-zinc-400 tabular-nums">
                  {data.documents.length}
                </span>
              </button>
              <button
                onClick={() => setTab('plans')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${
                  tab === 'plans'
                    ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Ramowe plany nauczania
                <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-800 text-zinc-400 tabular-nums">
                  {teachingPlanDocuments}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {tab === 'documents' ? (
          <DocumentsList
            documents={data.documents}
            categoryLabels={data.categoryLabels}
          />
        ) : (
          <TeachingPlansGrid plans={data.teachingPlans} />
        )}
      </main>
    </div>
  )
}
