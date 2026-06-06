// In-memory mock of the Overlap SpacetimeDB module. It mirrors the reducer +
// subscription surface from docs/plans/backend.md so the cozy frontend is fully
// clickable without a live module. Swap these hooks for `useSpacetimeDBQuery` /
// `useReducer` once the real bindings are generated — the shapes already match.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  AgentConversation,
  AgentMessage,
  EventMode,
  EventParticipant,
  Goal,
  Id,
  Match,
  OverlapEvent,
  Profile,
} from './types'

interface State {
  identity: Id
  profiles: Profile[]
  goals: Goal[]
  events: OverlapEvent[]
  participants: EventParticipant[]
  conversations: AgentConversation[]
  messages: AgentMessage[]
  matches: Match[]
  typing: Record<string, Id | undefined> // conversationId -> speaker currently typing
}

const STORAGE_KEY = 'overlap-mock-state-v1'
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
let seq = 0
const uid = (p = 'x') => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`
const makeCode = () =>
  Array.from({ length: 4 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('')

/* ------------------------------------------------------------------ *
 * Seed cast — the "townsfolk" whose agents your agent will talk to.   *
 * ------------------------------------------------------------------ */
interface Npc {
  identity: Id
  profile: Omit<Profile, 'identity' | 'updatedAt'>
  goals: string[]
  score: number
  metrics: Match['metrics']
  summary: string
  commonGround: string[]
  icebreakers: string[]
}

const NPCS: Npc[] = [
  {
    identity: 'npc_sam',
    profile: {
      name: 'Sam',
      role: 'Backend Engineer · real-time systems',
      workingOn: 'A live sync layer for collaborative apps',
      interests: 'real-time data, SpacetimeDB, K-pop',
      lookingFor: 'people building live analytics',
      offering: 'deep infra + sync expertise',
      personality: 'dry, generous, gets nerdy fast',
    },
    goals: ['Ship the sync layer to prod', 'Find a design-minded cofounder'],
    score: 87,
    metrics: { goalAlignment: 88, sharedInterests: 92, complementarySkills: 78, vibe: 85 },
    summary:
      "You both live at the intersection of data and real-time products — Sam's building exactly the infra you'd want for live analytics.",
    commonGround: ['real-time data', 'SpacetimeDB', 'side projects'],
    icebreakers: [
      'Ask Sam how he handles live sync at scale',
      'Swap hackathon war stories',
      'Wait, you both like K-pop??',
    ],
  },
  {
    identity: 'npc_mei',
    profile: {
      name: 'Mei',
      role: 'Product Designer · design systems',
      workingOn: 'A token-driven theming kit for game UIs',
      interests: 'cozy games, pixel art, motion design',
      lookingFor: 'engineers who care about craft',
      offering: 'design systems + prototyping',
      personality: 'warm, detail-obsessed, playful',
    },
    goals: ['Open-source the theming kit', 'Collaborate with a builder this weekend'],
    score: 74,
    metrics: { goalAlignment: 70, sharedInterests: 80, complementarySkills: 86, vibe: 79 },
    summary:
      'Mei makes the warm, tactile interfaces your product ideas deserve — a strong complementary match for shipping something polished fast.',
    commonGround: ['cozy aesthetics', 'side projects', 'craft'],
    icebreakers: [
      "Ask Mei about her pixel-art workflow",
      'Compare favorite cozy games',
      'Pitch her your weekend build',
    ],
  },
  {
    identity: 'npc_jordan',
    profile: {
      name: 'Jordan',
      role: 'ML Researcher · LLM evaluation',
      workingOn: 'Agent-vs-agent eval harnesses',
      interests: 'multi-agent systems, evals, climbing',
      lookingFor: 'product people to ground research',
      offering: 'eval design + model intuition',
      personality: 'curious, rigorous, asks great questions',
    },
    goals: ['Publish an eval benchmark', 'Meet 3 product builders'],
    score: 81,
    metrics: { goalAlignment: 84, sharedInterests: 76, complementarySkills: 83, vibe: 80 },
    summary:
      "Jordan studies exactly the agent dynamics Overlap is built on — they'd love to pressure-test how your agents actually behave.",
    commonGround: ['AI agents', 'shipping fast', 'curiosity'],
    icebreakers: [
      'Ask how Jordan evaluates agent conversations',
      'Trade notes on prompt design',
      'Find out what they’re climbing next',
    ],
  },
]

/* ------------------------------------------------------------------ *
 * Store                                                               *
 * ------------------------------------------------------------------ */
class OverlapStore {
  private listeners = new Set<() => void>()
  private hydrated = false
  state: State = {
    identity: '',
    profiles: [],
    goals: [],
    events: [],
    participants: [],
    conversations: [],
    messages: [],
    matches: [],
    typing: {},
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.state

  private commit(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    this.persist()
    this.listeners.forEach(l => l())
  }

  private persist() {
    if (typeof localStorage === 'undefined') return
    try {
      const { typing, ...rest } = this.state
      void typing
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    } catch {
      /* ignore quota / serialization errors */
    }
  }

  /** Client-only: load persisted state + ensure a stable identity. */
  hydrate() {
    if (this.hydrated || typeof localStorage === 'undefined') return
    this.hydrated = true
    let next: Partial<State> = {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) next = JSON.parse(raw) as Partial<State>
    } catch {
      /* ignore */
    }
    const identity = next.identity || `me_${makeCode()}${makeCode()}`
    this.state = {
      ...this.state,
      ...next,
      identity,
      typing: {},
    }
    this.persist()
    this.listeners.forEach(l => l())
  }

  /* ---- profile / goals ---- */
  upsertProfile(input: Omit<Profile, 'identity' | 'updatedAt'>) {
    const me = this.state.identity
    const existing = this.state.profiles.find(p => p.identity === me)
    const profile: Profile = { ...input, identity: me, updatedAt: Date.now() }
    this.commit({
      profiles: existing
        ? this.state.profiles.map(p => (p.identity === me ? profile : p))
        : [...this.state.profiles, profile],
    })
  }

  addGoal(text: string, priority: number) {
    this.commit({
      goals: [...this.state.goals, { id: uid('goal'), owner: this.state.identity, text, priority }],
    })
  }

  removeGoal(goalId: string) {
    this.commit({ goals: this.state.goals.filter(g => g.id !== goalId) })
  }

  /* ---- events ---- */
  createEvent(name: string, mode: EventMode): OverlapEvent {
    const event: OverlapEvent = {
      id: uid('evt'),
      code: makeCode(),
      name,
      mode,
      host: this.state.identity,
      status: 'active',
      createdAt: Date.now(),
    }
    this.commit({ events: [...this.state.events, event] })
    this.addParticipant(event.id, this.state.identity)
    this.seedAndSimulate(event.id)
    return event
  }

  joinEvent(code: string): OverlapEvent | undefined {
    const event = this.state.events.find(e => e.code === code.trim().toUpperCase())
    if (!event) return undefined
    this.addParticipant(event.id, this.state.identity)
    this.seedAndSimulate(event.id)
    return event
  }

  private addParticipant(eventId: string, identity: Id) {
    if (this.state.participants.some(p => p.eventId === eventId && p.identity === identity)) return
    this.commit({
      participants: [
        ...this.state.participants,
        {
          id: uid('part'),
          eventId,
          identity,
          joinedAt: Date.now(),
          posX: Math.random(),
          posY: Math.random(),
          status: 'available',
        },
      ],
    })
  }

  /* ---- take-over ---- */
  takeOverConversation(conversationId: string) {
    this.commit({
      conversations: this.state.conversations.map(c =>
        c.id === conversationId ? { ...c, takenOverBy: this.state.identity } : c
      ),
      typing: { ...this.state.typing, [conversationId]: undefined },
    })
  }

  handBack(conversationId: string) {
    this.commit({
      conversations: this.state.conversations.map(c =>
        c.id === conversationId ? { ...c, takenOverBy: undefined } : c
      ),
    })
  }

  postUserMessage(conversationId: string, text: string) {
    const convo = this.state.conversations.find(c => c.id === conversationId)
    if (!convo) return
    this.pushMessage({
      conversationId,
      speaker: this.state.identity,
      authoredByHuman: true,
      text,
    })
    void this.replyAsHuman(conversationId)
  }

  /* ---- internals ---- */
  private pushMessage(m: Omit<AgentMessage, 'id' | 'sent'>) {
    this.commit({
      messages: [...this.state.messages, { ...m, id: uid('msg'), sent: Date.now() }],
    })
  }

  private setTyping(conversationId: string, speaker: Id | undefined) {
    this.commit({ typing: { ...this.state.typing, [conversationId]: speaker } })
  }

  private convo(id: string) {
    return this.state.conversations.find(c => c.id === id)
  }

  /** Seed the event with NPC participants + profiles, then run each agent chat. */
  private seedAndSimulate(eventId: string) {
    const me = this.state.identity
    for (const npc of NPCS) {
      // profile
      if (!this.state.profiles.some(p => p.identity === npc.identity)) {
        this.commit({
          profiles: [
            ...this.state.profiles,
            { ...npc.profile, identity: npc.identity, updatedAt: Date.now() },
          ],
          goals: [
            ...this.state.goals,
            ...npc.goals.map((text, i) => ({
              id: uid('goal'),
              owner: npc.identity,
              text,
              priority: i,
            })),
          ],
        })
      }
      this.addParticipant(eventId, npc.identity)

      // one conversation per (me, npc) pair
      const exists = this.state.conversations.some(
        c =>
          c.eventId === eventId &&
          ((c.participantA === me && c.participantB === npc.identity) ||
            (c.participantA === npc.identity && c.participantB === me))
      )
      if (exists) continue
      const conversation: AgentConversation = {
        id: uid('conv'),
        eventId,
        participantA: me,
        participantB: npc.identity,
        status: 'pending',
        nextSpeaker: npc.identity,
        turnCount: 0,
        startedAt: Date.now(),
      }
      this.commit({ conversations: [...this.state.conversations, conversation] })
      void this.runConversation(conversation.id, npc)
    }
  }

  private async runConversation(conversationId: string, npc: Npc) {
    const me = this.state.identity
    const myProfile = this.state.profiles.find(p => p.identity === me)
    const myName = myProfile?.name || 'You'
    const script: { speaker: Id; text: string }[] = [
      {
        speaker: npc.identity,
        text: `Hey — I'm ${npc.profile.name}'s agent. ${npc.profile.name} is ${npc.profile.role.toLowerCase()}, currently building ${npc.profile.workingOn.toLowerCase()}.`,
      },
      {
        speaker: me,
        text: `Good to meet you. ${myName} is into ${
          myProfile?.interests || 'building things'
        } — and is looking for ${myProfile?.lookingFor || 'interesting collaborators'}.`,
      },
      {
        speaker: npc.identity,
        text: `That lines up well. ${npc.profile.name} is offering ${npc.profile.offering.toLowerCase()} — sounds complementary.`,
      },
      {
        speaker: me,
        text: `Strong overlap, then. Common ground on ${npc.commonGround.join(', ')}. Worth a real intro.`,
      },
      {
        speaker: npc.identity,
        text: `Agreed. One for the record — ${npc.icebreakers[npc.icebreakers.length - 1].toLowerCase()}`,
      },
    ]

    await sleep(700)
    for (const turn of script) {
      const c = this.convo(conversationId)
      if (!c || c.status === 'aborted') return
      if (c.takenOverBy) {
        // human stepped in — stop the scripted agent dialogue
        this.setTyping(conversationId, undefined)
        return
      }
      this.setTyping(conversationId, turn.speaker)
      this.commit({
        conversations: this.state.conversations.map(x =>
          x.id === conversationId ? { ...x, status: 'running' } : x
        ),
      })
      await sleep(950 + (turn.text.length > 90 ? 500 : 0))
      const c2 = this.convo(conversationId)
      if (!c2 || c2.status === 'aborted' || c2.takenOverBy) {
        this.setTyping(conversationId, undefined)
        return
      }
      this.setTyping(conversationId, undefined)
      this.pushMessage({
        conversationId,
        speaker: turn.speaker,
        authoredByHuman: false,
        text: turn.text,
      })
      this.commit({
        conversations: this.state.conversations.map(x =>
          x.id === conversationId
            ? { ...x, turnCount: x.turnCount + 1, nextSpeaker: x.participantA === turn.speaker ? x.participantB : x.participantA }
            : x
        ),
      })
      await sleep(700)
    }

    // budget reached → score it into a match (owner = me)
    const final = this.convo(conversationId)
    if (!final || final.takenOverBy) return
    const match: Match = {
      id: uid('match'),
      eventId: final.eventId,
      owner: me,
      other: npc.identity,
      conversationId,
      score: npc.score,
      metrics: npc.metrics,
      summary: npc.summary,
      commonGround: npc.commonGround,
      icebreakers: npc.icebreakers,
      createdAt: Date.now(),
    }
    this.commit({
      matches: [...this.state.matches.filter(m => m.conversationId !== conversationId || m.owner !== me), match],
      conversations: this.state.conversations.map(x =>
        x.id === conversationId ? { ...x, status: 'scored', endedAt: Date.now() } : x
      ),
    })
  }

  /** After the human posts, the other side replies live (the "connection made" moment). */
  private async replyAsHuman(conversationId: string) {
    const convo = this.convo(conversationId)
    if (!convo) return
    const npcId = convo.participantA === this.state.identity ? convo.participantB : convo.participantA
    const npc = NPCS.find(n => n.identity === npcId)
    const pool = npc
      ? [
          `Oh nice — ${npc.profile.workingOn.toLowerCase()} is literally my whole week. Coffee after the demo?`,
          `Ha, ${npc.commonGround[0]} for the win. Let's actually talk in person.`,
          `Find me by the SpacetimeDB booth — would love to compare notes.`,
        ]
      : ['Sounds great — let’s meet up after this!']
    await sleep(1100)
    if (this.convo(conversationId)?.status === 'aborted') return
    this.setTyping(conversationId, npcId)
    await sleep(1300)
    this.setTyping(conversationId, undefined)
    this.pushMessage({
      conversationId,
      speaker: npcId,
      authoredByHuman: true,
      text: pool[Math.floor(Math.random() * pool.length)],
    })
  }
}

