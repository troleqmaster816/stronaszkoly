import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  text: string
  variant?: 'class' | 'teacher' | 'room' | null
  mode?: 'eco3' | 'full'
}

// Desktop-only animated background with large, drifting text inspired by stylish UI.
// It renders behind content; parent must be position:relative.
export function AnimatedBackdrop({ text, variant = null, mode = 'full' }: Props) {
  if (!text) return null
  const isEco3 = mode === 'eco3'
  const isFirefox = React.useMemo(
    () => typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent),
    []
  )
  const rowIndexes = [0, 1, 2]
  const rowTopAbsolute = rowIndexes.map((row) => 10 + row * 30)

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
      {isEco3 ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="/backdrop/aurora-a-1600.webp"
            srcSet="/backdrop/aurora-a-1600.webp 1600w, /backdrop/aurora-a-2560.webp 2560w"
            sizes="100vw"
            decoding="async"
            loading="eager"
            alt=""
            className="absolute left-0 w-full object-cover opacity-[0.62] animate-slow-float"
            style={{ top: '-12%', height: '124%' }}
          />
          <img
            src="/backdrop/aurora-b-1600.webp"
            srcSet="/backdrop/aurora-b-1600.webp 1600w, /backdrop/aurora-b-2560.webp 2560w"
            sizes="100vw"
            decoding="async"
            loading="eager"
            alt=""
            className="absolute left-0 w-full object-cover opacity-[0.56] animate-slow-float-delayed"
            style={{ top: '-12%', height: '124%' }}
          />
        </div>
      ) : (
        <>
          <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-[color:var(--accent2)]/15 via-[color:var(--accent1)]/8 to-[color:var(--accent3)]/10 will-change-transform blur-3xl animate-slow-float" />
          <div className="absolute -bottom-1/3 -right-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-[color:var(--accent1)]/10 via-[color:var(--accent3)]/10 to-[color:var(--accent2)]/14 blur-3xl animate-slow-float-delayed will-change-transform" />
        </>
      )}

      {/* Aurora ribbons */}
      {!isEco3 && (
        <div className="absolute inset-0">
          <div className="aurora-ribbon aurora-ribbon--a" />
          <div className="aurora-ribbon aurora-ribbon--b" />
          <div className="aurora-ribbon aurora-ribbon--c" />
        </div>
      )}

      {/* Subtle animated grid for structure */}
      <div className={`absolute inset-0 ${isEco3 ? '' : 'backdrop-grid'}`} style={isEco3 ? { backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.07) 1px, transparent 1px)', backgroundSize: '96px 96px', opacity: 0.08 } : undefined} />

      {/* Repeated giant text stripes for parallax loop with crossfade on change */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 ${isFirefox ? '' : 'backdrop-fade-mask'}`}>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={text}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              {rowIndexes.map((row) => (
                <MovingRow
                  key={row}
                  index={row}
                  topVh={rowTopAbsolute[row]}
                  text={text}
                  variant={variant}
                  mode={isEco3 ? 'eco3' : 'full'}
                  isFirefox={isFirefox}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
        {isFirefox && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[18%] ff-fade-overlay-top" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] ff-fade-overlay-bottom" />
          </>
        )}
      </div>

      {/* Scanline/grain overlay */}
      {!isEco3 && <div className="absolute inset-0 scanlines" />}
    </div>
  )
}

function MovingRow({
  text,
  index,
  topVh,
  variant,
  mode,
  isFirefox,
}: {
  text: string
  index: number
  topVh: number
  variant: 'class' | 'teacher' | 'room' | null
  mode: 'eco3' | 'full'
  isFirefox: boolean
}) {
  const isLeft = index % 2 === 0
  const isEco3 = mode === 'eco3'
  const rowAnimationClass = variant === 'room'
    ? (isLeft ? 'animate-marquee-left-3-room' : 'animate-marquee-right-3-room')
    : (isLeft ? 'animate-marquee-left-3' : 'animate-marquee-right-3')
  const tileCopies = 4
  const trackTiles = 3
  return (
    <div
      className="absolute left-0 right-0 overflow-hidden"
      style={{
        top: `${topVh}vh`,
        backfaceVisibility: 'hidden',
      }}
    >
      <div className={`inline-flex w-max whitespace-nowrap ${isFirefox ? '' : 'will-change-transform'} ${rowAnimationClass}`}>
        {Array.from({ length: trackTiles }).map((_, tileIndex) => (
          <div key={tileIndex} className="inline-flex shrink-0">
            {Array.from({ length: tileCopies }).map((__, i) => (
              <span key={`${tileIndex}-${i}`} className={`mx-8 inline-block leading-none tracking-[-0.02em] font-extrabold uppercase ${isEco3 ? 'text-white/95 text-[14vw] opacity-[0.075]' : 'text-white/90 text-[14vw] opacity-[0.04] drop-shadow-[0_0_24px_rgba(99,102,241,0.10)] hover:opacity-[0.06] transition-opacity duration-500'}`} style={{ WebkitTextStroke: isEco3 ? '1px rgba(255,255,255,0.14)' : '1px rgba(255,255,255,0.08)', fontKerning: 'none', fontVariantLigatures: 'none' }}>{text}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AnimatedBackdrop
