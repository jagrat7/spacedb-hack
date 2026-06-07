import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Leaf, LeafSpray, Sparkles, Star } from '@/components/cozy'
import { useEventRoom, type PlazaPerson } from '@/lib/overlap/backend'
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
    openPlazaChat,
    onSendDirectChat,
  } = useEventRoom(eventId)

  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const [mode, setMode] = useState<'pre' | 'event'>('pre')

  useEffect(() => {
    if (!selectedKey && others.length) setSelectedKey(others[0].pairKey)
  }, [others, selectedKey])

  const selected = useMemo(
    () => others.find(o => o.pairKey === selectedKey),
    [others, selectedKey]
  )

  const openChat = (pairKey: string) => {
    setSelectedKey(pairKey)
    setMode('pre')
  }

  const talkInPlaza = (person: PlazaPerson) => {
    if (!person.pairKey) return
    const other = others.find(o => o.pairKey === person.pairKey)
    if (other) openPlazaChat(other)
    setSelectedKey(person.pairKey)
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
    <div className="relative z-10 mx-auto flex h-screen max-w-6xl flex-col gap-4 p-5">
      <Sparkles />

      <header className="flex shrink-0 items-center justify-between gap-3">
        <button
          onClick={() => navigate({ to: '/' })}
          className="btn3d wood-panel flex items-center gap-2.5 px-4 py-2.5 text-wood"
        >
          <span className="font-pixel text-lg text-wood">◀</span>
          <span
            className="font-pixel text-xl tracking-wide text-wood"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
          >
            Overlap
          </span>
        </button>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setMode(m => (m === 'pre' ? 'event' : 'pre'))}
            className="btn3d font-pixel h-auto border-[3px] border-wood px-5 py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
            style={{
              background:
                mode === 'event'
                  ? 'var(--goldl)'
                  : 'linear-gradient(180deg,#8fd99b,#4e9e63)',
            }}
          >
            {mode === 'event' ? '◀ PRE-EVENT' : '✦ START EVENT'}
          </Button>
          <div className="relative">
            <div className="wood-panel flex items-center gap-2.5 px-4 py-2.5">
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
                  className="blink inline-block"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background: '#4e9e63',
                    border: '2px solid var(--wood)',
                  }}
                />
              )}
              <span className="font-pixel text-sm text-wood">
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
            <div className="absolute -right-3 -top-3">
              <LeafSpray size={28} flip />
            </div>
          </div>
        </div>
      </header>

      {mode === 'event' ? (
        event.isOnline ? (
          <div
            className="grid min-h-0 flex-1 gap-5"
            style={{ gridTemplateColumns: 'minmax(0, 1.1fr) 1fr' }}
          >
            <div className="min-h-0 pb-2">
              <div className="wood-panel rise flex h-full flex-col overflow-hidden">
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
                  />
                </div>
              </div>
            </div>
            <div className="min-h-0 pb-2">
              {selected && myProfile ? (
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
                <div className="wood-panel flex h-full items-center justify-center">
                  <p className="font-pixel text-base text-wood2">
                    Walk up to someone & chat ✦
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
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
                <div className="grid gap-5 pt-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
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
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
      <div
        className="grid min-h-0 flex-1 gap-5"
        style={{ gridTemplateColumns: 'minmax(0, 1.1fr) 1fr' }}
      >
        <div className="min-h-0 pb-2">
          <div className="wood-panel rise flex h-full flex-col overflow-hidden">
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

        <div className="min-h-0 pb-2">
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
            <div className="wood-panel flex h-full items-center justify-center">
              <p className="font-pixel text-base text-wood2">
                Pick a spirit to watch the chat ✦
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