export const store = new OverlapStore()

/* ------------------------------------------------------------------ *
 * React bindings                                                      *
 * ------------------------------------------------------------------ */
const StoreContext = createContext<OverlapStore>(store)

export function OverlapProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    store.hydrate()
  }, [])
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

function useStoreState(): State {
  const s = useContext(StoreContext)
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot)
}

/** Actions + current identity. */
export function useOverlap() {
  const s = useContext(StoreContext)
  const state = useStoreState()
  return {
    identity: state.identity,
    upsertProfile: s.upsertProfile.bind(s),
    addGoal: s.addGoal.bind(s),
    removeGoal: s.removeGoal.bind(s),
    createEvent: s.createEvent.bind(s),
    joinEvent: s.joinEvent.bind(s),
    takeOverConversation: s.takeOverConversation.bind(s),
    handBack: s.handBack.bind(s),
    postUserMessage: s.postUserMessage.bind(s),
  }
}

export function useMyProfile(): Profile | undefined {
  const state = useStoreState()
  return useMemo(
    () => state.profiles.find(p => p.identity === state.identity),
    [state.profiles, state.identity]
  )
}

export function useProfile(identity: Id): Profile | undefined {
  const state = useStoreState()
  return useMemo(() => state.profiles.find(p => p.identity === identity), [state.profiles, identity])
}

