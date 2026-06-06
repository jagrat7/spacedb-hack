import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Flower,
  Leaf,
  LeafSpray,
  Portrait,
  Sparkles,
  StatBar,
  Star,
  initialsOf,
} from '@/components/cozy'
import {
  isHumanSpeaker,
  parseList,
  sideOf,
  useEventRoom,
} from '@/lib/overlap/backend'
import type { AgentMessage, Match, Profile } from '@/module_bindings/types'

export const Route = createFileRoute('/event/$eventId')({
  component: EventRoom,
})

function EventRoom() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const { event, myProfile, others, messagesByPair, onSendChat, reRun, mySideFor } =
    useEventRoom(eventId)

  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const [prefill, setPrefill] = useState<
    { pairKey: string; text: string } | undefined
  >()

  useEffect(() => {
    if (!selectedKey && others.length) setSelectedKey(others[0].pairKey)
  }, [others, selectedKey])

  const selected = useMemo(
    () => others.find(o => o.pairKey === selectedKey),
    [others, selectedKey]
  )

  const openChat = (pairKey: string) => setSelectedKey(pairKey)
  const useIcebreaker = (pairKey: string, text: string) => {
    setSelectedKey(pairKey)
    setPrefill({ pairKey, text })
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
        <div className="relative">
          <div className="wood-panel flex items-center gap-2.5 px-4 py-2.5">
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
            <span className="font-pixel text-sm text-wood">
              {event.name} · {event.code}
            </span>
          </div>
          <div className="absolute -right-3 -top-3">
            <LeafSpray size={28} flip />
          </div>
        </div>
      </header>

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
                    onReRun={() => reRun(o)}
                    onIcebreaker={text => useIcebreaker(o.pairKey, text)}
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
              prefill={
                prefill?.pairKey === selected.pairKey ? prefill.text : undefined
              }
              onPrefillConsumed={() => setPrefill(undefined)}
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
    </div>
  )
}

