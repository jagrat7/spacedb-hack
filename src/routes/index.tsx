import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Flower,
  Leaf,
  LeafSpray,
  Portrait,
  Sparkles,
  Star,
  initialsOf,
} from '@/components/cozy'
import {
  useMyEvents,
  useMyGoals,
  useMyProfile,
  useOverlap,
} from '@/lib/overlap/store'
import type { EventMode } from '@/lib/overlap/types'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  const profile = useMyProfile()
  return profile ? <Lobby /> : <Onboarding />
}

/* ------------------------------------------------------------------ *
 * Shared chrome                                                       *
 * ------------------------------------------------------------------ */
function Signboard() {
  return (
    <div className="relative w-fit">
      <div className="wood-panel bob flex items-center gap-2.5 px-5 py-2.5">
        <Leaf size={18} color="#4e9e63" />
        <span
          className="font-pixel text-2xl tracking-wide text-wood"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
        >
          Overlap
        </span>
        <Leaf size={18} color="#4e9e63" flip />
      </div>
      <div className="absolute -left-4 -top-3">
        <LeafSpray size={32} />
      </div>
      <div className="absolute -right-4 -top-3">
        <LeafSpray size={32} flip />
      </div>
    </div>
  )
}

/** Carved parchment ribbon used as a section title. */
function Ribbon({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-fit">
      <div
        className="flex items-center gap-2 px-5 py-1.5"
        style={{
          background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
          border: '3px solid var(--wood)',
          borderRadius: 8,
          boxShadow: '0 3px 0 #2A1F18, inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <Star size={13} color="var(--goldd)" fill="var(--wood)" sw={1} />
        <span className="font-pixel" style={{ fontSize: 16, letterSpacing: '0.06em', color: 'var(--wood)' }}>
          {children}
        </span>
        <Star size={13} color="var(--goldd)" fill="var(--wood)" sw={1} />
      </div>
    </div>
  )
}

function CozyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-pixel text-[11px] tracking-wider text-wood2">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'border-[3px] border-wood bg-[#fffaf0] font-sans font-semibold text-wood placeholder:text-wood2/50 focus-visible:ring-gold/40'

/* ------------------------------------------------------------------ *
 * Onboarding gate — profile builder + goals                          *
 * ------------------------------------------------------------------ */
function Onboarding() {
  const { upsertProfile, addGoal } = useOverlap()
  const [form, setForm] = useState({
    name: '',
    role: '',
    workingOn: '',
    interests: '',
    lookingFor: '',
    offering: '',
    personality: '',
  })
  const [goals, setGoals] = useState<string[]>([])
  const [goalDraft, setGoalDraft] = useState('')

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = form.name.trim() && form.role.trim()

  const addGoalDraft = () => {
    const t = goalDraft.trim()
    if (!t) return
    setGoals(g => [...g, t])
    setGoalDraft('')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    upsertProfile(form)
    goals.forEach((text, i) => addGoal(text, i))
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-5">
      <Sparkles />
      <header className="flex shrink-0 justify-center pt-2">
        <Signboard />
      </header>

      <form onSubmit={onSubmit} className="min-h-0 flex-1 pb-10">
        <div className="wood-panel rise relative p-3.5">
          {/* decorative corners */}
          <div className="pointer-events-none absolute -right-3 -bottom-3 z-10 grow">
            <Flower size={26} petal="#f6a8c0" />
          </div>
          <div className="pointer-events-none absolute -left-3 bottom-8 z-10 grow">
            <Flower size={20} petal="#fff1a8" center="#eba63a" />
          </div>

          <div className="scroll-panel flex flex-col gap-4 px-5 py-6">
            <Ribbon>CREATE YOUR ADVENTURER</Ribbon>
            <p className="text-center font-sans text-sm font-semibold text-wood2">
              This seeds your agent — it'll roam the event and meet people for you.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CozyField label="NAME">
                <Input value={form.name} onChange={set('name')} placeholder="Rachel" className={inputClass} />
              </CozyField>
              <CozyField label="ROLE">
                <Input value={form.role} onChange={set('role')} placeholder="Performance Marketer · DS grad" className={inputClass} />
              </CozyField>
            </div>

            <CozyField label="WHAT YOU'RE WORKING ON">
              <Textarea value={form.workingOn} onChange={set('workingOn')} rows={2} placeholder="A live analytics dashboard…" className={inputClass} />
            </CozyField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CozyField label="INTERESTS">
                <Input value={form.interests} onChange={set('interests')} placeholder="real-time data, K-pop" className={inputClass} />
              </CozyField>
              <CozyField label="PERSONALITY">
                <Input value={form.personality} onChange={set('personality')} placeholder="curious, direct, warm" className={inputClass} />
              </CozyField>
              <CozyField label="LOOKING FOR">
                <Input value={form.lookingFor} onChange={set('lookingFor')} placeholder="infra people, cofounders" className={inputClass} />
              </CozyField>
              <CozyField label="OFFERING">
                <Input value={form.offering} onChange={set('offering')} placeholder="growth + data science" className={inputClass} />
              </CozyField>
            </div>

            {/* goals editor — pinned quest note */}
            <div className="quest-card pinned relative mt-1 p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Leaf size={15} />
                <span className="font-pixel text-[12px] tracking-wider text-saged">YOUR QUESTS (GOALS)</span>
              </div>
              <div className="mb-3 flex flex-col gap-2">
                {goals.length === 0 && (
                  <span className="font-sans text-sm font-semibold text-wood2/70">
                    Add what you want to get out of this event.
                  </span>
                )}
                {goals.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    style={{ background: 'var(--parch2)', border: '2px solid var(--wood)', borderRadius: 8, padding: '6px 10px' }}
                  >
                    <Star size={11} color="var(--goldd)" fill="var(--gold)" sw={1} />
                    <span className="flex-1 font-sans text-sm font-bold text-wood">{g}</span>
                    <button type="button" onClick={() => setGoals(gs => gs.filter((_, j) => j !== i))} className="font-pixel text-xs text-wood2 hover:text-wood">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addGoalDraft()
                    }
                  }}
                  placeholder="e.g. find a hackathon teammate"
                  className={inputClass}
                />
                <Button
                  type="button"
                  onClick={addGoalDraft}
                  className="btn3d font-pixel border-[3px] border-wood text-wood shadow-[0_3px_0_#2A1F18]"
                  style={{ background: 'var(--goldl)' }}
                >
                  + Add
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!canSubmit}
              className="btn3d font-pixel mt-1 h-auto w-full border-4 border-wood py-3 text-lg text-wood shadow-[0_5px_0_#2A1F18] disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
            >
              ▶ ENTER THE WORLD
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Event lobby — create / join by code + my events                    *
 * ------------------------------------------------------------------ */
function Lobby() {
  const navigate = useNavigate()
  const profile = useMyProfile()
  const goals = useMyGoals()
  const events = useMyEvents()
  const { createEvent, joinEvent } = useOverlap()

  const [eventName, setEventName] = useState('')
  const [mode, setMode] = useState<EventMode>('offline')
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    if (!eventName.trim()) return
    const ev = createEvent(eventName.trim(), mode)
    navigate({ to: '/event/$eventId', params: { eventId: ev.id } })
  }

  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    setJoinError('')
    const ev = joinEvent(code)
    if (!ev) {
      setJoinError('No event with that code.')
      return
    }
    navigate({ to: '/event/$eventId', params: { eventId: ev.id } })
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-5">
      <Sparkles />

      {/* header */}
      <header className="flex shrink-0 items-center justify-between gap-3">
        <Signboard />
        <div className="wood-panel flex items-center gap-2.5 px-3 py-2">
          <Portrait initials={initialsOf(profile?.name ?? '')} size={32} live />
          <div className="leading-tight">
            <div className="font-pixel text-sm text-wood">{profile?.name}</div>
            <div className="font-sans text-[11px] font-bold text-goldd">{goals.length} quests</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* create */}
        <form onSubmit={onCreate} className="wood-panel rise relative p-3">
          <div className="pointer-events-none absolute -right-3 -top-3 z-10">
            <LeafSpray size={30} flip />
          </div>
          <div className="scroll-panel flex flex-col gap-3.5 px-5 py-5">
            <div className="flex items-center gap-2">
              <Flower size={18} petal="#fff1a8" center="#eba63a" />
              <span className="font-pixel text-base text-wood">HOST AN EVENT</span>
            </div>
            <CozyField label="EVENT NAME">
              <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="SpacetimeDB Hackathon" className={inputClass} />
            </CozyField>
            <div className="flex flex-col gap-1">
              <span className="font-pixel text-[11px] tracking-wider text-wood2">MODE</span>
              <div className="flex gap-2">
                {(['offline', 'online'] as EventMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="btn3d flex-1 font-pixel text-sm capitalize"
                    style={{
                      color: 'var(--wood)',
                      background: mode === m ? 'linear-gradient(180deg,#F8CE6E,#EBA63A)' : 'var(--parch2)',
                      border: '3px solid var(--wood)',
                      borderRadius: 8,
                      padding: '8px 0',
                      boxShadow: '0 3px 0 #2A1F18',
                    }}
                  >
                    {m === 'offline' ? '📍 In person' : '🌐 Online'}
                  </button>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              disabled={!eventName.trim()}
              className="btn3d font-pixel h-auto w-full border-4 border-wood py-3 text-base text-wood shadow-[0_5px_0_#2A1F18] disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg,#9bd6a3,#82C58C)' }}
            >
              ▶ OPEN THE DOORS
            </Button>
          </div>
        </form>

        {/* join */}
        <form onSubmit={onJoin} className="wood-panel rise relative p-3">
          <div className="pointer-events-none absolute -left-3 -top-3 z-10">
            <LeafSpray size={30} />
          </div>
          <div className="scroll-panel flex flex-col gap-3.5 px-5 py-5">
            <div className="flex items-center gap-2">
              <Leaf size={18} color="#86cf7c" />
              <span className="font-pixel text-base text-wood">JOIN BY CODE</span>
            </div>
            <CozyField label="EVENT CODE">
              <Input
                value={code}
                onChange={e => {
                  setCode(e.target.value.toUpperCase())
                  setJoinError('')
                }}
                placeholder="AB7K"
                maxLength={4}
                className={`${inputClass} font-pixel text-2xl tracking-[0.4em]`}
              />
            </CozyField>
            {joinError && <span className="font-sans text-sm font-bold text-pink">{joinError}</span>}
            <Button
              type="submit"
              disabled={code.trim().length < 4}
              className="btn3d font-pixel h-auto w-full border-4 border-wood py-3 text-base text-wood shadow-[0_5px_0_#2A1F18] disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
            >
              ▶ STEP INSIDE
            </Button>
            <p className="font-sans text-xs font-semibold text-wood2/70">
              Tip: host an event to generate a code, then share it.
            </p>
          </div>
        </form>
      </div>

      {/* my events — quest board */}
      {events.length > 0 && (
        <section className="wood-panel relative p-3 pb-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Leaf size={16} />
            <span className="font-pixel text-sm tracking-wider text-wood">YOUR EVENTS</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => navigate({ to: '/event/$eventId', params: { eventId: ev.id } })}
                className="btn3d quest-card pinned relative p-4 text-left"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-pixel text-base text-wood">{ev.name}</span>
                  <span
                    className="font-pixel text-[10px]"
                    style={{ color: 'var(--wood)', background: 'var(--goldl)', border: '2px solid var(--wood)', borderRadius: 5, padding: '0 6px' }}
                  >
                    {ev.code}
                  </span>
                </div>
                <div className="font-sans text-xs font-semibold capitalize text-wood2">
                  {ev.mode} · {ev.status} {ev.host === profile?.identity ? '· you host' : ''}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