export function useMyGoals(): Goal[] {
  const state = useStoreState()
  return useMemo(
    () =>
      state.goals
        .filter(g => g.owner === state.identity)
        .sort((a, b) => a.priority - b.priority),
    [state.goals, state.identity]
  )
}

export function useMyEvents(): OverlapEvent[] {
  const state = useStoreState()
  return useMemo(() => {
    const mine = new Set(
      state.participants.filter(p => p.identity === state.identity).map(p => p.eventId)
    )
    return state.events
      .filter(e => mine.has(e.id))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [state.events, state.participants, state.identity])
}

export function useEvent(eventId: string): OverlapEvent | undefined {
  const state = useStoreState()
  return useMemo(() => state.events.find(e => e.id === eventId), [state.events, eventId])
}

export function useParticipants(eventId: string): EventParticipant[] {
  const state = useStoreState()
  return useMemo(
    () => state.participants.filter(p => p.eventId === eventId),
    [state.participants, eventId]
  )
}

export function useMyMatches(eventId: string): Match[] {
  const state = useStoreState()
  return useMemo(
    () =>
      state.matches
        .filter(m => m.eventId === eventId && m.owner === state.identity)
        .sort((a, b) => b.score - a.score),
    [state.matches, eventId, state.identity]
  )
}

export function useMyConversations(eventId: string): AgentConversation[] {
  const state = useStoreState()
  return useMemo(
    () =>
      state.conversations
        .filter(
          c =>
            c.eventId === eventId &&
            (c.participantA === state.identity || c.participantB === state.identity)
        )
        .sort((a, b) => a.startedAt - b.startedAt),
    [state.conversations, eventId, state.identity]
  )
}

export function useConversation(conversationId: string | undefined): AgentConversation | undefined {
  const state = useStoreState()
  return useMemo(
    () => state.conversations.find(c => c.id === conversationId),
    [state.conversations, conversationId]
  )
}

export function useMessages(conversationId: string | undefined): AgentMessage[] {
  const state = useStoreState()
  return useMemo(
    () =>
      state.messages
        .filter(m => m.conversationId === conversationId)
        .sort((a, b) => a.sent - b.sent),
    [state.messages, conversationId]
  )
}

export function useTyping(conversationId: string | undefined): Id | undefined {
  const state = useStoreState()
  return conversationId ? state.typing[conversationId] : undefined
}
