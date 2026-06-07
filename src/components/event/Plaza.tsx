// The plaza: a top-down, game-like room where every attendee is a little
// chibi avatar. You walk yours with the arrow keys (or WASD); when you stand
// next to someone you can open a direct human-to-human chat — no agents.

import { useEffect, useMemo, useRef, useState } from 'react'
import { normHex, type Facing, type PlazaPerson } from '@/lib/overlap/backend'

// Drop a real pixel-art scene at /public/plaza.png and it shows here; until
// then a cozy cobblestone-courtyard gradient stands in.
const PLAZA_BG = '/plaza.png'

// Movement tuning (normalized 0..1 plaza units).
const SPEED = 0.34 // fraction of the plaza crossed per second
const EDGE = 0.045 // keep the avatar's body fully inside the frame
const SEND_MS = 90 // throttle for updatePosition writes
const LERP_SPEED = 18 // remote avatar interpolation (higher = snappier)
const NEAR_PX = 96 // proximity radius (screen px) for the introduce prompt

// Cozy avatar palettes, picked deterministically from identity.
const HAIR = ['#7a4f2a', '#3a2c22', '#C77F22', '#e0a96d', '#9b5a3c', '#4e3b2a', '#d98f4e']
const TUNIC = ['#82C58C', '#EBA63A', '#E597B0', '#7fb8dd', '#b58bd6', '#5fae6e', '#f0a868']

const hashHex = (hex: string) => {
  const h = normHex(hex)
  let a = 0
  for (let i = 0; i < h.length; i++) a = (a * 33 + h.charCodeAt(i)) >>> 0
  return a
}

// ── Village scenery ─────────────────────────────────────────────────────────
// Decorative props placed at normalized (x,y) coords, anchored at their base so
// they sit "on the ground". Purely cosmetic (pointer-events: none) and rendered
// below the avatars, so movement/proximity logic is unaffected. Center is kept
// open so there's room to walk and introduce.

type PropKind =
  | 'house-red'
  | 'house-blue'
  | 'house-green'
  | 'house-tan'
  | 'tree'
  | 'pine'
  | 'bush'
  | 'fountain'
  | 'lamp'
  | 'stall'
  | 'barrel'
  | 'flowers'
  | 'fence'

type VProp = { x: number; y: number; kind: PropKind; scale?: number }

// Layout: houses ring the edges, trees/bushes soften the corners, a fountain
// anchors the upper plaza, a market stall + lamps frame the lower walkway.
const PROPS: VProp[] = [
  // houses around the perimeter
  { x: 0.11, y: 0.2, kind: 'house-red', scale: 1.1 },
  { x: 0.88, y: 0.18, kind: 'house-blue', scale: 1.1 },
  { x: 0.9, y: 0.8, kind: 'house-green', scale: 1.05 },
  { x: 0.1, y: 0.82, kind: 'house-tan', scale: 1.05 },
  { x: 0.5, y: 0.12, kind: 'house-blue', scale: 0.85 },
  // centerpiece fountain (upper-middle so the walkway stays clear)
  { x: 0.5, y: 0.34, kind: 'fountain', scale: 1.15 },
  // trees
  { x: 0.28, y: 0.12, kind: 'tree' },
  { x: 0.71, y: 0.1, kind: 'pine' },
  { x: 0.04, y: 0.46, kind: 'pine' },
  { x: 0.96, y: 0.48, kind: 'tree' },
  { x: 0.34, y: 0.92, kind: 'tree', scale: 0.95 },
  { x: 0.64, y: 0.94, kind: 'pine', scale: 0.95 },
  { x: 0.8, y: 0.6, kind: 'tree', scale: 0.85 },
  { x: 0.2, y: 0.58, kind: 'pine', scale: 0.85 },
  // market stall + lamps along the lower plaza
  { x: 0.5, y: 0.84, kind: 'stall', scale: 1.1 },
  { x: 0.38, y: 0.24, kind: 'lamp' },
  { x: 0.62, y: 0.7, kind: 'lamp' },
  // small props
  { x: 0.16, y: 0.64, kind: 'barrel' },
  { x: 0.85, y: 0.36, kind: 'barrel' },
  { x: 0.24, y: 0.36, kind: 'bush' },
  { x: 0.76, y: 0.4, kind: 'bush' },
  { x: 0.43, y: 0.62, kind: 'flowers' },
  { x: 0.58, y: 0.5, kind: 'flowers' },
  { x: 0.3, y: 0.74, kind: 'flowers' },
]

