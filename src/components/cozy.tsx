// Shared cozy / RPG-styled UI atoms used across the Overlap routes.
// Pairs with the .frame / .pixel / animation utilities in src/styles.css.

import { useEffect, useState } from 'react'

export const initialsOf = (name: string) =>
  name.trim().slice(0, 2).toUpperCase() || '?'

/** Eased count-up with a timer fallback for throttled rAF. */
export function useCountUp(target: number, start: boolean, dur = 1600) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!start) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setV(target * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setV(target)
    }
    raf = requestAnimationFrame(tick)
    const fb = setTimeout(() => setV(target), dur + 80)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fb)
    }
  }, [start, target, dur])
  return v
}

/** Little pixel star — sparkles, accents, banners. */
export function Star({
  size = 16,
  color = 'var(--wood)',
  fill = 'none',
  sw = 1.4,
}: {
  size?: number
  color?: string
  fill?: string
  sw?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={fill}>
      <path
        d="M8 1l1.9 4.6L15 6l-3.6 3.2L12.4 15 8 12.2 3.6 15l1-5.8L1 6l5.1-.4z"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Chunky framed avatar. Renders a generated portrait image when `src` is set,
 * otherwise falls back to the initials.
 */
export function Portrait({
  initials,
  src,
  size = 40,
  live = false,
}: {
  initials: string
  src?: string
  size?: number
  live?: boolean
}) {
  return (
    <div
      className="font-pixel relative grid shrink-0 place-items-center overflow-hidden select-none"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        fontSize: size * 0.42,
        fontWeight: 600,
        color: 'var(--wood)',
        background: live
          ? 'linear-gradient(160deg,#FBE3A0,#F2B946)'
          : 'linear-gradient(160deg,#fbf3da,#e7d09a)',
        border: '3px solid var(--wood)',
        boxShadow: live
          ? 'inset 0 0 0 2px #fff6, 0 3px 0 #2A1F18, 0 0 14px rgba(235,166,58,0.7)'
          : 'inset 0 0 0 2px #fff8, 0 3px 0 #2A1F18',
      }}
    >
      {src ? (
        <img
          src={src}
          alt={initials}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        initials
      )}
    </div>
  )
}

/** Decorative floating sparkles, fixed to the viewport behind content. */
export function Sparkles() {
  return (
    <>
      <div className="spark" style={{ left: '5%', top: '20%' }}>
        <Star size={16} color="var(--gold)" fill="var(--goldl)" sw={1.2} />
      </div>
      <div className="spark" style={{ right: '7%', top: '58%', animationDelay: '1.5s' }}>
        <Star size={12} color="var(--pink)" fill="#f6c4d4" sw={1.2} />
      </div>
      <div className="spark" style={{ left: '46%', top: '8%', animationDelay: '0.8s' }}>
        <Star size={10} color="var(--saged)" fill="#bfe6c2" sw={1.2} />
      </div>
    </>
  )
}

/** Gold coin medallion with an animated overlap %. */
export function ScoreMedallion({ score, started = true }: { score: number; started?: boolean }) {
  const val = useCountUp(score, started, 1700)
  const r = 80
  const c = 2 * Math.PI * r
  const off = c * (1 - val / 100)
  return (
    <div className="bob relative" style={{ width: 196, height: 196 }}>
      <div
        className="absolute inset-3 grid place-items-center rounded-full"
        style={{
          background: 'radial-gradient(circle at 38% 32%, #FBE6A8, #EBA63A 62%, #C77F22)',
          border: '4px solid var(--wood)',
          boxShadow:
            'inset 0 0 0 4px rgba(255,255,255,0.35), inset 0 -10px 18px rgba(150,90,20,0.4), 0 6px 0 #2A1F18',
        }}
      >
        <div className="text-center leading-none" style={{ marginTop: -2 }}>
          <div
            className="font-pixel tabnum"
            style={{ fontSize: 66, fontWeight: 700, color: 'var(--wood)', textShadow: '0 2px 0 rgba(255,255,255,0.35)' }}
          >
            {Math.round(val)}
            <span style={{ fontSize: 28 }}>%</span>
          </div>
          <div className="font-pixel" style={{ fontSize: 12, letterSpacing: '0.22em', color: '#7a4f17', marginTop: 2 }}>
            OVERLAP
          </div>
        </div>
      </div>
      <svg width="196" height="196" viewBox="0 0 196 196" className="absolute inset-0 -rotate-90">
        <circle cx="98" cy="98" r={r} fill="none" stroke="rgba(58,44,34,0.18)" strokeWidth="6" />
        <circle
          cx="98"
          cy="98"
          r={r}
          fill="none"
          stroke="#5fae6e"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <div className="blink absolute -top-1 right-3">
        <Star size={20} color="var(--gold)" fill="var(--goldl)" sw={1.4} />
      </div>
    </div>
  )
}

