import { Download, FileText } from 'lucide-react'
import type { TeachingPlanProfile } from '../lib/types'

type Props = {
  plans: Record<string, TeachingPlanProfile>
}

function sortProfileClasses(classes: TeachingPlanProfile['classes']) {
  return classes.slice().sort((left, right) => left.classNum - right.classNum)
}

export default function TeachingPlansGrid({ plans }: Props) {
  const entries = Object.entries(plans)
    .map(([key, profile]) => ({
      key,
      profile,
      classes: sortProfileClasses(profile.classes),
    }))
    .filter((entry) => entry.classes.length > 0)

  if (entries.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8 text-sm">
        Brak ramowych planów nauczania.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {entries.map(({ key, profile, classes }) => (
        <div key={key}>
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2 px-1">
            {profile.name}
          </h3>
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              {classes.map((plan) => (
                <a
                  key={`${profile.code}-${plan.classNum}`}
                  href={plan.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                  aria-label={`${profile.name}, klasa ${plan.classNum} — pobierz PDF`}
                >
                  <FileText className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-sm text-zinc-100">Klasa {plan.classNum}</span>
                  <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase bg-red-500/15 text-red-400 border-red-500/30">
                    pdf
                  </span>
                  <Download className="h-3.5 w-3.5 text-zinc-500" />
                </a>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