/** A single pixel-styled village prop, drawn at a fixed size, base on the ground. */
function VillageProp({ kind, scale = 1 }: { kind: PropKind; scale?: number }) {
  const stroke = '#2A1F18'
  switch (kind) {
    case 'house-red':
    case 'house-blue':
    case 'house-green':
    case 'house-tan': {
      const wall =
        kind === 'house-red'
          ? '#d98f6b'
          : kind === 'house-blue'
            ? '#8fb6d6'
            : kind === 'house-green'
              ? '#9ac58c'
              : '#e6cda0'
      const roof =
        kind === 'house-red'
          ? '#b5523e'
          : kind === 'house-blue'
            ? '#4e6f97'
            : kind === 'house-green'
              ? '#5c8a4e'
              : '#9b6b3c'
      return (
        <svg width={64 * scale} height={64 * scale} viewBox="0 0 64 64" shapeRendering="crispEdges">
          {/* wall */}
          <rect x="12" y="28" width="40" height="32" rx="2" fill={wall} stroke={stroke} strokeWidth="2" />
          {/* roof */}
          <path d="M6 30 L32 8 L58 30 Z" fill={roof} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <rect x="28" y="12" width="8" height="9" fill={roof} stroke={stroke} strokeWidth="1.5" />
          {/* door */}
          <rect x="27" y="42" width="11" height="18" rx="1.5" fill="#6e4a2f" stroke={stroke} strokeWidth="2" />
          <circle cx="35" cy="51" r="1.2" fill="#f0d68a" />
          {/* windows */}
          <rect x="16" y="34" width="9" height="9" fill="#f6e9b0" stroke={stroke} strokeWidth="1.5" />
          <rect x="40" y="34" width="9" height="9" fill="#f6e9b0" stroke={stroke} strokeWidth="1.5" />
        </svg>
      )
    }
    case 'tree':
      return (
        <svg width={48 * scale} height={60 * scale} viewBox="0 0 48 60" shapeRendering="crispEdges">
          <rect x="20" y="40" width="8" height="16" rx="2" fill="#6e4a2f" stroke={stroke} strokeWidth="2" />
          <circle cx="24" cy="24" r="18" fill="#6aa85a" stroke={stroke} strokeWidth="2" />
          <circle cx="15" cy="30" r="11" fill="#7cbb6a" stroke={stroke} strokeWidth="2" />
          <circle cx="33" cy="30" r="11" fill="#5c9a4e" stroke={stroke} strokeWidth="2" />
          <circle cx="19" cy="20" r="3" fill="#8fcd7c" opacity="0.8" />
        </svg>
      )
    case 'pine':
      return (
        <svg width={44 * scale} height={62 * scale} viewBox="0 0 44 62" shapeRendering="crispEdges">
          <rect x="18" y="46" width="8" height="14" rx="2" fill="#6e4a2f" stroke={stroke} strokeWidth="2" />
          <path d="M22 4 L36 24 L8 24 Z" fill="#5c9a4e" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 16 L38 38 L6 38 Z" fill="#4e8a44" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 28 L40 50 L4 50 Z" fill="#437a3b" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'bush':
      return (
        <svg width={44 * scale} height={28 * scale} viewBox="0 0 44 28" shapeRendering="crispEdges">
          <circle cx="12" cy="18" r="9" fill="#6aa85a" stroke={stroke} strokeWidth="2" />
          <circle cx="24" cy="14" r="11" fill="#7cbb6a" stroke={stroke} strokeWidth="2" />
          <circle cx="34" cy="18" r="8" fill="#5c9a4e" stroke={stroke} strokeWidth="2" />
        </svg>
      )
    case 'fountain':
      return (
        <svg width={76 * scale} height={56 * scale} viewBox="0 0 76 56" shapeRendering="crispEdges">
          {/* stone basin */}
          <ellipse cx="38" cy="44" rx="34" ry="11" fill="#b9b3a6" stroke={stroke} strokeWidth="2" />
          <ellipse cx="38" cy="40" rx="30" ry="9" fill="#cfe9f2" stroke={stroke} strokeWidth="2" />
          <ellipse cx="38" cy="39" rx="22" ry="6" fill="#a9d8ec" />
          {/* center pillar + spout */}
          <rect x="33" y="20" width="10" height="20" rx="2" fill="#c9c3b6" stroke={stroke} strokeWidth="2" />
          <ellipse cx="38" cy="20" rx="9" ry="4" fill="#cfe9f2" stroke={stroke} strokeWidth="2" />
          <path d="M38 8 q-5 6 0 12 q5 -6 0 -12 z" fill="#bfe7f5" stroke={stroke} strokeWidth="1.5" />
          <circle cx="30" cy="40" r="1.4" fill="#fff" opacity="0.85" />
          <circle cx="46" cy="41" r="1.4" fill="#fff" opacity="0.85" />
        </svg>
      )
    case 'lamp':
      return (
        <svg width={20 * scale} height={56 * scale} viewBox="0 0 20 56" shapeRendering="crispEdges">
          <rect x="8" y="14" width="4" height="40" fill="#3a2c22" stroke={stroke} strokeWidth="1.5" />
          <rect x="4" y="50" width="12" height="5" rx="1.5" fill="#3a2c22" stroke={stroke} strokeWidth="1.5" />
          <rect x="4" y="6" width="12" height="11" rx="2" fill="#f6d469" stroke={stroke} strokeWidth="2" />
          <rect x="6" y="8" width="8" height="7" fill="#fff2bf" />
          <circle cx="10" cy="11" r="9" fill="#f6d469" opacity="0.28" />
        </svg>
      )
    case 'stall':
      return (
        <svg width={76 * scale} height={56 * scale} viewBox="0 0 76 56" shapeRendering="crispEdges">
          {/* posts */}
          <rect x="8" y="20" width="4" height="34" fill="#6e4a2f" stroke={stroke} strokeWidth="1.5" />
          <rect x="64" y="20" width="4" height="34" fill="#6e4a2f" stroke={stroke} strokeWidth="1.5" />
          {/* awning */}
          <rect x="4" y="10" width="68" height="12" rx="2" fill="#c75b4a" stroke={stroke} strokeWidth="2" />
          <g fill="#f3e7cf">
            <rect x="12" y="10" width="10" height="12" />
            <rect x="32" y="10" width="10" height="12" />
            <rect x="52" y="10" width="10" height="12" />
          </g>
          <rect x="4" y="10" width="68" height="12" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          {/* counter + goods */}
          <rect x="6" y="36" width="64" height="18" rx="2" fill="#9b6b3c" stroke={stroke} strokeWidth="2" />
          <circle cx="22" cy="36" r="4" fill="#e0563f" stroke={stroke} strokeWidth="1.5" />
          <circle cx="33" cy="36" r="4" fill="#f0a83a" stroke={stroke} strokeWidth="1.5" />
          <circle cx="44" cy="36" r="4" fill="#7cbb6a" stroke={stroke} strokeWidth="1.5" />
        </svg>
      )
    case 'barrel':
      return (
        <svg width={24 * scale} height={32 * scale} viewBox="0 0 24 32" shapeRendering="crispEdges">
          <rect x="4" y="6" width="16" height="24" rx="4" fill="#9b6b3c" stroke={stroke} strokeWidth="2" />
          <rect x="4" y="13" width="16" height="3" fill="#6e4a2f" />
          <rect x="4" y="21" width="16" height="3" fill="#6e4a2f" />
          <ellipse cx="12" cy="7" rx="8" ry="3" fill="#b5824e" stroke={stroke} strokeWidth="1.5" />
        </svg>
      )
    case 'flowers':
      return (
        <svg width={34 * scale} height={20 * scale} viewBox="0 0 34 20" shapeRendering="crispEdges">
          {[
            { x: 6, c: '#e597b0' },
            { x: 17, c: '#f6d469' },
            { x: 28, c: '#b58bd6' },
          ].map((f, i) => (
            <g key={i}>
              <rect x={f.x - 0.5} y="10" width="1.5" height="8" fill="#5c9a4e" />
              <circle cx={f.x} cy="9" r="3.2" fill={f.c} stroke={stroke} strokeWidth="1" />
              <circle cx={f.x} cy="9" r="1" fill="#fff7e0" />
            </g>
          ))}
        </svg>
      )
    case 'fence':
      return (
        <svg width={40 * scale} height={22 * scale} viewBox="0 0 40 22" shapeRendering="crispEdges">
          <rect x="2" y="8" width="36" height="3" fill="#9b6b3c" stroke={stroke} strokeWidth="1" />
          {[5, 19, 33].map(x => (
            <rect key={x} x={x} y="4" width="4" height="16" fill="#b5824e" stroke={stroke} strokeWidth="1.5" />
          ))}
        </svg>
      )
  }
}

/** The decorative village layer: dirt paths + scattered props, below avatars. */
function VillageScene() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* dirt walkways: a horizontal road and a vertical one crossing the plaza */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: '46%',
          height: '13%',
          background:
            'linear-gradient(180deg, rgba(146,110,70,0) 0%, #b88a55 18%, #a87c49 50%, #b88a55 82%, rgba(146,110,70,0) 100%)',
          opacity: 0.85,
        }}
      />
      <div
        className="absolute top-0 bottom-0"
        style={{
          left: '44%',
          width: '11%',
          background:
            'linear-gradient(90deg, rgba(146,110,70,0) 0%, #b88a55 18%, #a87c49 50%, #b88a55 82%, rgba(146,110,70,0) 100%)',
          opacity: 0.85,
        }}
      />
      {/* props, anchored at their base */}
      {PROPS.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            transform: 'translate(-50%, -100%)',
            lineHeight: 0,
            filter: 'drop-shadow(0 3px 2px rgba(40,28,16,0.28))',
          }}
        >
          <VillageProp kind={p.kind} scale={p.scale} />
        </div>
      ))}
    </div>
  )
}

