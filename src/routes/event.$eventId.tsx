import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Leaf, LeafSpray, Sparkles, Star } from '@/components/cozy'
import {
  useEventRoom,
  normHex,
  avatarUrl,
  type PlazaPerson,
  type IncomingRing,
  type ActiveRing,
} from '@/lib/overlap/backend'
import { Portrait, initialsOf } from '@/components/cozy'
import { useRingSound } from '@/lib/overlap/ring-sound'
import { ChatPanel } from '@/components/event/ChatPanel'
import { MatchCard } from '@/components/event/MatchCard'
import { Plaza } from '@/components/event/Plaza'

export const Route = createFileRoute('/event/$eventId')({
  component: EventRoom,
})

function EventRoom() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const {
    event,
    myProfile,
    others,
    messagesByPair,
    onSendChat,
    begin,
    reRun,
    mySideFor,
    people,
    move,
    billboard,
    setBillboard,
    openPlazaChat,
    autoGreetPlaza,
    onSendDirectChat,
    ringByHex,
    incomingRings,
    activeRing,
    sendRing,
    acceptRing,
    dismissRing,
  } = useEventRoom(eventId)

  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const [mode, setMode] = useState<'pre' | 'event'>('pre')
  const [mobilePane, setMobilePane] = useState<'main' | 'chat'>('main')

  // In-person beacon: while a ring is accepted, both phones play the ring tone.
  // Scoped to the offline START EVENT view per the feature spec.
  const inPersonStartEvent = mode === 'event' && !event?.isOnline
  useRingSound(inPersonStartEvent && !!activeRing)

  useEffect(() => {
    if (!selectedKey && others.length) setSelectedKey(others[0].pairKey)
  }, [others, selectedKey])

  // Auto-start a chat with an agent the moment you join the online plaza: pick
  // the top seeded NPC, open its chat, and let its agent greet you first — so
  // you arrive to a conversation already in motion instead of an empty panel.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current) return
    if (mode !== 'event' || !event?.isOnline || !myProfile) return
    const npc = others.find(o => !o.live)
    if (!npc) return
    autoStarted.current = true
    autoGreetPlaza(npc)
    setSelectedKey(npc.pairKey)
  }, [mode, event, myProfile, others, autoGreetPlaza])

  const selected = useMemo(
    () => others.find(o => o.pairKey === selectedKey),
    [others, selectedKey]
  )

  const openChat = (pairKey: string) => {
    setSelectedKey(pairKey)
    setMode('pre')
    setMobilePane('chat')
  }

  const talkInPlaza = (person: PlazaPerson) => {
    if (!person.pairKey) return
    const other = others.find(o => o.pairKey === person.pairKey)
    if (other) openPlazaChat(other)
    setSelectedKey(person.pairKey)
    setMobilePane('chat')
  }

  if (!event) {
    return (
      <div className="relative z-10 grid min-h-screen place-items-center p-4">
        <div
          className="frame rise p-8 text-center"
          style={{ ['--frame-bg' as string]: 'var(--parch)' }}
        >
          <p className="font-pixel text-lg text-wood">
            This event has wandered off…
          </p>
          <Button
            onClick={() => navigate({ to: '/' })}
            className="btn3d font-pixel mt-4 border-[3px] border-wood text-wood shadow-[0_3px_0_#2A1F18]"
            style={{ background: 'var(--goldl)' }}
          >
            ◀ Back to lobby
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative z-10 mx-auto flex h-[100dvh] max-w-6xl flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      <Sparkles />

      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => navigate({ to: '/' })}
          className="btn3d wood-panel flex w-fit items-center gap-2.5 px-4 py-2.5 text-wood"
        >
          <span className="font-pixel text-lg text-wood">◀</span>
          <span
            className="font-pixel text-xl tracking-wide text-wood"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
          >
            vibe-check
          </span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Button
            onClick={() => {
              setMode(m => (m === 'pre' ? 'event' : 'pre'))
              setMobilePane('main')
            }}
            className="btn3d font-pixel h-auto shrink-0 border-[3px] border-wood px-3 py-2 text-xs text-wood shadow-[0_4px_0_#2A1F18] sm:px-5 sm:py-2.5 sm:text-sm"
            style={{
              background:
                mode === 'event'
                  ? 'var(--goldl)'
                  : 'linear-gradient(180deg,#8fd99b,#4e9e63)',
            }}
          >
            {mode === 'event' ? '◀ PRE-EVENT' : '✦ START EVENT'}
          </Button>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <div className="wood-panel flex min-w-0 items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5">
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.name}
                  loading="lazy"
                  className="h-7 w-7 shrink-0 object-cover"
                  style={{ borderRadius: 6, border: '2px solid var(--wood)' }}
                  draggable={false}
                />
              ) : (
                <span
                  className="blink inline-block shrink-0"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background: '#4e9e63',
                    border: '2px solid var(--wood)',
                  }}
                />
              )}
              <span className="font-pixel min-w-0 truncate text-xs text-wood sm:text-sm">
                {event.name} · {event.code}
              </span>
              {event.isOnline && (
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
              )}
            </div>
            <div className="absolute -right-3 -top-3 hidden sm:block">
              <LeafSpray size={28} flip />
            </div>
          </div>
        </div>
      </header>

      {mode === 'event' ? (
        event.isOnline ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-5">
            <MobilePaneToggle
              mainLabel="✦ PLAZA"
              chatLabel="✦ CHAT"
              pane={mobilePane}
              onChange={setMobilePane}
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_1fr] lg:gap-5">
            <div
              className={`min-h-0 pb-0 lg:pb-2 ${mobilePane === 'chat' ? 'hidden lg:block' : 'block'}`}
            >
              <div className="wood-panel rise flex h-full min-h-[min(52dvh,28rem)] flex-col overflow-hidden lg:min-h-0">
                <div
                  className="flex shrink-0 items-center justify-center gap-2 px-5 py-3"
                  style={{
                    borderBottom: '3px solid rgba(150,105,45,0.4)',
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))',
                  }}
                >
                  <Leaf size={16} color="#4e9e63" />
                  <span
                    className="font-pixel text-lg tracking-wide text-wood"
                    style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
                  >
                    ✦ THE PLAZA ✦
                  </span>
                  <Leaf size={16} color="#4e9e63" flip />
                </div>
                <div className="min-h-0 flex-1 p-3">
                  <Plaza
                    people={people}
                    selectedKey={selectedKey}
                    onMove={move}
                    onTalkTo={talkInPlaza}
                    event={{
                      name: event.name,
                      code: event.code,
                      isOnline: event.isOnline,
                    }}
                    attendeeCount={people.length}
                    billboard={
                      billboard
                        ? {
                            message: billboard.message,
                            authorName: billboard.authorName,
                          }
                        : null
                    }
                    onSetBillboard={setBillboard}
                  />
                </div>
              </div>
            </div>
            <div
              className={`min-h-0 pb-0 lg:pb-2 ${mobilePane === 'main' ? 'hidden lg:block' : 'block'} ${selected && myProfile ? 'h-full min-h-[min(52dvh,28rem)] lg:min-h-0' : ''}`}
            >
              {selected && myProfile ? (
                selected.live ? (
                  <ChatPanel
                    key={selected.pairKey}
                    other={selected.profile}
                    me={myProfile}
                    mySide={mySideFor(selected.otherHex)}
                    streaming={false}
                    humanOnly
                    transcript={messagesByPair.get(selected.pairKey) ?? []}
                    onSend={text => onSendDirectChat(selected.pairKey, text)}
                  />
                ) : (
                  // Seeded NPC: no human on the other side, so their agent replies.
                  <ChatPanel
                    key={selected.pairKey}
                    other={selected.profile}
                    me={myProfile}
                    mySide={mySideFor(selected.otherHex)}
                    streaming={false}
                    autoDrive
                    transcript={messagesByPair.get(selected.pairKey) ?? []}
                    onSend={text =>
                      onSendChat(
                        selected.pairKey,
                        selected.otherHex,
                        selected.profile,
                        text
                      )
                    }
                  />
                )
              ) : (
                <div className="wood-panel flex h-full min-h-[min(52dvh,28rem)] items-center justify-center lg:min-h-0">
                  <p className="font-pixel px-4 text-center text-base text-wood2">
                    Walk up to someone & chat ✦
                  </p>
                </div>
              )}
            </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
          <RingAlerts
            incomingRings={incomingRings}
            activeRing={activeRing}
            onAccept={acceptRing}
            onDismiss={dismissRing}
          />
          <div className="wood-panel rise flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex shrink-0 items-center justify-center gap-2 px-5 py-3"
              style={{
                borderBottom: '3px solid rgba(150,105,45,0.4)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))',
              }}
            >
              <Leaf size={16} color="#4e9e63" />
              <span
                className="font-pixel text-lg tracking-wide text-wood"
                style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
              >
                ✦ WHO TO TALK TO ✦
              </span>
              <Leaf size={16} color="#4e9e63" flip />
            </div>
            <div className="cscroll min-h-0 flex-1 overflow-y-auto p-5">
              {others.length === 0 ? (
                <div className="m-auto text-center">
                  <div className="bob mx-auto mb-3 w-fit">
                    <Star size={26} color="var(--goldd)" fill="var(--gold)" />
                  </div>
                  <p className="font-pixel text-base text-wood2">
                    Your agent is heading out…
                  </p>
                  <p className="mt-1 font-sans text-sm font-semibold text-wood2/70">
                    Open this app as another attendee to see matching.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 pt-3 sm:[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                  {others.map((o, i) => (
                    <div key={o.pairKey} className="relative">
                      <div
                        className="font-pixel absolute -left-2 -top-3 z-20 grid place-items-center"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 99,
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'var(--wood)',
                          background:
                            i === 0
                              ? 'radial-gradient(circle at 38% 32%, #FBE6A8, #EBA63A 70%)'
                              : 'linear-gradient(160deg,#fbf3da,#e7d09a)',
                          border: '3px solid var(--wood)',
                          boxShadow: '0 3px 0 #2A1F18',
                        }}
                      >
                        {i + 1}
                      </div>
                      <MatchCard
                        other={o.profile}
                        match={o.match}
                        selected={o.pairKey === selectedKey}
                        onOpen={() => openChat(o.pairKey)}
                        onBegin={() => {
                          begin(o)
                          openChat(o.pairKey)
                        }}
                        onReRun={() => reRun(o)}
                        ring={{
                          state: ringByHex.get(normHex(o.otherHex))?.state ?? 'idle',
                          onRing: () => sendRing(o),
                          onAccept: () => {
                            const r = ringByHex.get(normHex(o.otherHex))
                            if (r) acceptRing(r.rkey)
                          },
                          onStop: () => {
                            const r = ringByHex.get(normHex(o.otherHex))
                            if (r) dismissRing(r.rkey)
                          },
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
        )
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-5">
        <MobilePaneToggle
          mainLabel="✦ QUEST BOARD"
          chatLabel="✦ CHAT"
          pane={mobilePane}
          onChange={setMobilePane}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_1fr] lg:gap-5">
        <div
          className={`min-h-0 pb-0 lg:pb-2 ${mobilePane === 'chat' ? 'hidden lg:block' : 'block'}`}
        >
          <div className="wood-panel rise flex h-full min-h-[min(52dvh,28rem)] flex-col overflow-hidden lg:min-h-0">
            <div
              className="flex shrink-0 items-center justify-center gap-2 px-5 py-3"
              style={{
                borderBottom: '3px solid rgba(150,105,45,0.4)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))',
              }}
            >
              <Leaf size={16} color="#4e9e63" />
              <span
                className="font-pixel text-lg tracking-wide text-wood"
                style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
              >
                ✦ QUEST BOARD ✦
              </span>
              <Leaf size={16} color="#4e9e63" flip />
            </div>
            <div className="cscroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              {others.length === 0 ? (
                <div className="m-auto text-center">
                  <div className="bob mx-auto mb-3 w-fit">
                    <Star size={26} color="var(--goldd)" fill="var(--gold)" />
                  </div>
                  <p className="font-pixel text-base text-wood2">
                    Your agent is heading out…
                  </p>
                  <p className="mt-1 font-sans text-sm font-semibold text-wood2/70">
                    Open this app as another attendee to see matching.
                  </p>
                </div>
              ) : (
                others.map(o => (
                  <MatchCard
                    key={o.pairKey}
                    other={o.profile}
                    match={o.match}
                    selected={o.pairKey === selectedKey}
                    onOpen={() => openChat(o.pairKey)}
                    onBegin={() => {
                      begin(o)
                      openChat(o.pairKey)
                    }}
                    onReRun={() => reRun(o)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div
          className={`min-h-0 pb-0 lg:pb-2 ${mobilePane === 'main' ? 'hidden lg:block' : 'block'} ${selected && myProfile ? 'h-full min-h-[min(52dvh,28rem)] lg:min-h-0' : ''}`}
        >
          {selected && myProfile ? (
            <ChatPanel
              key={selected.pairKey}
              other={selected.profile}
              me={myProfile}
              mySide={mySideFor(selected.otherHex)}
              streaming={selected.match?.status === 'streaming'}
              transcript={messagesByPair.get(selected.pairKey) ?? []}
              onSend={text =>
                onSendChat(
                  selected.pairKey,
                  selected.otherHex,
                  selected.profile,
                  text
                )
              }
            />
          ) : (
            <div className="wood-panel flex h-full min-h-[min(52dvh,28rem)] items-center justify-center lg:min-h-0">
              <p className="font-pixel px-4 text-center text-base text-wood2">
                Pick a spirit to watch the chat ✦
              </p>
            </div>
          )}
        </div>
        </div>
      </div>
      )}
    </div>
  )
}

function MobilePaneToggle({
  mainLabel,
  chatLabel,
  pane,
  onChange,
}: {
  mainLabel: string
  chatLabel: string
  pane: 'main' | 'chat'
  onChange: (pane: 'main' | 'chat') => void
}) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 lg:hidden">
      <button
        type="button"
        onClick={() => onChange('main')}
        className="btn3d font-pixel border-[3px] border-wood px-3 py-2 text-xs text-wood shadow-[0_3px_0_#2A1F18]"
        style={{
          background:
            pane === 'main'
              ? 'var(--goldl)'
              : 'linear-gradient(180deg,#fbf3da,#e7d09a)',
        }}
      >
        {mainLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('chat')}
        className="btn3d font-pixel border-[3px] border-wood px-3 py-2 text-xs text-wood shadow-[0_3px_0_#2A1F18]"
        style={{
          background:
            pane === 'chat'
              ? 'var(--goldl)'
              : 'linear-gradient(180deg,#fbf3da,#e7d09a)',
        }}
      >
        {chatLabel}
      </button>
    </div>
  )
}

// Ring notifications shown above the in-person match board: pending rings aimed
// at me (accept/decline) and the live accepted ring (with a "found them" stop).
function RingAlerts({
  incomingRings,
  activeRing,
  onAccept,
  onDismiss,
}: {
  incomingRings: IncomingRing[]
  activeRing?: ActiveRing
  onAccept: (rkey: string) => void
  onDismiss: (rkey: string) => void
}) {
  if (!activeRing && incomingRings.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {activeRing && (
        <div
          className="wood-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ background: 'linear-gradient(180deg,#8fd99b,#4e9e63)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Portrait
              initials={initialsOf(activeRing.profile?.name ?? '?')}
              src={activeRing.profile ? avatarUrl(activeRing.profile.avatarSeed) : undefined}
              size={36}
              live
            />
            <span className="font-pixel min-w-0 text-sm text-wood">
              🔔 Ringing with {activeRing.profile?.name ?? 'someone'} — follow the
              sound!
            </span>
          </div>
          <Button
            onClick={() => onDismiss(activeRing.rkey)}
            className="btn3d font-pixel h-auto shrink-0 border-[3px] border-wood px-4 py-2 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
            style={{ background: 'var(--goldl)' }}
          >
            ✓ FOUND THEM
          </Button>
        </div>
      )}
      {incomingRings.map(r => (
        <div
          key={r.rkey}
          className="wood-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Portrait
              initials={initialsOf(r.profile?.name ?? '?')}
              src={r.profile ? avatarUrl(r.profile.avatarSeed) : undefined}
              size={36}
            />
            <span className="font-pixel min-w-0 text-sm text-wood">
              🔔 {r.profile?.name ?? 'Someone'} is trying to find you!
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              onClick={() => onAccept(r.rkey)}
              className="btn3d font-pixel h-auto border-[3px] border-wood px-4 py-2 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{ background: 'linear-gradient(180deg,#8fd99b,#4e9e63)' }}
            >
              ✓ ANSWER
            </Button>
            <Button
              onClick={() => onDismiss(r.rkey)}
              className="btn3d font-pixel h-auto border-[3px] border-wood px-3 py-2 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{ background: 'var(--parch2)' }}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