function MatchCard({
  other,
  match,
  selected,
  onOpen,
  onReRun,
  onIcebreaker,
}: {
  other: Profile
  match?: Match
  selected: boolean
  onOpen: () => void
  onReRun: () => void
  onIcebreaker: (text: string) => void
}) {
  const status = match?.status ?? 'pending'
  const complete = status === 'complete'
  const errored = status === 'error'
  const commonGround = match ? parseList(match.commonGround) : []
  const icebreakers = match ? parseList(match.icebreakers) : []

  return (
    <div className={`quest-card pinned relative ${selected ? 'selected' : ''}`}>
      <div className="absolute -right-3 -bottom-3 z-10 grow">
        <Flower size={20} petal={complete ? '#f6a8c0' : '#c6e4f0'} center="#fff1a8" />
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Portrait initials={initialsOf(other.name)} size={42} live={complete} />
            <div className="min-w-0">
              <div className="font-pixel text-base text-wood">{other.name}</div>
              <div className="truncate font-sans text-xs font-semibold text-wood2">
                {other.role}
              </div>
            </div>
          </div>
          {complete && match ? (
            <div
              className="font-pixel tabnum"
              style={{ fontSize: 28, fontWeight: 700, color: 'var(--goldd)' }}
            >
              {match.score}
              <span style={{ fontSize: 16 }}>%</span>
            </div>
          ) : (
            <span className="font-pixel text-xs text-wood2">
              {errored ? 'error' : status === 'streaming' ? 'talking…' : 'scoring…'}
            </span>
          )}
        </div>

        {complete && match ? (
          <>
            <div className="grid gap-2.5">
              <StatBar label="Goal Alignment" value={match.metricGoals} delay={100} />
              <StatBar label="Shared Interests" value={match.metricShared} delay={200} />
              <StatBar label="Complementary" value={match.metricComplementary} delay={300} />
            </div>

            <div
              className="mt-4 rounded-lg p-3"
              style={{
                background: 'var(--parch2)',
                border: '2px dashed var(--wood2)',
              }}
            >
              <div className="mb-1 font-pixel text-[11px] tracking-wider text-saged">
                WHY YOU TWO SHOULD MEET
              </div>
              <p className="font-sans text-sm font-semibold leading-snug text-wood">
                {match.summary}
              </p>
            </div>

            {commonGround.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {commonGround.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 font-sans font-bold"
                    style={{
                      fontSize: 13,
                      color: 'var(--wood)',
                      background: '#bfe6c2',
                      border: '2px solid var(--wood)',
                      borderRadius: 999,
                      padding: '3px 10px',
                      boxShadow: '0 2px 0 #3A2C22',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 99,
                        background: 'var(--saged)',
                      }}
                    />
                    {t}
                  </span>
                ))}
              </div>
            )}

            {icebreakers.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 font-pixel text-[11px] tracking-wider text-wood2">
                  ICEBREAKERS
                </div>
                <div className="flex flex-col gap-2">
                  {icebreakers.map(ib => (
                    <button
                      key={ib}
                      onClick={() => onIcebreaker(ib)}
                      className="btn3d group flex items-center gap-2.5 text-left font-sans font-bold"
                      style={{
                        fontSize: 14,
                        color: 'var(--wood)',
                        background: 'var(--parch2)',
                        border: '3px solid var(--wood)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        boxShadow: '0 3px 0 #3A2C22',
                      }}
                    >
                      <span
                        className="font-pixel shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--goldd)', fontSize: 15 }}
                      >
                        ▶
                      </span>
                      <span className="flex-1">{ib}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : errored ? (
          <p className="py-2 font-sans text-sm font-semibold text-pink">
            {match?.summary || 'Matching failed.'}
          </p>
        ) : (
          <div className="flex items-center gap-2 py-3">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="tdot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: 'var(--wood2)',
                    animationDelay: `${i * 0.16}s`,
                  }}
                />
              ))}
            </div>
            <span className="font-sans text-sm font-semibold text-wood2">
              The agents are getting acquainted…
            </span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            onClick={onOpen}
            className="btn3d font-pixel h-auto flex-1 border-[3px] border-wood py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
            style={{
              background: selected
                ? 'var(--goldl)'
                : 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
            }}
          >
            {selected ? '✦ WATCHING' : '▶ OPEN CHAT'}
          </Button>
          {(complete || errored) && (
            <Button
              onClick={onReRun}
              className="btn3d font-pixel h-auto border-[3px] border-wood px-3 py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{ background: 'var(--parch2)' }}
            >
              ↻
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatPanel({
  other,
  me,
  mySide,
  streaming,
  transcript,
  prefill,
  onPrefillConsumed,
  onSend,
}: {
  other: Profile
  me: Profile
  mySide: 'a' | 'b'
  streaming: boolean
  transcript: AgentMessage[]
  prefill?: string
  onPrefillConsumed: () => void
  onSend: (text: string) => void
}) {
  const [driving, setDriving] = useState(false)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const otherSide: 'a' | 'b' = mySide === 'a' ? 'b' : 'a'
  const connected = useMemo(
    () =>
      transcript.some(
        m => sideOf(m.speaker) === otherSide && isHumanSpeaker(m.speaker)
      ),
    [transcript, otherSide]
  )

  useEffect(() => {
    if (prefill !== undefined) {
      setDriving(true)
      setDraft(prefill)
      setTimeout(() => inputRef.current?.focus(), 120)
      onPrefillConsumed()
    }
  }, [prefill, onPrefillConsumed])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [transcript, streaming])

  const nameOf = (speaker: string) =>
    sideOf(speaker) === mySide ? me.name : other.name
  const initOf = (speaker: string) => initialsOf(nameOf(speaker))

  const onTakeOver = () => {
    setDriving(true)
    setTimeout(() => inputRef.current?.focus(), 120)
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    onSend(text)
  }

  const banner = connected
    ? { bg: 'linear-gradient(180deg,#F2B946,#E597B0)', text: "You're both here!" }
    : driving
      ? { bg: 'linear-gradient(180deg,#F8CE6E,#EBA63A)', text: "You've got the controls" }
      : { bg: 'linear-gradient(180deg,#9bd6a3,#82C58C)', text: 'The agents are chatting…' }

  return (
    <div className="wood-panel rise flex h-full flex-col overflow-hidden">
      <div
        className="flex shrink-0 items-center justify-between px-5 py-3"
        style={{ background: banner.bg, borderBottom: '4px solid var(--wood)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="blink inline-block"
            style={{
              width: 11,
              height: 11,
              borderRadius: 99,
              background: '#fff',
              border: '2px solid var(--wood)',
            }}
          />
          <span className="font-pixel text-[17px] text-wood">{banner.text}</span>
        </div>
        <span className="font-pixel text-xs text-wood/70">AGENT ✦ AGENT</span>
      </div>

      <div
        ref={scrollRef}
        className="cscroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
        style={{
          background:
            'repeating-linear-gradient(180deg,#fdf6e0,#fdf6e0 22px,#f8eecb 22px,#f8eecb 44px)',
        }}
      >
        {transcript.map(m => {
          const right = sideOf(m.speaker) === mySide
          const human = isHumanSpeaker(m.speaker)
          return (
            <div
              key={m.id.toString()}
              className={`pop flex ${right ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex items-start gap-2.5 ${right ? 'flex-row-reverse' : ''}`}
                style={{ maxWidth: '84%' }}
              >
                <Portrait initials={initOf(m.speaker)} size={38} live={human} />
                <div className={right ? 'flex flex-col items-end' : 'flex flex-col'}>
                  <div
                    className={`mb-1 flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}
                  >
                    <span
                      className="font-pixel text-sm"
                      style={{ color: human ? 'var(--goldd)' : 'var(--wood2)' }}
                    >
                      {nameOf(m.speaker)}
                    </span>
                    <span
                      className="font-pixel inline-flex items-center gap-1"
                      style={{
                        fontSize: 10,
                        color: human ? 'var(--wood)' : 'var(--wood2)',
                        background: human ? 'var(--gold)' : '#e7d5a8',
                        border: `2px solid ${human ? 'var(--wood)' : 'var(--wood2)'}`,
                        borderRadius: 5,
                        padding: '0 5px',
                      }}
                    >
                      {human ? 'LIVE' : 'AUTO'}
                    </span>
                  </div>
                  <div
                    className="break-words whitespace-pre-wrap"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeight: 1.45,
                      color: 'var(--wood)',
                      padding: '10px 14px',
                      background: human
                        ? 'linear-gradient(180deg,#FFF2CC,#FBE3A0)'
                        : '#FBF3DA',
                      border: '3px solid var(--wood)',
                      borderRadius: right ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                      boxShadow: human
                        ? '0 3px 0 #2A1F18, 0 0 12px rgba(235,166,58,0.45)'
                        : '0 3px 0 #2A1F18',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {streaming && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2.5">
              <Portrait initials={initialsOf(other.name)} size={38} />
              <div
                className="flex items-center gap-1.5"
                style={{
                  padding: '12px 14px',
                  background: '#FBF3DA',
                  border: '3px solid var(--wood)',
                  borderRadius: 12,
                  boxShadow: '0 3px 0 #2A1F18',
                }}
              >
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="tdot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 99,
                      background: 'var(--wood2)',
                      animationDelay: `${i * 0.16}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="shrink-0 px-5 py-4"
        style={{ borderTop: '4px solid var(--wood)', background: 'var(--parch)' }}
      >
        {!driving ? (
          <Button
            onClick={onTakeOver}
            className="btn3d font-pixel h-auto w-full border-4 border-wood py-3 text-lg text-wood shadow-[0_5px_0_#2A1F18]"
            style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
          >
            ▶ SPEAK FOR YOURSELF
          </Button>
        ) : (
          <form onSubmit={send} className="slide-up flex flex-col gap-3">
            <div className="flex items-end gap-2.5">
              <Portrait initials={initialsOf(me.name)} size={40} live />
              <div
                className="flex flex-1 items-center"
                style={{
                  background: '#fffaf0',
                  border: '3px solid var(--wood)',
                  borderRadius: 10,
                  padding: '2px 6px 2px 12px',
                  boxShadow: draft
                    ? '0 0 14px rgba(235,166,58,0.5), inset 0 1px 2px rgba(0,0,0,0.1)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                }}
              >
                <Textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(e as unknown as FormEvent)
                    }
                  }}
                  placeholder={`Type as yourself — ${other.name} sees it live…`}
                  rows={1}
                  className="min-h-0 flex-1 resize-none border-0 bg-transparent py-2.5 font-sans text-base font-semibold text-wood shadow-none focus-visible:ring-0"
                  style={{ maxHeight: 88 }}
                />
                <Button
                  type="submit"
                  disabled={!draft.trim()}
                  size="icon"
                  className="btn3d ml-2 size-[38px] shrink-0 border-[3px] border-wood shadow-[0_3px_0_#2A1F18]"
                  style={{
                    background: draft.trim() ? 'var(--gold)' : '#d8c290',
                    opacity: draft.trim() ? 1 : 0.7,
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 8h11M9 4l4 4-4 4"
                      stroke="var(--wood)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-pixel text-xs text-wood2">
                {connected
                  ? '★ Both of you are live — agents stepped back'
                  : 'Your agent paused · you’re speaking live'}
              </span>
              <button
                type="button"
                onClick={() => setDriving(false)}
                className="btn3d font-pixel text-xs text-wood"
                style={{
                  background: '#e7d5a8',
                  border: '3px solid var(--wood)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  boxShadow: '0 3px 0 #2A1F18',
                }}
              >
                ◀ HAND BACK
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
