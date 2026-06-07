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

// Seeded NPC wander tuning. Seeded people (no live presence row) stroll around
// on their own, client-side, and freeze when a real visitor stands next to them
// so you can walk up and chat with their agent.
const WANDER_SPEED = 0.085 // gentle stroll, slower than the player
const WANDER_PAUSE_PX = 120 // freeze when the player is this close (in px)
const WANDER_MIN_X = 0.1
const WANDER_MAX_X = 0.9
const WANDER_MIN_Y = 0.16
const WANDER_MAX_Y = 0.86
const WANDER_ARRIVE = 0.012 // "close enough" to the target to stop & dwell
const WANDER_DWELL_MIN = 500 // ms paused at a target before picking a new one
const WANDER_DWELL_VAR = 2000 // + up to this many ms

// A rendered avatar position; `walking` drives the little walk-cycle animation.
type Disp = { x: number; y: number; facing: Facing; walking?: boolean }

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
  | 'fortune' // fortune teller's tent (interactive station)
  | 'info-desk' // event info desk (interactive station)
  | 'billboard' // shared community billboard (interactive station)

type VProp = { x: number; y: number; kind: PropKind; scale?: number }

// Layout: houses ring the edges, trees/bushes soften the corners, a fountain
// anchors the upper plaza, a market stall + lamps frame the lower walkway.
const PROPS: VProp[] = [
  // houses around the perimeter (three of the old houses/stall are now the
  // interactive stations below — see STATIONS)
  { x: 0.88, y: 0.18, kind: 'house-blue', scale: 1.1 },
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
  // lamps along the lower plaza
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

// Interactive stations: walk up and press ↵ (or click) to interact. Placed
// where the old props were so the layout stays familiar.
type StationKind = 'fortune' | 'info-desk' | 'billboard'
type Station = { id: StationKind; x: number; y: number; scale: number; label: string }
const STATIONS: Station[] = [
  { id: 'fortune', x: 0.5, y: 0.84, scale: 1.1, label: 'Fortune Teller' },
  { id: 'info-desk', x: 0.11, y: 0.2, scale: 1.05, label: 'Info Desk' },
  { id: 'billboard', x: 0.82, y: 0.82, scale: 1.35, label: 'Billboard' },
]

// Little fortunes the teller hands out, picked at random each visit.
const FORTUNES = [
  'A kindred spirit is closer than you think — keep wandering.',
  'The best conversation tonight starts with a question, not a pitch.',
  'Someone here shares your obscure obsession. Go find them.',
  'Say yes to the next introduction. It pays off.',
  'Your next collaborator is two avatars away.',
  'Lead with curiosity and the room opens up.',
  'A small spark now becomes a big project later.',
  'The quiet one by the fountain has the most to say.',
  'Trade a goal for a goal — you’ll both leave richer.',
  'Luck favors the attendee who speaks first.',
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
    case 'fortune':
      // a mystic's tent: purple canopy, star, glowing crystal-ball doorway
      return (
        <svg width={72 * scale} height={68 * scale} viewBox="0 0 72 68" shapeRendering="crispEdges">
          {/* tent body */}
          <path d="M10 28 L36 18 L62 28 L58 62 L14 62 Z" fill="#7a4f9e" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          {/* canopy */}
          <path d="M6 30 Q36 12 66 30 L60 30 Q36 18 12 30 Z" fill="#9b6bc4" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          {/* scalloped trim */}
          <g fill="#f6d469" stroke={stroke} strokeWidth="1">
            <circle cx="16" cy="31" r="3" />
            <circle cx="28" cy="30" r="3" />
            <circle cx="40" cy="30" r="3" />
            <circle cx="52" cy="31" r="3" />
          </g>
          {/* doorway with crystal ball */}
          <path d="M28 62 L28 40 Q36 34 44 40 L44 62 Z" fill="#2c1b40" stroke={stroke} strokeWidth="2" />
          <circle cx="36" cy="50" r="7" fill="#bfe7f5" stroke={stroke} strokeWidth="1.5" />
          <circle cx="34" cy="48" r="2" fill="#fff" opacity="0.85" />
          {/* finial star */}
          <path d="M36 4 l2 5 5 1 -4 4 1 5 -4 -3 -4 3 1 -5 -4 -4 5 -1 z" fill="#f6d469" stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
        </svg>
      )
    case 'info-desk':
      // a kiosk with an "i" sign and an awning
      return (
        <svg width={68 * scale} height={64 * scale} viewBox="0 0 68 64" shapeRendering="crispEdges">
          {/* sign post + board */}
          <rect x="31" y="20" width="6" height="14" fill="#6e4a2f" stroke={stroke} strokeWidth="1.5" />
          <circle cx="34" cy="12" r="11" fill="#4e9e63" stroke={stroke} strokeWidth="2" />
          <rect x="32" y="6" width="4" height="4" rx="1" fill="#fff" />
          <rect x="32" y="11" width="4" height="8" rx="1" fill="#fff" />
          {/* counter */}
          <rect x="8" y="34" width="52" height="24" rx="2" fill="#cda86a" stroke={stroke} strokeWidth="2" />
          <rect x="8" y="34" width="52" height="7" fill="#b5824e" stroke={stroke} strokeWidth="2" />
          {/* striped awning */}
          <rect x="6" y="28" width="56" height="8" rx="2" fill="#4e8fb0" stroke={stroke} strokeWidth="2" />
          <g fill="#eaf4fb">
            <rect x="14" y="28" width="8" height="8" />
            <rect x="30" y="28" width="8" height="8" />
            <rect x="46" y="28" width="8" height="8" />
          </g>
          <rect x="6" y="28" width="56" height="8" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          {/* front panel detail */}
          <rect x="16" y="44" width="14" height="10" rx="1.5" fill="#f6e9b0" stroke={stroke} strokeWidth="1.5" />
          <rect x="38" y="44" width="14" height="10" rx="1.5" fill="#f6e9b0" stroke={stroke} strokeWidth="1.5" />
        </svg>
      )
    case 'billboard':
      // a big roadside ad billboard: bright lit panel on steel posts, ringed
      // with marquee bulbs. The message is overlaid on the panel in the caller.
      return (
        <svg width={92 * scale} height={84 * scale} viewBox="0 0 116 104" shapeRendering="crispEdges">
          {/* support posts + cross brace */}
          <rect x="30" y="58" width="9" height="44" fill="#6b6f78" stroke={stroke} strokeWidth="2" />
          <rect x="77" y="58" width="9" height="44" fill="#6b6f78" stroke={stroke} strokeWidth="2" />
          <rect x="34" y="74" width="48" height="6" fill="#565a62" stroke={stroke} strokeWidth="1.5" />
          {/* footings */}
          <rect x="26" y="99" width="17" height="5" rx="1" fill="#3a2c22" stroke={stroke} strokeWidth="1.5" />
          <rect x="73" y="99" width="17" height="5" rx="1" fill="#3a2c22" stroke={stroke} strokeWidth="1.5" />
          {/* outer frame */}
          <rect x="4" y="4" width="108" height="58" rx="3" fill="#2f3b52" stroke={stroke} strokeWidth="2.5" />
          {/* header strip */}
          <rect x="9" y="8" width="98" height="11" rx="1.5" fill="#e0563f" stroke={stroke} strokeWidth="1.5" />
          {/* bright display panel */}
          <rect x="9" y="20" width="98" height="38" rx="1.5" fill="#fdfbf0" stroke={stroke} strokeWidth="2" />
          {/* marquee bulbs around the frame */}
          <g fill="#ffe07a" stroke={stroke} strokeWidth="0.6">
            {[10, 24, 38, 52, 66, 80, 94, 106].map(x => (
              <circle key={`t${x}`} cx={x} cy="4" r="2.4" />
            ))}
            {[10, 24, 38, 52, 66, 80, 94, 106].map(x => (
              <circle key={`b${x}`} cx={x} cy="62" r="2.4" />
            ))}
            {[12, 26, 40, 54].map(y => (
              <circle key={`l${y}`} cx="4" cy={y} r="2.4" />
            ))}
            {[12, 26, 40, 54].map(y => (
              <circle key={`r${y}`} cx="112" cy={y} r="2.4" />
            ))}
          </g>
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
  event,
  attendeeCount = 0,
  billboard,
  onSetBillboard,
}: {
  people: PlazaPerson[]
  selectedKey?: string
  onMove: (x: number, y: number, facing: Facing) => void
  onTalkTo: (person: PlazaPerson) => void
  // Info-desk content + shared billboard (the interactive stations).
  event?: { name: string; code: string; isOnline: boolean } | null
  attendeeCount?: number
  billboard?: { message: string; authorName: string } | null
  onSetBillboard?: (message: string) => void
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
  // Whether the plaza has keyboard focus — i.e. you're "in the game" and the
  // arrow/WASD controls are live. Drives the highlight border on the whole box.
  const [focused, setFocused] = useState(false)
  const [nearHex, setNearHex] = useState<string | null>(null)
  const nearHexRef = useRef<string | null>(null)
  nearHexRef.current = nearHex

  // Nearest interactive station (within range) + which of person/station is the
  // closest thing to interact with, so only one ↵ prompt shows at a time.
  const [nearStation, setNearStation] = useState<StationKind | null>(null)
  const nearStationRef = useRef<StationKind | null>(null)
  nearStationRef.current = nearStation
  const [primary, setPrimary] = useState<'person' | 'station' | null>(null)
  const primaryRef = useRef<'person' | 'station' | null>(null)
  primaryRef.current = primary

  // Which station modal is open (null = none), plus its transient UI state.
  const [openStation, setOpenStation] = useState<StationKind | null>(null)
  const openStationRef = useRef<StationKind | null>(null)
  openStationRef.current = openStation
  const [fortune, setFortune] = useState('')
  const [draft, setDraft] = useState('')

  const billboardRef = useRef(billboard)
  billboardRef.current = billboard

  // Open a station's modal, seeding its transient state. Held in a ref so the
  // once-bound keyboard listener always calls the latest closure.
  const openStationModal = (id: StationKind) => {
    if (id === 'fortune') {
      setFortune(FORTUNES[Math.floor(Math.random() * FORTUNES.length)])
    } else if (id === 'billboard') {
      setDraft(billboardRef.current?.message ?? '')
    }
    setOpenStation(id)
  }
  const openStationRefFn = useRef(openStationModal)
  openStationRefFn.current = openStationModal

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
  // `display` holds the rendered position for every other person (live + seeded).
  const remoteDisplayRef = useRef(new Map<string, Disp>())
  // Interpolation targets for *live* others only (their real backend presence).
  const remoteTargetsRef = useRef(new Map<string, { x: number; y: number; facing: Facing }>())
  // Wander targets for *seeded* NPCs (client-side stroll, not synced anywhere).
  const wanderRef = useRef(new Map<string, { tx: number; ty: number; pauseUntil: number }>())
  const [remoteSpots, setRemoteSpots] = useState(() => new Map<string, Disp>())

  useEffect(() => {
    // Live others are interpolated toward their authoritative backend spot.
    const targets = new Map<string, { x: number; y: number; facing: Facing }>()
    for (const p of others) if (p.live) targets.set(p.hex, p.spot)
    remoteTargetsRef.current = targets

    const display = remoteDisplayRef.current
    const allHexes = new Set(others.map(p => p.hex))
    for (const hex of [...display.keys()]) {
      if (!allHexes.has(hex)) display.delete(hex)
    }
    for (const p of others) {
      if (!display.has(p.hex)) display.set(p.hex, p.spot)
    }

    // Seeded NPCs (no live presence) get a client-side wander target.
    const wander = wanderRef.current
    const seeded = new Set(others.filter(p => !p.live).map(p => p.hex))
    for (const hex of [...wander.keys()]) {
      if (!seeded.has(hex)) wander.delete(hex)
    }
    for (const p of others) {
      if (p.live) wander.delete(p.hex)
      else if (!wander.has(p.hex))
        wander.set(p.hex, { tx: p.spot.x, ty: p.spot.y, pauseUntil: 0 })
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
    // Interact with whatever I'm standing next to: a station takes priority when
    // it's the closest thing, otherwise chat with the nearest person.
    const interactNow = () => {
      if (primaryRef.current === 'station') {
        const s = nearStationRef.current
        if (s) openStationRefFn.current(s)
        return
      }
      const hex = nearHexRef.current
      if (!hex) return
      const target = othersRef.current.find(p => p.hex === hex)
      if (target) onTalkToRef.current(target)
    }
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      // While a station modal is open, freeze movement; Esc closes it.
      if (openStationRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setOpenStation(null)
        }
        return
      }
      if (MOVE_KEYS.has(e.key)) {
        e.preventDefault()
        keys.current.add(e.key.toLowerCase())
      } else if (e.key === ' ') {
        // Space is the interact key (chat with a person / visit a stall).
        e.preventDefault()
        interactNow()
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

      // seeded NPCs wander on their own; they freeze & turn to face me when I
      // stand next to them, so I can walk up and chat with their agent.
      const meNow = myPosRef.current
      const { w: bw, h: bh } = dims.current
      const wander = wanderRef.current
      for (const [hex, st] of wander) {
        const cur = display.get(hex)
        if (!cur) continue
        const px = (cur.x - meNow.x) * bw
        const py = (cur.y - meNow.y) * bh
        if (Math.hypot(px, py) < WANDER_PAUSE_PX) {
          // paused next to the visitor — stop walking and turn toward them
          const facing: Facing = meNow.x < cur.x ? 'left' : 'right'
          if (cur.walking || cur.facing !== facing) {
            display.set(hex, { x: cur.x, y: cur.y, facing, walking: false })
            remoteDirty = true
          }
          continue
        }
        if (now < st.pauseUntil) {
          if (cur.walking) {
            display.set(hex, { ...cur, walking: false })
            remoteDirty = true
          }
          continue
        }
        const tdx = st.tx - cur.x
        const tdy = st.ty - cur.y
        if (Math.hypot(tdx, tdy) < WANDER_ARRIVE) {
          // arrived: dwell a beat, then head somewhere new
          st.pauseUntil = now + WANDER_DWELL_MIN + Math.random() * WANDER_DWELL_VAR
          st.tx = WANDER_MIN_X + Math.random() * (WANDER_MAX_X - WANDER_MIN_X)
          st.ty = WANDER_MIN_Y + Math.random() * (WANDER_MAX_Y - WANDER_MIN_Y)
          if (cur.walking) {
            display.set(hex, { ...cur, walking: false })
            remoteDirty = true
          }
          continue
        }
        const tlen = Math.hypot(tdx, tdy) || 1
        const nx = clamp(cur.x + (tdx / tlen) * WANDER_SPEED * dt)
        const ny = clamp(cur.y + (tdy / tlen) * WANDER_SPEED * dt)
        const facing: Facing =
          tdx < -0.0008 ? 'left' : tdx > 0.0008 ? 'right' : cur.facing
        display.set(hex, { x: nx, y: ny, facing, walking: true })
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

      // nearest interactive station (fixed positions)
      let bestStation: StationKind | null = null
      let bestSD = NEAR_PX
      for (const s of STATIONS) {
        const ddx = (s.x - cur.x) * w
        const ddy = (s.y - cur.y) * h
        const d = Math.hypot(ddx, ddy)
        if (d < bestSD) {
          bestSD = d
          bestStation = s.id
        }
      }
      if (bestStation !== nearStationRef.current) setNearStation(bestStation)

      // whichever is closer wins the single ↵ prompt
      const nextPrimary: 'person' | 'station' | null =
        bestHex && (bestStation === null || bestD <= bestSD)
          ? 'person'
          : bestStation
            ? 'station'
            : null
      if (nextPrimary !== primaryRef.current) setPrimary(nextPrimary)

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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="relative h-full w-full overflow-hidden outline-none select-none transition-shadow duration-200"
      style={{
        borderRadius: 8,
        background: `url(${PLAZA_BG}) center / cover no-repeat,
          radial-gradient(60px 60px at 20% 30%, rgba(110,170,100,0.35), transparent 70%),
          radial-gradient(80px 80px at 78% 66%, rgba(110,170,100,0.3), transparent 70%),
          radial-gradient(70px 70px at 60% 22%, rgba(95,150,90,0.3), transparent 70%),
          repeating-linear-gradient(45deg, rgba(120,160,110,0.12) 0 22px, rgba(150,185,135,0.12) 22px 44px),
          radial-gradient(120% 90% at 50% 0%, #a9d18a, #8fc486 55%, #6fb56e 100%)`,
        // When focused ("in the game"), wrap the whole component in a glowing
        // gold ring so it's obvious the keyboard controls are live.
        boxShadow: focused
          ? '0 0 0 3px var(--gold), 0 0 0 6px rgba(235,166,58,0.35), 0 0 22px rgba(235,166,58,0.55), inset 0 0 0 3px rgba(58,44,34,0.5), inset 0 0 60px rgba(40,28,16,0.35)'
          : '0 0 0 2px rgba(58,44,34,0.35), inset 0 0 0 3px rgba(58,44,34,0.5), inset 0 0 60px rgba(40,28,16,0.35)',
      }}
    >
      {/* decorative village (paths, houses, trees, fountain) — below avatars */}
      <VillageScene />

      {/* interactive stations: fortune teller, info desk, billboard */}
      {STATIONS.map(s => {
        const isNear = primary === 'station' && nearStation === s.id
        return (
          <div
            key={s.id}
            className="absolute z-[5] flex flex-col items-center"
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <button
              type="button"
              onClick={() => openStationModal(s.id)}
              className="group flex flex-col items-center"
              style={{ lineHeight: 0, filter: 'drop-shadow(0 3px 2px rgba(40,28,16,0.28))' }}
              title={s.label}
            >
              {s.id !== 'billboard' && (
                <span
                  className="av-prompt font-pixel mb-1 whitespace-nowrap px-1.5 py-0.5 text-[10px] leading-none"
                  style={{
                    color: 'var(--wood)',
                    background: isNear ? 'var(--goldl)' : 'rgba(251,243,218,0.9)',
                    border: `2px solid ${isNear ? 'var(--wood)' : 'var(--wood2)'}`,
                    borderRadius: 6,
                    boxShadow: '0 2px 0 rgba(42,31,24,0.4)',
                  }}
                >
                  {s.label}
                </span>
              )}
              {s.id === 'billboard' ? (
                // The ad billboard carries the live message on its panel, so
                // anyone walking past reads it without interacting.
                <span className="relative block" style={{ lineHeight: 0 }}>
                  <VillageProp kind={s.id} scale={s.scale} />
                  {/* header label on the red strip */}
                  <span
                    className="font-pixel absolute flex items-center justify-center"
                    style={{
                      left: '7.8%',
                      top: '7.7%',
                      width: '84.5%',
                      height: '10.6%',
                      color: '#fff',
                      fontSize: 9,
                      letterSpacing: 0.4,
                      textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                    }}
                  >
                    📣 NOTICE BOARD
                  </span>
                  {/* the live message on the bright panel */}
                  <span
                    className="absolute flex items-center justify-center"
                    style={{
                      left: '7.8%',
                      top: '19.2%',
                      width: '84.5%',
                      height: '36.5%',
                      padding: '3px',
                    }}
                  >
                    <span
                      className="font-sans text-center"
                      style={{
                        color: billboard?.message ? '#1d2536' : '#9a8f7e',
                        fontWeight: 800,
                        fontStyle: billboard?.message ? 'normal' : 'italic',
                        fontSize: 12,
                        lineHeight: 1.12,
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {billboard?.message || 'Post your note here!'}
                    </span>
                  </span>
                </span>
              ) : (
                <VillageProp kind={s.id} scale={s.scale} />
              )}
            </button>
            {isNear && (
              <span
                className="av-prompt btn3d font-pixel pointer-events-none mt-1 whitespace-nowrap border-2 border-wood px-2.5 py-1 text-[11px] text-wood shadow-[0_2px_0_#2A1F18]"
                style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)', borderRadius: 6 }}
              >
                ✦ Visit
                <span className="ml-1 opacity-60">Space</span>
              </span>
            )}
          </div>
        )
      })}

      {others.map(p => {
        const disp = remoteSpots.get(p.hex)
        const spot = disp ?? p.spot
        return (
          <Avatar
            key={p.hex}
            person={{ ...p, spot }}
            walking={disp?.walking ?? false}
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

      {/* chat prompt below the nearest neighbour — name stays on avatar above */}
      {primary === 'person' && nearPerson && nearSpot && (
        <div
          className="pointer-events-auto absolute z-20 -translate-x-1/2"
          style={{
            left: `${nearSpot.x * 100}%`,
            top: `calc(${nearSpot.y * 100}% + 36px)`,
          }}
        >
          <button
            type="button"
            onClick={() => onTalkTo(nearPerson)}
            className="av-prompt btn3d font-pixel whitespace-nowrap border-2 border-wood px-2.5 py-1 text-[11px] text-wood shadow-[0_2px_0_#2A1F18]"
            style={{
              background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
              borderRadius: 6,
            }}
          >
            ✦ Chat
            <span className="ml-1 opacity-60">Space</span>
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
        ◀ ▲ ▼ ▶ / WASD to walk · press Space to chat or visit a stall
      </div>

      {/* station modal overlay */}
      {openStation && (
        <StationModal
          kind={openStation}
          event={event}
          attendeeCount={attendeeCount}
          billboard={billboard}
          fortune={fortune}
          draft={draft}
          setDraft={setDraft}
          canPost={!!onSetBillboard}
          onReroll={() =>
            setFortune(FORTUNES[Math.floor(Math.random() * FORTUNES.length)])
          }
          onPost={() => {
            const text = draft.trim()
            if (!text || !onSetBillboard) return
            onSetBillboard(text)
            setOpenStation(null)
          }}
          onClose={() => setOpenStation(null)}
        />
      )}
    </div>
  )
}

/** Full-plaza overlay for an interaction station. */
function StationModal({
  kind,
  event,
  attendeeCount,
  billboard,
  fortune,
  draft,
  setDraft,
  canPost,
  onReroll,
  onPost,
  onClose,
}: {
  kind: StationKind
  event?: { name: string; code: string; isOnline: boolean } | null
  attendeeCount: number
  billboard?: { message: string; authorName: string } | null
  fortune: string
  draft: string
  setDraft: (v: string) => void
  canPost: boolean
  onReroll: () => void
  onPost: () => void
  onClose: () => void
}) {
  const title =
    kind === 'fortune'
      ? '🔮 The Fortune Teller'
      : kind === 'info-desk'
        ? 'ℹ️ Info Desk'
        : '📌 Community Billboard'

  return (
    <div
      className="pop absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(40,28,16,0.55)' }}
      onClick={onClose}
    >
      <div
        className="wood-panel rise flex w-full max-w-sm flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{
            background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
            borderBottom: '4px solid var(--wood)',
          }}
        >
          <span className="font-pixel text-base text-wood">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="btn3d font-pixel size-7 shrink-0 border-2 border-wood text-wood shadow-[0_2px_0_#2A1F18]"
            style={{ background: 'var(--parch2)', borderRadius: 6 }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5" style={{ background: 'var(--parch)' }}>
          {kind === 'fortune' && (
            <>
              <p
                className="text-center font-sans text-base font-semibold text-wood"
                style={{
                  padding: '16px 14px',
                  background: 'linear-gradient(180deg,#FFF2CC,#FBE3A0)',
                  border: '3px solid var(--wood)',
                  borderRadius: 12,
                  boxShadow: '0 3px 0 #2A1F18',
                }}
              >
                “{fortune}”
              </p>
              <button
                type="button"
                onClick={onReroll}
                className="btn3d font-pixel h-auto w-full border-[3px] border-wood py-2.5 text-base text-wood shadow-[0_4px_0_#2A1F18]"
                style={{ background: 'var(--goldl)' }}
              >
                🔮 Ask again
              </button>
            </>
          )}

          {kind === 'info-desk' && (
            <div className="flex flex-col gap-2.5">
              <InfoRow label="Event" value={event?.name ?? '—'} />
              <InfoRow label="Code" value={event?.code ?? '—'} />
              <InfoRow
                label="Type"
                value={event ? (event.isOnline ? 'Online' : 'In-person') : '—'}
              />
              <InfoRow label="Attendees" value={String(attendeeCount)} />
              <p className="mt-1 font-sans text-sm font-semibold text-wood2">
                Walk up to anyone and press Space to start a chat. Visit the
                billboard to leave a note for the room.
              </p>
            </div>
          )}

          {kind === 'billboard' && (
            <div className="flex flex-col gap-3">
              <div
                className="font-sans text-base font-semibold text-wood"
                style={{
                  padding: '14px',
                  background: '#FBF3DA',
                  border: '3px solid var(--wood)',
                  borderRadius: 12,
                  boxShadow: '0 3px 0 #2A1F18',
                  minHeight: 64,
                }}
              >
                {billboard?.message ? (
                  <>
                    <span>{billboard.message}</span>
                    <span className="mt-2 block font-pixel text-xs text-wood2">
                      — {billboard.authorName}
                    </span>
                  </>
                ) : (
                  <span className="text-wood2">
                    The board is empty. Be the first to post!
                  </span>
                )}
              </div>
              {canPost ? (
                <>
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value.slice(0, 140))}
                    placeholder="Leave a note for the whole room…"
                    rows={3}
                    className="resize-none font-sans text-base font-semibold text-wood focus-visible:outline-none"
                    style={{
                      padding: '10px 12px',
                      background: '#fffaf0',
                      border: '3px solid var(--wood)',
                      borderRadius: 10,
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-xs text-wood2">
                      {draft.length}/140
                    </span>
                    <button
                      type="button"
                      onClick={onPost}
                      disabled={!draft.trim()}
                      className="btn3d font-pixel h-auto border-[3px] border-wood px-5 py-2 text-base text-wood shadow-[0_4px_0_#2A1F18]"
                      style={{
                        background: draft.trim() ? 'var(--gold)' : '#d8c290',
                        opacity: draft.trim() ? 1 : 0.7,
                      }}
                    >
                      📌 Post
                    </button>
                  </div>
                </>
              ) : (
                <p className="font-sans text-sm font-semibold text-wood2">
                  Join the event to post to the billboard.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-pixel text-sm text-wood2">{label}</span>
      <span className="font-pixel min-w-0 truncate text-sm text-wood">{value}</span>
    </div>
  )
}
