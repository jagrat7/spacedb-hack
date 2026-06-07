import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useAuth } from 'react-oidc-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Leaf, LeafSpray, Sparkles } from '@/components/cozy'
import { useOverlapHome } from '@/lib/overlap/backend'
import type { Event as OverlapEvent } from '@/module_bindings/types'
import { CozyField, ProfileBar, Signboard, inputClass } from './shared'

/** Pill marking an event as remote/online. */
function OnlineTag() {
  return (
    <span
      className="font-pixel inline-flex shrink-0 items-center gap-1 text-[10px]"
      style={{
        color: 'var(--wood)',
        background: 'var(--sage)',
        border: '2px solid var(--wood)',
        borderRadius: 5,
        padding: '0 6px',
      }}
    >
      <span
        className="blink inline-block"
        style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--saged)' }}
      />
      ONLINE
    </span>
  )
}

/** A single quest-board event card with an optional cover image. */
function EventCard({
  ev,
  badgeBg,
  footer,
  onClick,
}: {
  ev: OverlapEvent
  badgeBg: string
  footer: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="btn3d quest-card pinned relative overflow-hidden p-0 text-left"
    >
      {ev.imageUrl && (
        <div
          className="relative h-24 w-full overflow-hidden"
          style={{ borderBottom: '3px solid var(--wood)' }}
        >
          <img
            src={ev.imageUrl}
            alt={ev.name}
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
          />
          {ev.isOnline && (
            <div className="absolute left-2 top-2 z-10">
              <OnlineTag />
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-pixel text-base text-wood">{ev.name}</span>
          <span
            className="font-pixel shrink-0 text-[10px]"
            style={{
              color: 'var(--wood)',
              background: badgeBg,
              border: '2px solid var(--wood)',
              borderRadius: 5,
              padding: '0 6px',
            }}
          >
            {ev.code}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-xs font-semibold text-wood2">{footer}</span>
          {ev.isOnline && !ev.imageUrl && <OnlineTag />}
        </div>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Event lobby — join by code + my events                             *
 * ------------------------------------------------------------------ */
export function Lobby({ onEdit }: { onEdit: () => void }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const { myProfile, events, myEvents, joinEvent } = useOverlapHome()

  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')

  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    setJoinError('')
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    const ev = events.find(x => x.code === normalized)
    if (!ev) {
      setJoinError('No event with that code.')
      return
    }
    joinEvent({ code: normalized })
    navigate({ to: '/event/$eventId', params: { eventId: String(ev.id) } })
  }

  const demo = events.find(e => e.code === 'DEMO')

  const myEventIds = new Set(myEvents.map(e => String(e.id)))
  const otherEvents = events.filter(e => !myEventIds.has(String(e.id)))

  const enterEvent = (ev: { id: bigint; code: string }) => {
    joinEvent({ code: ev.code })
    navigate({ to: '/event/$eventId', params: { eventId: String(ev.id) } })
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-5">
      <Sparkles />

      {/* header */}
      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Signboard />
        <ProfileBar
          name={myProfile?.name ?? ''}
          role={myProfile?.goals ?? ''}
          avatarSeed={myProfile?.avatarSeed}
          onEdit={onEdit}
          onSignOut={() => auth.signoutRedirect()}
        />
      </header>

      {/* join by code */}
      <form onSubmit={onJoin} className="wood-panel relative mx-auto w-full max-w-md p-3">
        <div className="pointer-events-none absolute -left-3 -top-3 z-10">
          <LeafSpray size={30} />
        </div>
        <div className="pointer-events-none absolute -right-3 -top-3 z-10">
          <LeafSpray size={30} flip />
        </div>
        <div className="scroll-panel flex flex-col gap-3.5 px-5 py-5">
          <div className="flex items-center justify-center gap-2">
            <Leaf size={18} color="#86cf7c" />
            <span className="font-pixel text-base text-wood">JOIN BY CODE</span>
            <Leaf size={18} color="#86cf7c" flip />
          </div>
          <CozyField label="EVENT CODE">
            <Input
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                setJoinError('')
              }}
              placeholder="DEMO"
              className={`${inputClass} font-pixel text-2xl tracking-[0.4em]`}
            />
          </CozyField>
          {joinError && (
            <span className="font-sans text-sm font-bold text-pink">
              {joinError}
            </span>
          )}
          <Button
            type="submit"
            disabled={!code.trim()}
            className="btn3d font-pixel h-auto w-full border-4 border-wood py-3 text-base text-wood shadow-[0_5px_0_#2A1F18] disabled:opacity-60"
            style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
          >
            ▶ STEP INSIDE
          </Button>
          {demo && (
            <p className="text-center font-sans text-xs font-semibold text-wood2/70">
              Tip: try code <span className="font-pixel">DEMO</span> — {demo.name}.
            </p>
          )}
        </div>
      </form>

      {/* my events — quest board */}
      {myEvents.length > 0 && (
        <section className="wood-panel relative p-3 pb-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Leaf size={16} />
            <span className="font-pixel text-sm tracking-wider text-wood">
              YOUR EVENTS
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myEvents.map(ev => (
              <EventCard
                key={String(ev.id)}
                ev={ev}
                badgeBg="var(--goldl)"
                footer="Tap to enter the room"
                onClick={() =>
                  navigate({
                    to: '/event/$eventId',
                    params: { eventId: String(ev.id) },
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* discover — all public events you haven't joined yet */}
      {otherEvents.length > 0 && (
        <section className="wood-panel relative p-3 pb-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Leaf size={16} />
            <span className="font-pixel text-sm tracking-wider text-wood">
              DISCOVER EVENTS
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherEvents.map(ev => (
              <EventCard
                key={String(ev.id)}
                ev={ev}
                badgeBg="var(--parch2)"
                footer="Tap to join & enter"
                onClick={() => enterEvent(ev)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