/** A tiny pixel-styled chibi character (CSS sprite). */
function Avatar({
  person,
  walking,
  selected,
  onClick,
}: {
  person: PlazaPerson
  walking: boolean
  selected: boolean
  onClick: () => void
}) {
  const seed = hashHex(person.hex)
  const hair = HAIR[seed % HAIR.length]
  const tunic = TUNIC[(seed >> 3) % TUNIC.length]
  const name = person.profile?.name ?? '???'
  const flip = person.spot.facing === 'left'
  const score =
    !person.isMe && person.match?.status === 'complete'
      ? person.match.score
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${person.spot.x * 100}%`, top: `${person.spot.y * 100}%` }}
    >
      <span className="relative mb-1 inline-flex items-center gap-1">
        <span
          className="font-pixel whitespace-nowrap px-1.5 py-0.5 text-[11px] leading-none"
          style={{
            color: person.isMe ? 'var(--wood)' : 'var(--wood2)',
            background: person.isMe ? 'var(--goldl)' : 'rgba(251,243,218,0.92)',
            border: `2px solid ${person.isMe ? 'var(--wood)' : 'var(--wood2)'}`,
            borderRadius: 6,
            boxShadow: '0 2px 0 rgba(42,31,24,0.4)',
          }}
        >
          {person.isMe ? `${name} (you)` : name}
        </span>
        {score !== null && (
          <span
            className="font-pixel shrink-0 px-1 py-0.5 text-[10px] leading-none"
            style={{
              color: 'var(--wood)',
              background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
              border: '2px solid var(--wood)',
              borderRadius: 5,
              boxShadow: '0 2px 0 rgba(42,31,24,0.4)',
            }}
          >
            {score}
          </span>
        )}
      </span>

      <div
        className={`relative ${walking ? 'av-walk' : 'av-idle'}`}
        style={{ transform: flip ? 'scaleX(-1)' : undefined, lineHeight: 0 }}
      >
        <div className="av-shadow" />
        <div
          className="grid place-items-center"
          style={{
            width: 36,
            height: 44,
            filter: selected ? 'drop-shadow(0 0 6px rgba(235,166,58,0.6))' : 'none',
          }}
        >
          <svg width="36" height="44" viewBox="0 0 36 44" shapeRendering="crispEdges">
            {/* body / tunic */}
            <rect x="9" y="24" width="18" height="15" rx="3" fill={tunic} stroke="#2A1F18" strokeWidth="2" />
            {/* arms */}
            <rect x="6" y="25" width="5" height="10" rx="2" fill={tunic} stroke="#2A1F18" strokeWidth="2" />
            <rect x="25" y="25" width="5" height="10" rx="2" fill={tunic} stroke="#2A1F18" strokeWidth="2" />
            {/* legs */}
            <rect x="12" y="38" width="5" height="5" fill="#4e3b2a" stroke="#2A1F18" strokeWidth="1.5" />
            <rect x="19" y="38" width="5" height="5" fill="#4e3b2a" stroke="#2A1F18" strokeWidth="1.5" />
            {/* head */}
            <rect x="9" y="6" width="18" height="18" rx="6" fill="#f3cda0" stroke="#2A1F18" strokeWidth="2" />
            {/* hair */}
            <path
              d="M9 13 Q9 4 18 4 Q27 4 27 13 L27 11 Q23 8 18 8 Q13 8 9 11 Z"
              fill={hair}
              stroke="#2A1F18"
              strokeWidth="1.5"
            />
            {/* eyes */}
            <rect x="13" y="14" width="2.5" height="3" fill="#2A1F18" />
            <rect x="20.5" y="14" width="2.5" height="3" fill="#2A1F18" />
            {/* cheek */}
            <circle cx="13" cy="19" r="1.4" fill="#e58aa0" opacity="0.7" />
            <circle cx="23" cy="19" r="1.4" fill="#e58aa0" opacity="0.7" />
          </svg>
        </div>
      </div>
    </button>
  )
}

export function Plaza({
  people,
  selectedKey,
  onMove,
  onTalkTo,
}: {
  people: PlazaPerson[]
  selectedKey?: string
  onMove: (x: number, y: number, facing: Facing) => void
  onTalkTo: (person: PlazaPerson) => void
}) {
  const me = useMemo(() => people.find(p => p.isMe), [people])
  const others = useMemo(() => people.filter(p => !p.isMe), [people])

  // Local authoritative position for my avatar; presence writes are throttled
  // fire-and-forget so we never fight the incoming subscription for our own row.
  const [myPos, setMyPos] = useState<{ x: number; y: number; facing: Facing }>(
    () => me?.spot ?? { x: 0.5, y: 0.5, facing: 'right' }
  )
  const myPosRef = useRef(myPos)
  myPosRef.current = myPos

  // Seed my position once from the backend spot (e.g. after reconnect), but
  // don't clobber live local movement afterwards.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !me) return
    seeded.current = true
    setMyPos(me.spot)
    myPosRef.current = me.spot
  }, [me])

  const keys = useRef(new Set<string>())
  const [walking, setWalking] = useState(false)
  const [nearHex, setNearHex] = useState<string | null>(null)
  const nearHexRef = useRef<string | null>(null)
  nearHexRef.current = nearHex

  const boxRef = useRef<HTMLDivElement>(null)
  const dims = useRef({ w: 1, h: 1 })

  // Keep current others reachable inside the rAF loop without re-binding it.
  const othersRef = useRef(others)
  othersRef.current = others
  const onTalkToRef = useRef(onTalkTo)
  onTalkToRef.current = onTalkTo
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  // Remote players: network updates arrive ~10/sec; interpolate between them.
  const remoteDisplayRef = useRef(new Map<string, { x: number; y: number; facing: Facing }>())
  const remoteTargetsRef = useRef(new Map<string, { x: number; y: number; facing: Facing }>())
  const [remoteSpots, setRemoteSpots] = useState(
    () => new Map<string, { x: number; y: number; facing: Facing }>()
  )

  useEffect(() => {
    const targets = new Map<string, { x: number; y: number; facing: Facing }>()
    for (const p of others) targets.set(p.hex, p.spot)
    remoteTargetsRef.current = targets

    const display = remoteDisplayRef.current
    for (const hex of [...display.keys()]) {
      if (!targets.has(hex)) display.delete(hex)
    }
    for (const [hex, spot] of targets) {
      if (!display.has(hex)) display.set(hex, spot)
    }
  }, [others])

  // Measure the plaza box for px-accurate proximity (the box isn't square).
  useEffect(() => {
    const measure = () => {
      const el = boxRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      dims.current = { w: r.width || 1, h: r.height || 1 }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Keyboard capture for movement + introduce.
  useEffect(() => {
    const MOVE_KEYS = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
    ])
    const talkNow = () => {
      const hex = nearHexRef.current
      if (!hex) return
      const target = othersRef.current.find(p => p.hex === hex)
      if (target) onTalkToRef.current(target)
    }
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (MOVE_KEYS.has(e.key)) {
        e.preventDefault()
        keys.current.add(e.key.toLowerCase())
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        talkNow()
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase())
    }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Movement + proximity loop.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSent = 0
    let sentX = -1
    let sentY = -1
    const clamp = (n: number) => (n < EDGE ? EDGE : n > 1 - EDGE ? 1 - EDGE : n)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let dx = 0
      let dy = 0
      const k = keys.current
      if (k.has('arrowleft') || k.has('a')) dx -= 1
      if (k.has('arrowright') || k.has('d')) dx += 1
      if (k.has('arrowup') || k.has('w')) dy -= 1
      if (k.has('arrowdown') || k.has('s')) dy += 1

      const moving = dx !== 0 || dy !== 0
      setWalking(prev => (prev === moving ? prev : moving))

      if (moving) {
        const len = Math.hypot(dx, dy) || 1
        const cur = myPosRef.current
        const nx = clamp(cur.x + (dx / len) * SPEED * dt)
        const ny = clamp(cur.y + (dy / len) * SPEED * dt)
        const facing: Facing = dx < 0 ? 'left' : dx > 0 ? 'right' : cur.facing
        const next = { x: nx, y: ny, facing }
        myPosRef.current = next
        setMyPos(next)

        // throttle backend writes; only when meaningfully moved
        if (
          now - lastSent > SEND_MS &&
          (Math.abs(nx - sentX) > 0.002 || Math.abs(ny - sentY) > 0.002)
        ) {
          lastSent = now
          sentX = nx
          sentY = ny
          onMoveRef.current(nx, ny, facing)
        }
      }

      // interpolate remote avatars toward latest presence targets
      const targets = remoteTargetsRef.current
      const display = remoteDisplayRef.current
      let remoteDirty = false
      const alpha = 1 - Math.exp(-LERP_SPEED * dt)

      for (const [hex, target] of targets) {
        const cur = display.get(hex) ?? target
        const dx = target.x - cur.x
        const dy = target.y - cur.y
        if (Math.abs(dx) < 0.00005 && Math.abs(dy) < 0.00005) {
          if (
            cur.x !== target.x ||
            cur.y !== target.y ||
            cur.facing !== target.facing
          ) {
            display.set(hex, target)
            remoteDirty = true
          }
          continue
        }
        display.set(hex, {
          x: cur.x + dx * alpha,
          y: cur.y + dy * alpha,
          facing: target.facing,
        })
        remoteDirty = true
      }
      if (remoteDirty) setRemoteSpots(new Map(display))

      // proximity: nearest other in screen px (use interpolated positions)
      const { w, h } = dims.current
      const cur = myPosRef.current
      let bestHex: string | null = null
      let bestD = NEAR_PX
      for (const p of othersRef.current) {
        const spot = display.get(p.hex) ?? p.spot
        const ddx = (spot.x - cur.x) * w
        const ddy = (spot.y - cur.y) * h
        const d = Math.hypot(ddx, ddy)
        if (d < bestD) {
          bestD = d
          bestHex = p.hex
        }
      }
      if (bestHex !== nearHexRef.current) setNearHex(bestHex)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const nearPerson = nearHex ? others.find(p => p.hex === nearHex) : undefined
  const nearSpot = nearPerson
    ? (remoteSpots.get(nearPerson.hex) ?? nearPerson.spot)
    : null

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden outline-none select-none"
      style={{
        borderRadius: 8,
        background: `url(${PLAZA_BG}) center / cover no-repeat,
          radial-gradient(60px 60px at 20% 30%, rgba(110,170,100,0.35), transparent 70%),
          radial-gradient(80px 80px at 78% 66%, rgba(110,170,100,0.3), transparent 70%),
          radial-gradient(70px 70px at 60% 22%, rgba(95,150,90,0.3), transparent 70%),
          repeating-linear-gradient(45deg, rgba(120,160,110,0.12) 0 22px, rgba(150,185,135,0.12) 22px 44px),
          radial-gradient(120% 90% at 50% 0%, #a9d18a, #8fc486 55%, #6fb56e 100%)`,
        boxShadow: 'inset 0 0 0 3px rgba(58,44,34,0.5), inset 0 0 60px rgba(40,28,16,0.35)',
      }}
    >
      {/* decorative village (paths, houses, trees, fountain) — below avatars */}
      <VillageScene />

      {others.map(p => {
        const spot = remoteSpots.get(p.hex) ?? p.spot
        return (
          <Avatar
            key={p.hex}
            person={{ ...p, spot }}
            walking={false}
            selected={!!p.pairKey && p.pairKey === selectedKey}
            onClick={() => onTalkTo(p)}
          />
        )
      })}

      {me && (
        <Avatar
          person={{ ...me, spot: myPos }}
          walking={walking}
          selected={false}
          onClick={() => {}}
        />
      )}

      {/* chat prompt floating above the nearest neighbour */}
      {nearPerson && nearSpot && (
        <div
          className="av-prompt pointer-events-auto absolute z-20"
          style={{
            left: `${nearSpot.x * 100}%`,
            top: `calc(${nearSpot.y * 100}% - 64px)`,
          }}
        >
          <button
            type="button"
            onClick={() => onTalkTo(nearPerson)}
            className="btn3d font-pixel whitespace-nowrap border-[3px] border-wood px-3 py-1.5 text-sm text-wood shadow-[0_3px_0_#2A1F18]"
            style={{
              background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
              borderRadius: 8,
            }}
          >
            ✦ Chat
            <span className="ml-1.5 opacity-70">↵</span>
          </button>
        </div>
      )}

      {/* controls hint */}
      <div
        className="font-pixel pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 text-[11px] text-wood"
        style={{
          background: 'rgba(251,243,218,0.85)',
          border: '2px solid var(--wood2)',
          borderRadius: 7,
        }}
      >
        ◀ ▲ ▼ ▶ / WASD to walk · stand by someone & press ↵ to chat
      </div>
    </div>
  )
}
