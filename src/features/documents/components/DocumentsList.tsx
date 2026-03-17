import { useMemo, useState } from 'react'
import { FileText, Download, Search, File, FileSpreadsheet } from 'lucide-react'
import type { Document, DocumentAttachment, DocumentVariant } from '../lib/types'

type Props = {
  documents: Document[]
  categoryLabels: Record<string, string>
}

function formatIcon(format: string) {
  switch (format) {
    case 'pdf': return <FileText className="w-4 h-4 text-red-400" />
    case 'docx':
    case 'doc': return <File className="w-4 h-4 text-blue-400" />
    case 'odt': return <File className="w-4 h-4 text-green-400" />
    case 'xlsx': return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
    default: return <File className="w-4 h-4 text-zinc-400" />
  }
}

function formatBadge(format: string) {
  const colors: Record<string, string> = {
    pdf: 'bg-red-500/15 text-red-400 border-red-500/30',
    docx: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    doc: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    odt: 'bg-green-500/15 text-green-400 border-green-500/30',
    xlsx: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${colors[format] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}>
      {format}
    </span>
  )
}

function VariantLink({ variant }: { variant: DocumentVariant }) {
  return (
    <a
      href={variant.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
      aria-label={`${variant.format.toUpperCase()} — pobierz`}
    >
      {formatBadge(variant.format)}
      <Download className="h-3.5 w-3.5 text-zinc-500" />
    </a>
  )
}

function AttachmentRow({ attachment }: { attachment: DocumentAttachment }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm text-zinc-300">
        {attachment.title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {attachment.variants.map((variant) => (
          <VariantLink key={`${attachment.title}-${variant.format}-${variant.url}`} variant={variant} />
        ))}
      </div>
    </div>
  )
}

function getSearchText(document: Document) {
  const parts = [document.title]
  for (const variant of document.variants ?? []) {
    parts.push(variant.label, variant.format)
  }
  for (const group of document.attachmentGroups ?? []) {
    parts.push(group.label)
    for (const attachment of group.items) {
      parts.push(attachment.title)
      for (const variant of attachment.variants) {
        parts.push(variant.label, variant.format)
      }
    }
  }
  return parts.join(' ').toLowerCase()
}

export default function DocumentsList({ documents, categoryLabels }: Props) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = new Map<string, number>()
    for (const doc of documents) {
      cats.set(doc.category, (cats.get(doc.category) || 0) + 1)
    }
    return Array.from(cats.entries()).map(([key, count]) => ({
      key,
      label: categoryLabels[key] || key,
      count,
    }))
  }, [documents, categoryLabels])

  const filtered = useMemo(() => {
    let result = documents
    if (activeCategory) {
      result = result.filter(d => d.category === activeCategory)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(d => getSearchText(d).includes(q))
    }
    return result
  }, [documents, activeCategory, search])

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>()
    for (const doc of filtered) {
      const cat = doc.category
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(doc)
    }
    return Array.from(groups.entries()).map(([key, docs]) => ({
      key,
      label: categoryLabels[key] || key,
      docs,
    }))
  }, [filtered, categoryLabels])

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj dokumentu…"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 pl-10 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            !activeCategory
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800'
          }`}
        >
          Wszystkie ({documents.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat.key
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            {cat.label} ({cat.count})
          </button>
        ))}
      </div>

      {/* Documents */}
      {filtered.length === 0 ? (
        <div className="text-center text-zinc-500 py-8 text-sm">
          Brak dokumentów pasujących do filtrów.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ key, label, docs }) => (
            <div key={key}>
              {!activeCategory && (
                <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2 px-1">
                  {label}
                </h3>
              )}
              <div className="space-y-1">
                {docs.map((doc, i) => (
                  <div
                    key={`${key}-${i}`}
                    className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 px-3 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {formatIcon(doc.format)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-100">
                            {doc.title}
                          </div>
                          {doc.attachmentGroups?.length ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {doc.attachmentGroups.reduce((sum, group) => sum + group.items.length, 0)} załączników
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:justify-end">
                        {(doc.variants?.length ? doc.variants : [{ label: doc.format.toUpperCase(), url: doc.url, format: doc.format }]).map((variant) => (
                          <VariantLink key={`${doc.title}-${variant.format}-${variant.url}`} variant={variant} />
                        ))}
                      </div>
                    </div>

                    {doc.attachmentGroups?.length ? (
                      <div className="mt-3 border-t border-zinc-800/70 pt-3">
                        <div className={`grid gap-3 ${doc.attachmentGroups.length > 1 ? 'md:grid-cols-2' : ''}`}>
                          {doc.attachmentGroups.map((group) => (
                          <div key={`${doc.title}-${group.label}`} className="space-y-2 rounded-2xl border border-zinc-800/60 bg-zinc-950/35 p-3">
                            <div className="text-xs font-medium text-zinc-500">
                              {group.label}
                            </div>
                            <div className="space-y-2">
                              {group.items.map((attachment) => (
                                <AttachmentRow key={`${group.label}-${attachment.title}`} attachment={attachment} />
                              ))}
                            </div>
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
