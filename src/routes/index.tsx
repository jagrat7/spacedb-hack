import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useAuth } from 'react-oidc-context'
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
import { useOverlapHome, type ProfileLite } from '@/lib/overlap/backend'
import type { Profile } from '@/module_bindings/types'

export const Route = createFileRoute('/')({
  component: Landing,
})

const EMPTY_FORM: ProfileLite = {
  name: '',
  role: '',
  workingOn: '',
  interests: '',
  lookingFor: '',
  offer: '',
}

const toForm = (p: Profile): ProfileLite => ({
  name: p.name,
  role: p.role,
  workingOn: p.workingOn,
  interests: p.interests,
  lookingFor: p.lookingFor,
  offer: p.offer,
})

function Landing() {
  const { connected, myProfile } = useOverlapHome()
  const [editing, setEditing] = useState(false)

  if (!connected) {
    return (
      <div className="relative z-10 grid min-h-screen place-items-center p-4">
        <div className="wood-panel rise px-8 py-6">
          <span className="font-pixel text-lg text-wood">
            Entering the world…
          </span>
        </div>
      </div>
    )
  }

  return !myProfile || editing ? (
    <Onboarding existing={myProfile} onDone={() => setEditing(false)} />
  ) : (
    <Lobby onEdit={() => setEditing(true)} />
  )
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
        <span
          className="font-pixel"
          style={{ fontSize: 16, letterSpacing: '0.06em', color: 'var(--wood)' }}
        >
          {children}
        </span>
        <Star size={13} color="var(--goldd)" fill="var(--wood)" sw={1} />
      </div>
    </div>
  )
}

function CozyField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-pixel text-[11px] tracking-wider text-wood2">
        {label}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'border-[3px] border-wood bg-[#fffaf0] font-sans font-semibold text-wood placeholder:text-wood2/50 focus-visible:ring-gold/40'

/* ------------------------------------------------------------------ *
 * Onboarding gate — profile builder                                   *
 * ------------------------------------------------------------------ */
function Onboarding({
  existing,
  onDone,
}: {
  existing?: Profile
  onDone: () => void
}) {
  const { upsertProfile } = useOverlapHome()
  const [form, setForm] = useState<ProfileLite>(
    existing ? toForm(existing) : EMPTY_FORM
  )

  const set =
    (k: keyof ProfileLite) => (e: { target: { value: string } }) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const canSubmit = form.name.trim() && form.role.trim()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    upsertProfile(form)
    onDone()
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
            <Ribbon>{existing ? 'EDIT YOUR ADVENTURER' : 'CREATE YOUR ADVENTURER'}</Ribbon>
            <p className="text-center font-sans text-sm font-semibold text-wood2">
              This seeds your agent — it'll roam the event and meet people for
              you.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CozyField label="NAME">
                <Input
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Rachel"
                  className={inputClass}
                />
              </CozyField>
              <CozyField label="ROLE">
                <Input
                  value={form.role}
                  onChange={set('role')}
                  placeholder="Performance Marketer · DS grad"
                  className={inputClass}
                />
              </CozyField>
            </div>

            <CozyField label="WHAT YOU'RE WORKING ON">
              <Textarea
                value={form.workingOn}
                onChange={set('workingOn')}
                rows={2}
                placeholder="A live analytics dashboard…"
                className={inputClass}
              />
            </CozyField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CozyField label="INTERESTS">
                <Input
                  value={form.interests}
                  onChange={set('interests')}
                  placeholder="real-time data, K-pop"
                  className={inputClass}
                />
              </CozyField>
              <CozyField label="LOOKING FOR">
                <Input
                  value={form.lookingFor}
                  onChange={set('lookingFor')}
                  placeholder="infra people, cofounders"
                  className={inputClass}
                />
              </CozyField>
            </div>

            <CozyField label="WHAT YOU OFFER">
              <Textarea
                value={form.offer}
                onChange={set('offer')}
                rows={2}
                placeholder="growth + data science, intros to investors"
                className={inputClass}
              />
            </CozyField>

            <div className="flex gap-2">
              {existing && (
                <Button
                  type="button"
                  onClick={onDone}
                  className="btn3d font-pixel h-auto border-4 border-wood py-3 text-base text-wood shadow-[0_5px_0_#2A1F18]"
                  style={{ background: 'var(--parch2)' }}
                >
                  ◀ Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                className="btn3d font-pixel mt-1 h-auto w-full flex-1 border-4 border-wood py-3 text-lg text-wood shadow-[0_5px_0_#2A1F18] disabled:opacity-60"
                style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
              >
                {existing ? '✦ SAVE AGENT' : '▶ ENTER THE WORLD'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Event lobby — join by code + my events                             *
 * ------------------------------------------------------------------ */
function Lobby({ onEdit }: { onEdit: () => void }) {
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

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-5">
      <Sparkles />

      {/* header */}
      <header className="flex shrink-0 items-center justify-between gap-3">
        <Signboard />
        <div className="flex items-center gap-2.5">
          <div className="wood-panel flex items-center gap-2.5 px-3 py-2">
            <Portrait initials={initialsOf(myProfile?.name ?? '')} size={32} live />
            <div className="leading-tight">
              <div className="font-pixel text-sm text-wood">
                {myProfile?.name}
              </div>
              <div className="font-sans text-[11px] font-bold text-goldd">
                {myProfile?.role}
              </div>
            </div>
          </div>
          <button
            onClick={onEdit}
            className="btn3d font-pixel border-[3px] border-wood px-3 py-2 text-xs text-wood shadow-[0_3px_0_#2A1F18]"
            style={{ background: 'var(--goldl)' }}
          >
            EDIT
          </button>
          <button
            onClick={() => auth.signoutRedirect()}
            className="btn3d font-pixel border-[3px] border-wood px-3 py-2 text-xs text-wood shadow-[0_3px_0_#2A1F18]"
            style={{ background: 'var(--parch2)' }}
          >
            SIGN OUT
          </button>
        </div>
      </header>

      {/* join by code */}
      <form onSubmit={onJoin} className="wood-panel rise relative mx-auto w-full max-w-md p-3">
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
              <button
                key={String(ev.id)}
                onClick={() =>
                  navigate({
                    to: '/event/$eventId',
                    params: { eventId: String(ev.id) },
                  })
                }
                className="btn3d quest-card pinned relative p-4 text-left"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-pixel text-base text-wood">
                    {ev.name}
                  </span>
                  <span
                    className="font-pixel text-[10px]"
                    style={{
                      color: 'var(--wood)',
                      background: 'var(--goldl)',
                      border: '2px solid var(--wood)',
                      borderRadius: 5,
                      padding: '0 6px',
                    }}
                  >
                    {ev.code}
                  </span>
                </div>
                <div className="font-sans text-xs font-semibold text-wood2">
                  Tap to enter the room
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
