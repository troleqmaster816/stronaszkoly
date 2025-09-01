import React from 'react'

type Props = {
  text: string
}

// Desktop-only animated background with large, drifting text inspired by stylish UI.
// It renders behind content; parent must be position:relative.
export function AnimatedBackdrop({ text }: Props) {
  if (!text) return null
  return (
    <div
      aria-hidden
      className="hidden md:block pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{ zIndex: 0 }}
    >
      {/* Glow gradient clouds */}
      <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-fuchsia-600/15 via-sky-500/8 to-emerald-500/10 blur-3xl animate-slow-float" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-emerald-500/10 via-violet-500/10 to-cyan-500/14 blur-3xl animate-slow-float-delayed" />

      {/* Repeated giant text stripes for parallax loop */}
      <div className="absolute inset-0 mask-fade">
        {[0, 1, 2].map((row) => (
          <MovingRow key={row} index={row} text={text} />
        ))}
      </div>
    </div>
  )
}

function MovingRow({ text, index }: { text: string; index: number }) {
  // Alternate direction and speed per row for parallax feel
  const dir = index % 2 === 0 ? 'animate-marquee-left' : 'animate-marquee-right'
  const delay = index === 1 ? 'animation-delay-1500' : index === 2 ? 'animation-delay-3000' : ''
  return (
    <div className={`whitespace-nowrap ${dir} ${delay} will-change-transform`}
      style={{
        position: 'absolute',
        top: `${10 + index * 30}%`,
        left: 0,
        right: 0,
      }}
    >
      <RowContent text={text} />
      <RowContent text={text} />
      <RowContent text={text} />
    </div>
  )
}

function RowContent({ text }: { text: string }) {
  return (
    <span
      className="mx-8 inline-block text-[14vw] leading-none tracking-[-0.02em] font-extrabold uppercase opacity-[0.045] text-white/90 drop-shadow-[0_0_24px_rgba(59,130,246,0.08)] hover:opacity-[0.06] transition-opacity duration-500"
      style={{
        WebkitTextStroke: '1px rgba(255,255,255,0.08)',
      }}
    >
      {text}
    </span>
  )
}

export default AnimatedBackdrop



