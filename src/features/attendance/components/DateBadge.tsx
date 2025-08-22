import React from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'

export function DateBadge({ dateISO, label }: { dateISO: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium">
      <CalendarIcon className="w-4 h-4"/>
      <span>{label}</span>
      <span className="opacity-70">{dateISO.split('-').reverse().join('.')}</span>
    </span>
  );
}


