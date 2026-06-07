import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Portrait, initialsOf } from '@/components/cozy'
import { avatarUrl, isHumanSpeaker, sideOf } from '@/lib/overlap/backend'
import type { AgentMessage, Profile } from '@/module_bindings/types'

export function ChatPanel({
  other,
  me,
  mySide,
  streaming,
  transcript,
  onSend,
  humanOnly = false,
}: {
  other: Profile
  me: Profile
  mySide: 'a' | 'b'
  streaming: boolean
  transcript: AgentMessage[]
  onSend: (text: string) => void
  humanOnly?: boolean
}) {
  const [driving, setDriving] = useState(humanOnly)
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
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [transcript, streaming])

  const nameOf = (speaker: string) =>
    sideOf(speaker) === mySide ? me.name : other.name
  const initOf = (speaker: string) => initialsOf(nameOf(speaker))
  const avatarOf = (speaker: string) =>
    avatarUrl(sideOf(speaker) === mySide ? me.avatarSeed : other.avatarSeed)

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

  const visibleTranscript = useMemo(
    () => (humanOnly ? transcript.filter(m => isHumanSpeaker(m.speaker)) : transcript),
    [transcript, humanOnly]
  )

  const banner = humanOnly
    ? connected
      ? { bg: 'linear-gradient(180deg,#F2B946,#E597B0)', text: "You're both here!" }
      : { bg: 'linear-gradient(180deg,#F8CE6E,#EBA63A)', text: `Chat with ${other.name}` }
    : connected
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
        <span className="font-pixel text-xs text-wood/70">
          {humanOnly ? `${me.name} ✦ ${other.name}` : 'AGENT ✦ AGENT'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="cscroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
        style={{
          background:
            'repeating-linear-gradient(180deg,#fdf6e0,#fdf6e0 22px,#f8eecb 22px,#f8eecb 44px)',
        }}
      >
        {visibleTranscript.map(m => {
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
                <Portrait
                  initials={initOf(m.speaker)}
                  src={avatarOf(m.speaker)}
                  size={38}
                  live={human}
                />
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
                    {!humanOnly && (
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
                        {human ? '✦ HUMAN' : '⚙ AGENT'}
                      </span>
                    )}
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

        {!humanOnly && streaming && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2.5">
              <Portrait
                initials={initialsOf(other.name)}
                src={avatarUrl(other.avatarSeed)}
                size={38}
              />
              <div className="flex flex-col">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="font-pixel text-sm"
                    style={{ color: 'var(--wood2)' }}
                  >
                    {other.name}
                  </span>
                  <span
                    className="font-pixel inline-flex items-center gap-1"
                    style={{
                      fontSize: 10,
                      color: 'var(--wood2)',
                      background: '#e7d5a8',
                      border: '2px solid var(--wood2)',
                      borderRadius: 5,
                      padding: '0 5px',
                    }}
                  >
                    ⚙ AGENT
                  </span>
                </div>
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
          </div>
        )}
      </div>

      <div
        className="shrink-0 px-5 py-4"
        style={{ borderTop: '4px solid var(--wood)', background: 'var(--parch)' }}
      >
        {!humanOnly && !driving ? (
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
              <Portrait
                initials={initialsOf(me.name)}
                src={avatarUrl(me.avatarSeed)}
                size={40}
                live
              />
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
            {!humanOnly && (
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
            )}
          </form>
        )}
      </div>
    </div>
  )
}
