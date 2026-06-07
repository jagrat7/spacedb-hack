import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Flower, Sparkles } from '@/components/cozy'
import { useOverlapHome, type ProfileLite } from '@/lib/overlap/backend'
import { enrichFromSocials } from '@/server/enrich'
import type { Profile } from '@/module_bindings/types'
import { CozyField, Ribbon, Signboard, inputClass } from './shared'

// The backend stores goals/socials as single strings; the form edits them as
// lists of rows. These joiners/splitters round-trip between the two shapes.
const GOAL_SEP = '; '
const SOCIAL_SEP = ', '

const toRows = (s: string, splitOn: RegExp): string[] => {
  const parts = s
    .split(splitOn)
    .map(x => x.trim())
    .filter(Boolean)
  return parts.length ? parts : ['']
}

const fromRows = (rows: string[], join: string): string =>
  rows
    .map(x => x.trim())
    .filter(Boolean)
    .join(join)

type FormState = {
  name: string
  goals: string[]
  socials: string[]
  bio: string
  persona: string
}

const EMPTY_FORM: FormState = {
  name: '',
  goals: [''],
  socials: [''],
  bio: '',
  persona: '',
}

const toForm = (p: Profile): FormState => ({
  name: p.name,
  goals: toRows(p.goals, /[;\n]+/),
  socials: toRows(p.socials, /[,\n]+/),
  bio: p.bio,
  persona: p.persona,
})

/* ------------------------------------------------------------------ *
 * Repeating list of single-line inputs with add / remove rows         *
 * ------------------------------------------------------------------ */
function ListField({
  label,
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  const update = (i: number, v: string) =>
    onChange(values.map((x, idx) => (idx === i ? v : x)))
  const remove = (i: number) =>
    onChange(values.length > 1 ? values.filter((_, idx) => idx !== i) : [''])
  const add = () => onChange([...values, ''])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-pixel text-[11px] tracking-wider text-wood2">
        {label}
      </span>
      <div className="flex flex-col gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={v}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className={`${inputClass} flex-1`}
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove"
                className="btn3d font-pixel shrink-0 border-[3px] border-wood px-2.5 py-2 text-wood shadow-[0_3px_0_#2A1F18]"
                style={{ background: 'var(--parch2)' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="btn3d font-pixel self-start border-[3px] border-wood px-3 py-1.5 text-[11px] tracking-wider text-wood shadow-[0_3px_0_#2A1F18]"
          style={{ background: 'linear-gradient(180deg,#9bd6a3,#82C58C)' }}
        >
          + {addLabel}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Onboarding gate — profile builder                                   *
 * ------------------------------------------------------------------ */
export function Onboarding({
  existing,
  onDone,
}: {
  existing?: Profile
  onDone: () => void
}) {
  const { upsertProfile } = useOverlapHome()
  const [form, setForm] = useState<FormState>(
    existing ? toForm(existing) : EMPTY_FORM
  )

  const [enriching, setEnriching] = useState(false)
  const [enrichMsg, setEnrichMsg] = useState('')

  const canSubmit = form.name.trim() && form.goals.some(g => g.trim())
  const hasSocials = form.socials.some(s => s.trim())

  // Scrape the links and write the AI bio into its own field. Returns the
  // generated text so the submit path can use it without waiting on state.
  const generateBio = async (): Promise<string> => {
    const res = await enrichFromSocials({
      data: {
        name: form.name.trim(),
        goals: fromRows(form.goals, GOAL_SEP),
        socials: form.socials.map(s => s.trim()).filter(Boolean),
      },
    })
    if (res.description) {
      setForm(f => ({ ...f, bio: res.description }))
      setEnrichMsg(`Generated from ${res.sources.length} link(s) — edit it below.`)
      return res.description
    }
    setEnrichMsg(res.note ?? 'Could not generate a description from those links.')
    return ''
  }

  const runEnrich = async () => {
    setEnrichMsg('')
    setEnriching(true)
    try {
      await generateBio()
    } catch (err) {
      setEnrichMsg(err instanceof Error ? err.message : 'Enrichment failed.')
    } finally {
      setEnriching(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || enriching) return

    // Auto-generate the bio on submit if the user never clicked generate.
    let bio = form.bio.trim()
    if (!bio && hasSocials) {
      setEnrichMsg('')
      setEnriching(true)
      try {
        bio = await generateBio()
      } catch (err) {
        setEnrichMsg(err instanceof Error ? err.message : 'Enrichment failed.')
      } finally {
        setEnriching(false)
      }
    }

    const payload: ProfileLite = {
      name: form.name.trim(),
      goals: fromRows(form.goals, GOAL_SEP),
      socials: fromRows(form.socials, SOCIAL_SEP),
      bio,
      persona: form.persona.trim(),
    }
    upsertProfile(payload)
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

            <CozyField label="NAME">
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Rachel"
                className={inputClass}
              />
            </CozyField>

            <ListField
              label="YOUR GOALS"
              values={form.goals}
              onChange={goals => setForm(f => ({ ...f, goals }))}
              placeholder="Find infra cofounders…"
              addLabel="ADD GOAL"
            />

            <ListField
              label="SOCIAL LINKS"
              values={form.socials}
              onChange={socials => setForm(f => ({ ...f, socials }))}
              placeholder="twitter.com/rachel"
              addLabel="ADD LINK"
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-pixel text-[11px] tracking-wider text-wood2">
                  AGENT BIO (FROM YOUR LINKS)
                </span>
                <button
                  type="button"
                  onClick={runEnrich}
                  disabled={enriching || !hasSocials}
                  className="btn3d font-pixel shrink-0 border-[3px] border-wood px-3 py-1.5 text-[11px] tracking-wider text-wood shadow-[0_3px_0_#2A1F18] disabled:opacity-60"
                  style={{ background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)' }}
                >
                  {enriching ? '✨ Reading…' : '✨ Generate'}
                </button>
              </div>
              <Textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                rows={4}
                placeholder="Click Generate to pull this from your links — or leave blank and it'll auto-generate when you create your agent."
                className={inputClass}
              />
              {enrichMsg && (
                <span className="font-sans text-xs font-bold text-wood2">
                  {enrichMsg}
                </span>
              )}
            </div>

            <CozyField label="HOW YOUR AGENT SHOULD ACT (OPTIONAL)">
              <Textarea
                value={form.persona}
                onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
                rows={4}
                placeholder="Be warm and friendly. Stay curious. Background, fun facts, things to avoid…"
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
