import React from 'react'
import { Search, Columns3, Rows3 } from 'lucide-react'

export type EntityTab = 'teachers' | 'classes' | 'rooms'

function EntityPickerImpl({
  entityTab,
  setEntityTab,
  query,
  setQuery,
  options,
  selectedId,
  onSelectId,
  view,
  setView,
}: {
  entityTab: EntityTab
  setEntityTab: (t: EntityTab) => void
  query: string
  setQuery: (q: string) => void
  options: { id: string; label: string }[]
  selectedId: string | null
  onSelectId: (id: string | null) => void
  view: 'grid' | 'list'
  setView: (v: 'grid' | 'list') => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg bg-zinc-800 p-1">
        {([
          { key: 'teachers', label: 'Nauczyciele' },
          { key: 'classes', label: 'Klasy' },
          { key: 'rooms', label: 'Sale' },
        ] as const).map((t) => (
          <button
            key={t.key}
            className={`px-3 py-1.5 rounded-md text-sm transition ${
              entityTab === t.key ? 'bg-zinc-900 shadow border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'
            }`}
            onClick={() => setEntityTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
        <input
          aria-label="Filtruj listę planów po nazwie lub ID"
          className="w-full pl-8 pr-3 py-2 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          placeholder={`Szukaj po nazwie lub ID…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          list="entity-suggestions"
        />
        <datalist id="entity-suggestions">
          {options.slice(0, 50).map((x) => (
            <option key={x.id} value={x.label} />
          ))}
        </datalist>
      </div>

      <div className="min-w-[200px]">
        <select
          aria-label="Wybierz plan z listy"
          className="px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 w-full"
          value={selectedId ?? ''}
          onChange={(e) => onSelectId(e.target.value || null)}
        >
          <option value="">— Wybierz —</option>
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto inline-flex rounded-lg bg-zinc-800 p-1">
        <button
          className={`px-3 py-1.5 rounded-md text-sm transition inline-flex items-center gap-1 ${
            view === 'grid' ? 'bg-zinc-900 shadow border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'
          }`}
          onClick={() => setView('grid')}
          title="Widok siatki (dni × lekcje)"
        >
          <Columns3 className="w-4 h-4" /> Siatka
        </button>
        <button
          className={`px-3 py-1.5 rounded-md text-sm transition inline-flex items-center gap-1 ${
            view === 'list' ? 'bg-zinc-900 shadow border border-zinc-700' : 'text-zinc-300 hover:text-zinc-100'
          }`}
          onClick={() => setView('list')}
          title="Widok listy (dzień po dniu)"
        >
          <Rows3 className="w-4 h-4" /> Lista
        </button>
      </div>
    </div>
  )
}

export const EntityPicker = React.memo(EntityPickerImpl)
