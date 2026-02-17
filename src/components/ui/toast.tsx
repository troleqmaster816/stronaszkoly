/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastOptions = {
  durationMs?: number
}

type ToastApi = {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function toastClasses(variant: ToastVariant): string {
  if (variant === 'success') return 'border-emerald-700/80 bg-emerald-950/95 text-emerald-100'
  if (variant === 'error') return 'border-red-700/80 bg-red-950/95 text-red-100'
  return 'border-zinc-700/80 bg-zinc-900/95 text-zinc-100'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((variant: ToastVariant, message: string, options?: ToastOptions) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    const next: ToastItem = { id, message, variant }
    setToasts((cur) => [...cur, next].slice(-5))
    const ttl = options?.durationMs ?? 3800
    setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id))
    }, ttl)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, options),
    info: (message, options) => push('info', message, options),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex flex-col items-center gap-2 px-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto w-full max-w-md rounded-xl border px-3 py-2 text-sm shadow-lg ${toastClasses(toast.variant)}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