/* ================================================================== *
 * Environmental decoration — leaves, flowers, vines, trees, bushes    *
 * ================================================================== */

/** A single leaf with a center vein. */
export function Leaf({ size = 20, color = '#5ba35f', flip = false }: { size?: number; color?: string; flip?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M21 3C9 3 3 9 3 21c12 0 18-6 18-18z" fill={color} stroke="#2f6b3a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 18C10 14 14 10 18 6" stroke="#2f6b3a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** A little 5-petal blossom. */
export function Flower({
  size = 18,
  petal = '#f6a8c0',
  center = '#fff1a8',
}: {
  size?: number
  petal?: string
  center?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse
          key={a}
          cx="12"
          cy="5.5"
          rx="3.4"
          ry="5"
          fill={petal}
          stroke="#b56b85"
          strokeWidth="1"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="3.2" fill={center} stroke="#caa23a" strokeWidth="1" />
    </svg>
  )
}

/** A cluster of leaves used at the corners of a sign (Stardew-style sprig). */
export function LeafSpray({ size = 30, flip = false }: { size?: number; flip?: boolean }) {
  return (
    <div className="sway" style={{ transform: flip ? 'scaleX(-1)' : undefined, lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 40 40">
        <path d="M20 38C20 24 12 14 2 10c2 14 8 24 18 28z" fill="#6fbf6a" stroke="#2f6b3a" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M20 38C22 22 30 12 40 9c-3 14-10 24-20 29z" fill="#86cf7c" stroke="#2f6b3a" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M20 38C20 26 18 16 14 8c-1 13 1 23 6 30z" fill="#5ba35f" stroke="#2f6b3a" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** A hanging vine with leaves; gently sways. */
export function Vine({ height = 160, side = 'left' }: { height?: number; side?: 'left' | 'right' }) {
  const leaves = Math.max(3, Math.floor(height / 34))
  return (
    <div className="sway" style={{ lineHeight: 0 }}>
      <svg width="38" height={height} viewBox={`0 0 38 ${height}`} style={{ transform: side === 'right' ? 'scaleX(-1)' : undefined }}>
        <path
          d={`M19 0 C 8 ${height * 0.2}, 30 ${height * 0.4}, 14 ${height * 0.6} C 4 ${height * 0.78}, 26 ${height * 0.88}, 19 ${height}`}
          fill="none"
          stroke="#4e9e63"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {Array.from({ length: leaves }).map((_, i) => {
          const y = (height / (leaves + 1)) * (i + 1)
          const left = i % 2 === 0
          return (
            <g key={i} transform={`translate(${left ? 4 : 22} ${y}) rotate(${left ? -35 : 35})`}>
              <path d="M0 0C8 -2 13 3 11 11C3 9 -2 4 0 0z" fill={i % 3 === 0 ? '#86cf7c' : '#6fbf6a'} stroke="#2f6b3a" strokeWidth="1.1" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** A layered bushy tree. */
export function Tree({ size = 150 }: { size?: number }) {
  return (
    <div className="wind" style={{ lineHeight: 0 }}>
      <svg width={size} height={size * 1.2} viewBox="0 0 100 120">
        <rect x="44" y="78" width="12" height="34" rx="4" fill="#7a4f2a" stroke="#3a2c22" strokeWidth="2.5" />
        <path d="M50 80V58M50 70l-9-8M50 64l9-8" stroke="#3a2c22" strokeWidth="2" />
        <circle cx="50" cy="40" r="30" fill="#6fbf6a" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="28" cy="52" r="20" fill="#7fce78" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="72" cy="52" r="20" fill="#5ba35f" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="50" cy="58" r="22" fill="#6fbf6a" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="40" cy="34" r="4" fill="#bdeaa8" opacity="0.7" />
      </svg>
    </div>
  )
}

/** A small flowering bush. */
export function Bush({ size = 90 }: { size?: number }) {
  return (
    <div className="wind" style={{ lineHeight: 0 }}>
      <svg width={size} height={size * 0.75} viewBox="0 0 100 75">
        <circle cx="28" cy="48" r="22" fill="#5ba35f" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="72" cy="48" r="22" fill="#6fbf6a" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="50" cy="40" r="26" fill="#79c873" stroke="#2f6b3a" strokeWidth="3" />
        <circle cx="34" cy="38" r="4.5" fill="#f6a8c0" stroke="#b56b85" strokeWidth="1.4" />
        <circle cx="62" cy="44" r="4.5" fill="#fff1a8" stroke="#caa23a" strokeWidth="1.4" />
        <circle cx="50" cy="30" r="4.5" fill="#f6a8c0" stroke="#b56b85" strokeWidth="1.4" />
      </svg>
    </div>
  )
}

/**
 * Full-viewport environmental layer: hanging vines at the top corners,
 * trees + bushes along the bottom, and scattered blossoms. Sits behind
 * the app content (z-0), non-interactive.
 */
export function SceneDecor() {
  return (
    <div className="scene-decor" aria-hidden>
      {/* hanging vines from the top corners */}
      <div className="absolute -top-2 left-4 hidden md:block">
        <Vine height={200} side="left" />
      </div>
      <div className="absolute -top-2 left-28 hidden lg:block opacity-80">
        <Vine height={130} side="left" />
      </div>
      <div className="absolute -top-2 right-4 hidden md:block">
        <Vine height={180} side="right" />
      </div>
      <div className="absolute -top-2 right-28 hidden lg:block opacity-80">
        <Vine height={120} side="right" />
      </div>

      {/* bottom greenery */}
      <div className="absolute bottom-0 left-0 hidden sm:block" style={{ transform: 'translateY(8%)' }}>
        <Tree size={170} />
      </div>
      <div className="absolute bottom-0 left-32 hidden lg:block" style={{ transform: 'translateY(18%)' }}>
        <Bush size={120} />
      </div>
      <div className="absolute bottom-0 right-0 hidden sm:block" style={{ transform: 'translateY(10%)' }}>
        <Tree size={150} />
      </div>
      <div className="absolute bottom-0 right-36 hidden md:block" style={{ transform: 'translateY(20%)' }}>
        <Bush size={110} />
      </div>
      <div className="absolute bottom-1 left-1/2 hidden lg:block" style={{ transform: 'translateX(-50%) translateY(28%)' }}>
        <Bush size={90} />
      </div>

      {/* scattered ground blossoms */}
      <div className="absolute bottom-6 left-[22%] hidden sm:block grow"><Flower size={20} /></div>
      <div className="absolute bottom-10 left-[40%] hidden md:block grow"><Flower size={16} petal="#fff1a8" center="#eba63a" /></div>
      <div className="absolute bottom-5 right-[26%] hidden sm:block grow"><Flower size={18} petal="#c6e4f0" center="#fff1a8" /></div>
      <div className="absolute bottom-12 right-[44%] hidden lg:block grow"><Flower size={15} petal="#f6a8c0" /></div>
    </div>
  )
}

/** Decorative leaves tucked into the corners of a panel/banner. */
export function CornerLeaves() {
  return (
    <>
      <div className="pointer-events-none absolute -left-3 -top-3 z-10">
        <LeafSpray size={34} />
      </div>
      <div className="pointer-events-none absolute -right-3 -top-3 z-10">
        <LeafSpray size={34} flip />
      </div>
    </>
  )
}

/** Segmented RPG-style stat bar. */
export function StatBar({
  label,
  value,
  started = true,
  delay = 0,
}: {
  label: string
  value: number
  started?: boolean
  delay?: number
}) {
  const v = useCountUp(value, started, 1500)
  const cells = 10
  const filled = started ? Math.round(value / 10) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-pixel" style={{ fontSize: 15, color: 'var(--wood)' }}>
          {label}
        </span>
        <span className="font-pixel tabnum" style={{ fontSize: 16, color: 'var(--goldd)' }}>
          {Math.round(v)}
        </span>
      </div>
      <div
        className="flex gap-[3px] rounded p-[3px]"
        style={{ background: '#d8c290', border: '2px solid var(--wood)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)' }}
      >
        {Array.from({ length: cells }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: 13,
              background: i < filled ? 'linear-gradient(180deg,#F8CE6E,#EBA63A)' : 'rgba(58,44,34,0.10)',
              boxShadow: i < filled ? 'inset 0 1px 0 rgba(255,255,255,0.6)' : 'none',
              transition: `background .3s ${delay + i * 70}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
