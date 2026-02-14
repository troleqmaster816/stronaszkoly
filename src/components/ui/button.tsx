import React from 'react'

type ButtonVariant = 'neutral' | 'outline' | 'primary' | 'success' | 'warning' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'icon'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  neutral: 'bg-zinc-900 text-zinc-100 border border-zinc-700 hover:bg-zinc-800',
  outline: 'bg-transparent text-zinc-100 border border-zinc-700 hover:bg-zinc-800/70',
  primary: 'bg-blue-600 text-white border border-blue-500 hover:bg-blue-500',
  success: 'bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500',
  warning: 'bg-amber-600 text-white border border-amber-500 hover:bg-amber-500',
  danger: 'bg-red-600 text-white border border-red-500 hover:bg-red-500',
  ghost: 'bg-transparent text-zinc-200 border border-transparent hover:bg-zinc-800/70',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs rounded-md',
  md: 'px-3 py-2 text-sm rounded-lg',
  icon: 'p-2 rounded-lg',
}

export function Button({
  variant = 'neutral',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-60 disabled:cursor-not-allowed'
  return <button type={type} className={`${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props} />
}

export default Button


