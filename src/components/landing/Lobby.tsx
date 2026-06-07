import { useNavigate } from '@tanstack/react-router'
import { useAuth } from 'react-oidc-context'
import { Flower, Leaf, LeafSpray, Sparkles } from '@/components/cozy'
import { useOverlapHome } from '@/lib/overlap/backend'
import type { Event as OverlapEvent } from '@/module_bindings/types'
import { CozyBtn, ProfileBar, Ribbon, Signboard } from './shared'

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
  actionLabel,
  actionVariant = 'gold',
  onAction,
}: {
  ev: OverlapEvent
  badgeBg: string
  actionLabel: string
  actionVariant?: 'gold' | 'sage' | 'parch'
  onAction: () => void
}) {
  return (
    <div className="quest-card pinned relative flex flex-col overflow-hidden">
      {ev.imageUrl && (
        <div
          className="relative h-24 w-full shrink-0 overflow-hidden"
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
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
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
        {ev.isOnline && !ev.imageUrl && <OnlineTag />}
        <CozyBtn
          variant={actionVariant}
          className="mt-auto w-full py-2 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </CozyBtn>
      </div>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 px-4 py-2"
      style={{
        background: 'var(--parch2)',
        border: '2px solid var(--wood)',
        borderRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      <span className="font-pixel text-xl text-wood">{value}</span>
      <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-wood2">
        {label}
      </span>
    </div>
  )
}

function EmptyBoard({ message }: { message: string }) {
  return (
    <div className="scroll-panel flex flex-col items-center gap-3 px-6 py-8 text-center">
      <Flower size={36} />
      <p className="max-w-xs font-sans text-sm font-semibold leading-relaxed text-wood2">
        {message}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Event lobby — welcome hero + my events + discover                    *
 * ------------------------------------------------------------------ */
export function Lobby({ onEdit }: { onEdit: () => void }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const { myProfile, events, myEvents, joinEvent } = useOverlapHome()

  const myEventIds = new Set(myEvents.map(e => String(e.id)))
  const otherEvents = events.filter(e => !myEventIds.has(String(e.id)))
  const firstName = myProfile?.name.split(/\s+/)[0] ?? 'friend'
  const liveCount = events.filter(e => e.isOnline).length

  // Resume a room you're already in; otherwise nudge toward the first
  // discoverable event (DEMO first if present).
  const resume = myEvents[0]
  const discover = otherEvents.find(e => e.code === 'DEMO') ?? otherEvents[0]
  const cta = resume
    ? { ev: resume, kicker: 'JUMP BACK IN', join: false }
    : discover
      ? { ev: discover, kicker: 'START HERE', join: true }
      : null

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

      {/* welcome hero */}
      <section className="wood-panel relative mx-auto w-full p-3">
        <div className="pointer-events-none absolute -left-3 -top-3 z-10">
          <LeafSpray size={30} />
        </div>
        <div className="pointer-events-none absolute -right-3 -top-3 z-10">
          <LeafSpray size={30} flip />
        </div>
        <div className="scroll-panel flex flex-col items-center gap-4 px-5 py-6">
          <Ribbon>THE LOBBY</Ribbon>
          <p className="max-w-md text-center font-sans text-sm font-semibold leading-relaxed text-wood2">
            Welcome back, <span className="font-pixel text-wood">{firstName}</span>.
            Drop into a plaza and meet the people who overlap with your vibe.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <StatPill label="your rooms" value={myEvents.length} />
            <StatPill label="to explore" value={otherEvents.length} />
            {liveCount > 0 && <StatPill label="live now" value={liveCount} />}
          </div>
          {cta && (
            <div className="flex flex-col items-center gap-2">
              <span className="font-pixel text-[10px] tracking-wider text-wood2">
                {cta.kicker}
              </span>
              <CozyBtn
                variant="gold"
                className="px-5 py-2.5 text-sm"
                onClick={() =>
                  cta.join
                    ? enterEvent(cta.ev)
                    : navigate({
                        to: '/event/$eventId',
                        params: { eventId: String(cta.ev.id) },
                      })
                }
              >
                ▶ {cta.ev.name}
              </CozyBtn>
            </div>
          )}
        </div>
      </section>

      {/* my events — quest board */}
      <section className="wood-panel relative p-3 pb-4">
        <div className="mb-3 flex items-center gap-2 px-1">
          <Leaf size={16} />
          <span className="font-pixel text-sm tracking-wider text-wood">
            YOUR EVENTS
          </span>
        </div>
        {myEvents.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myEvents.map(ev => (
              <EventCard
                key={String(ev.id)}
                ev={ev}
                badgeBg="var(--goldl)"
                actionLabel="▶ ENTER"
                actionVariant="sage"
                onAction={() =>
                  navigate({
                    to: '/event/$eventId',
                    params: { eventId: String(ev.id) },
                  })
                }
              />
            ))}
          </div>
        ) : (
          <EmptyBoard message="You haven't joined any events yet — browse Discover below and hit Join on an event." />
        )}
      </section>

      {/* discover — all public events you haven't joined yet */}
      <section className="wood-panel relative p-3 pb-4">
        <div className="mb-3 flex items-center gap-2 px-1">
          <Leaf size={16} />
          <span className="font-pixel text-sm tracking-wider text-wood">
            DISCOVER EVENTS
          </span>
        </div>
        {otherEvents.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherEvents.map(ev => (
              <EventCard
                key={String(ev.id)}
                ev={ev}
                badgeBg="var(--parch2)"
                actionLabel="▶ JOIN"
                onAction={() => enterEvent(ev)}
              />
            ))}
          </div>
        ) : (
          <EmptyBoard message="You're in every event on the board — nice! Head to Your Events above to re-enter a room." />
        )}
      </section>
    </div>
  )
}
