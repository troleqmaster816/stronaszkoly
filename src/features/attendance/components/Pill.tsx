import React from 'react'

export function Pill({children}: {children: React.ReactNode}) {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs">{children}</span>;
}


