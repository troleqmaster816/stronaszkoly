import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  text: string
  variant?: 'class' | 'teacher' | 'room' | null
}

// Desktop-only animated background with large, drifting text inspired by stylish UI.
// It renders behind content; parent must be position:relative.
export function AnimatedBackdrop({ text, variant = null }: Props) {
  if (!text) return null

  // Palette via CSS variables for flexible theming per variant
  const palette: Record<string, string> =
    variant === 'class'
      ? { '--accent1': '#22d3ee', '--accent2': '#34d399', '--accent3': '#8b5cf6' }
      : variant === 'teacher'
      ? { '--accent1': '#a78bfa', '--accent2': '#60a5fa', '--accent3': '#e879f9' }
      : variant === 'room'
      ? { '--accent1': '#34d399', '--accent2': '#22d3ee', '--accent3': '#fde047' }
      : { '--accent1': '#60a5fa', '--accent2': '#34d399', '--accent3': '#a78bfa' };

  return (
    <div
      aria-hidden
      className="hidden md:block pointer-events-none fixed inset-0 overflow-hidden select-none"
      style={{ zIndex: 0, contain: 'layout paint', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)', ...(palette as React.CSSProperties) }}
    >
      {/* Soft gradient clouds for depth */}
      <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-[color:var(--accent2)]/15 via-[color:var(--accent1)]/8 to-[color:var(--accent3)]/10 blur-3xl animate-slow-float will-change-transform" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-[color:var(--accent1)]/10 via-[color:var(--accent3)]/10 to-[color:var(--accent2)]/14 blur-3xl animate-slow-float-delayed will-change-transform" />

      {/* Aurora ribbons */}
      <div className="absolute inset-0">
        <div className="aurora-ribbon aurora-ribbon--a" />
        <div className="aurora-ribbon aurora-ribbon--b" />
        <div className="aurora-ribbon aurora-ribbon--c" />
      </div>

      {/* Subtle animated grid for structure */}
      <div className="absolute inset-0 backdrop-grid" />

      {/* Repeated giant text stripes for parallax loop with crossfade on change */}
      <div className="absolute inset-0 mask-fade">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={text}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            {[0, 1, 2].map((row) => (
              <MovingRow key={row} index={row} text={text} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scanline/grain overlay */}
      <div className="absolute inset-0 scanlines" />
    </div>
  )
}

function MovingRow({ text, index }: { text: string; index: number }) {
  const rowRef = React.useRef<HTMLDivElement | null>(null)
  const measureRef = React.useRef<HTMLSpanElement | null>(null)
  const offsetRef = React.useRef<number>(0)
  const lastTsRef = React.useRef<number | null>(null)
  const tileWidthRef = React.useRef<number>(0)
  const rafRef = React.useRef<number | null>(null)

  const isLeft = index % 2 === 0
  const speedPxPerSec = isLeft ? 24 : 28

  React.useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const computeTile = () => {
      const rect = el.getBoundingClientRect()
      const styles = window.getComputedStyle(el)
      const ml = parseFloat(styles.marginLeft || '0')
      const mr = parseFloat(styles.marginRight || '0')
      tileWidthRef.current = rect.width + ml + mr
      // set staggered starting offset for rows to avoid alignment
      offsetRef.current = -tileWidthRef.current * (index * 0.33)
    }
    computeTile()
    const ro = new ResizeObserver(() => computeTile())
    ro.observe(el)
    window.addEventListener('resize', computeTile)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', computeTile)
    }
  }, [index, text])

  React.useEffect(() => {
    const step = (ts: number) => {
      const node = rowRef.current
      if (!node || tileWidthRef.current === 0) {
        rafRef.current = requestAnimationFrame(step)
        return
      }
      const last = lastTsRef.current
      lastTsRef.current = ts
      if (last != null) {
        const dt = (ts - last) / 1000
        const delta = speedPxPerSec * dt * (isLeft ? -1 : 1)
        let next = offsetRef.current + delta
        if (isLeft) {
          const limit = -tileWidthRef.current
          if (next <= limit) next -= limit // wrap
        } else {
          const limit = tileWidthRef.current
          if (next >= 0) next -= limit // wrap
        }
        offsetRef.current = next
        node.style.transform = `translate3d(${next}px,0,0)`
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [isLeft, speedPxPerSec, text])

  const copies = 4
  return (
    <div
      ref={rowRef}
      className={`whitespace-nowrap will-change-transform`}
      style={{
        position: 'absolute',
        top: `${10 + index * 30}vh`,
        left: 0,
        right: 0,
        backfaceVisibility: 'hidden',
      }}
    >
      {Array.from({ length: copies }).map((_, i) => (
        <span key={i} ref={i === 0 ? measureRef : undefined} className="mx-8 inline-block text-[14vw] leading-none tracking-[-0.02em] font-extrabold uppercase opacity-[0.04] text-white/90 drop-shadow-[0_0_24px_rgba(99,102,241,0.10)] hover:opacity-[0.06] transition-opacity duration-500" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.08)', fontKerning: 'none', fontVariantLigatures: 'none' }}>{text}</span>
      ))}
    </div>
  )
}

function RowContent({ text }: { text: string }) {
  return (
    <span
      className="mx-8 inline-block text-[14vw] leading-none tracking-[-0.02em] font-extrabold uppercase opacity-[0.04] text-white/90 drop-shadow-[0_0_24px_rgba(99,102,241,0.10)] hover:opacity-[0.06] transition-opacity duration-500"
      style={{
        WebkitTextStroke: '1px rgba(255,255,255,0.08)',
        fontKerning: 'none',
        fontVariantLigatures: 'none',
      }}
    >
      {text}
    </span>
  )
}

export default AnimatedBackdrop



