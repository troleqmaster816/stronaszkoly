import React from 'react'

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'secondary'
}

export function Badge({ variant = 'default', className = '', ...props }: BadgeProps) {
  const base = 'inline-flex items-center rounded-full border px-2 py-1 text-xs'
  const styles =
    variant === 'secondary'
      ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
      : 'bg-zinc-900 text-zinc-100 border-zinc-700'
  return <span className={`${base} ${styles} ${className}`} {...props} />
}

export default Badge


