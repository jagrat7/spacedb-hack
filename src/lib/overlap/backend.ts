// Bridges the cozy Overlap UI to the real SpacetimeDB backend. The backend
// (module + generated bindings) is the source of truth; these hooks expose its
// tables/reducers in the shapes the cozy routes need.

import { useEffect, useMemo, useRef } from 'react'
import {
  useReducer,
  useSpacetimeDB,
  useSpacetimeDBQuery,
} from 'spacetimedb/tanstack'
import { DbConnection, reducers, tables } from '../../module_bindings'
import type {
  AgentMessage,
  Billboard,
  Event as OverlapEvent,
  Match,
  Profile,
} from '../../module_bindings/types'
import type { Ring } from '../../module_bindings/types'
import { runAgentReply, runMatch } from '@/server/match'

// ── Helpers ────────────────────────────────────────────────────────────────

export const normHex = (hex: string) => hex.toLowerCase().replace(/^0x/, '')

export function pairKeyFor(eventId: bigint, aHex: string, bHex: string): string {
  const [first, second] = [normHex(aHex), normHex(bHex)].sort()
  return `${Number(eventId)}:${first}:${second}`
}

// Ring keys are directional (sender→recipient), matching the module's ringKey.
export function ringKeyFor(eventId: bigint, fromHex: string, toHex: string): string {
  return `${Number(eventId)}:${normHex(fromHex)}:${normHex(toHex)}`
}

// 'idle' nobody's ringing · 'outgoing' I rang them, waiting · 'incoming' they
// rang me, waiting · 'active' accepted, both phones ringing.
export type RingState = 'idle' | 'outgoing' | 'incoming' | 'active'

export type IncomingRing = { rkey: string; fromHex: string; profile?: Profile }

export type ActiveRing = { rkey: string; otherHex: string; profile?: Profile }

// speaker is 'a'/'b' (that side's AI agent) or 'a_human'/'b_human' (the real
// attendee on that side). The leading char is the side.
export const sideOf = (speaker: string): 'a' | 'b' =>
  speaker.charAt(0) === 'b' ? 'b' : 'a'
export const isHumanSpeaker = (speaker: string) => speaker.includes('_human')

export function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export type ProfileLite = {
  name: string
  goals: string
  socials: string
  bio: string
  persona: string
}

export const toLite = (p: Profile): ProfileLite => ({
  name: p.name,
  goals: p.goals,
  socials: p.socials,
  bio: p.bio,
  persona: p.persona,
})

export const avatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`

export type Other = {
  otherHex: string
  profile: Profile
  pairKey: string
  match?: Match
  // true when this attendee has a live presence row (a real, connected user
  // walking their avatar). false for seeded NPCs that nobody is driving.
  live: boolean
}

export type Facing = 'left' | 'right'

export type Spot = { x: number; y: number; facing: Facing }

export type PlazaPerson = {
  hex: string
  profile?: Profile
  spot: Spot
  isMe: boolean
  pairKey?: string
  match?: Match
  // false for seeded NPCs (no live presence row); they wander client-side and
  // pause when a real visitor stands next to them. Always true for `isMe`.
  live: boolean
}

// ── Subscriptions ────────────────────────────────────────────────────────────

function useOverlapSubscriptions() {
  const { isActive, getConnection } = useSpacetimeDB()
  useEffect(() => {
    if (!isActive) return
    const conn = getConnection() as DbConnection | null
    if (!conn) return
    conn
      .subscriptionBuilder()
      .subscribe([
        tables.profile,
        tables.event,
        tables.attendee,
        tables.match,
        tables.agentMessage,
      ])
  }, [isActive, getConnection])
}

function usePresenceSubscription() {
  const { isActive, getConnection } = useSpacetimeDB()
  useEffect(() => {
    if (!isActive) return
    const conn = getConnection() as DbConnection | null
    if (!conn) return
    try {
      conn.subscriptionBuilder().subscribe([tables.presence])
    } catch {
      // table not published yet — plaza degrades to spawn-only positions
    }
  }, [isActive, getConnection])
}

function useRingSubscription() {
  const { isActive, getConnection } = useSpacetimeDB()
  useEffect(() => {
    if (!isActive) return
    const conn = getConnection() as DbConnection | null
    if (!conn) return
    try {
      conn.subscriptionBuilder().subscribe([tables.ring])
    } catch {
      // table not published yet — ring feature degrades to no-op
    }
  }, [isActive, getConnection])
}

function useBillboardSubscription() {
  const { isActive, getConnection } = useSpacetimeDB()
  useEffect(() => {
    if (!isActive) return
    const conn = getConnection() as DbConnection | null
    if (!conn) return
    try {
      conn.subscriptionBuilder().subscribe([tables.billboard])
    } catch {
      // table not published yet — billboard degrades to empty
    }
  }, [isActive, getConnection])
}

export function spawnSpot(hex: string): Spot {
  const h = normHex(hex)
  let a = 0
  let b = 0
  for (let i = 0; i < h.length; i++) {
    a = (a * 31 + h.charCodeAt(i)) >>> 0
    b = (b * 17 + h.charCodeAt(h.length - 1 - i)) >>> 0
  }
  const x = 0.12 + (a % 1000) / 1000 * 0.76
  const y = 0.18 + (b % 1000) / 1000 * 0.64
  return { x, y, facing: a % 2 === 0 ? 'right' : 'left' }
}

// ── Home (onboarding + lobby) ────────────────────────────────────────────────

export function useOverlapHome() {
  const { identity, isActive } = useSpacetimeDB()
  useOverlapSubscriptions()

  const [profiles] = useSpacetimeDBQuery(tables.profile)
  const [events] = useSpacetimeDBQuery(tables.event)
  const [attendees] = useSpacetimeDBQuery(tables.attendee)

  const myHex = identity?.toHexString()
  const myProfile = useMemo(
    () =>
      profiles.find(
        p => myHex && normHex(p.identity.toHexString()) === normHex(myHex)
      ),
    [profiles, myHex]
  )

  const myEvents = useMemo<OverlapEvent[]>(() => {
    if (!myHex) return []
    const mine = new Set(
      attendees
        .filter(a => normHex(a.identity.toHexString()) === normHex(myHex))
        .map(a => String(a.eventId))
    )
    return events.filter(e => mine.has(String(e.id)))
  }, [events, attendees, myHex])

  const upsertProfile = useReducer(reducers.upsertProfile)
  const joinEvent = useReducer(reducers.joinEvent)

  return {
    connected: isActive && !!identity,
    myHex,
    myProfile,
    events,
    myEvents,
    upsertProfile,
    joinEvent,
  }
}

// ── Event room (quest board + dialogue) ──────────────────────────────────────

export function useEventRoom(eventIdStr: string) {
  const { identity } = useSpacetimeDB()
  useOverlapSubscriptions()
  usePresenceSubscription()
  useRingSubscription()
  useBillboardSubscription()

  const [profiles] = useSpacetimeDBQuery(tables.profile)
  const [events] = useSpacetimeDBQuery(tables.event)
  const [attendees] = useSpacetimeDBQuery(tables.attendee)
  const [matches] = useSpacetimeDBQuery(tables.match)
  const [agentMessages] = useSpacetimeDBQuery(tables.agentMessage)
  const [presences] = useSpacetimeDBQuery(tables.presence)
  const [rings] = useSpacetimeDBQuery(tables.ring)
  const [billboards] = useSpacetimeDBQuery(tables.billboard)

  const sendChatMessage = useReducer(reducers.sendChatMessage)
  const openPlazaChatReducer = useReducer(reducers.openPlazaChat)
  const updatePosition = useReducer(reducers.updatePosition)
  const sendRingReducer = useReducer(reducers.sendRing)
  const acceptRingReducer = useReducer(reducers.acceptRing)
  const dismissRingReducer = useReducer(reducers.dismissRing)
  const setBillboardReducer = useReducer(reducers.setBillboard)
  const triggered = useRef(new Set<string>())

  const eventId = useMemo<bigint | null>(() => {
    try {
      return BigInt(eventIdStr)
    } catch {
      return null
    }
  }, [eventIdStr])

  const myHex = identity?.toHexString()
  const event = useMemo(
    () => events.find(e => eventId !== null && e.id === eventId),
    [events, eventId]
  )
  const myProfile = useMemo(
    () =>
      profiles.find(
        p => myHex && normHex(p.identity.toHexString()) === normHex(myHex)
      ),
    [profiles, myHex]
  )
  const matchByKey = useMemo(() => {
    const m = new Map<string, Match>()
    for (const row of matches) m.set(row.pairKey, row)
    return m
  }, [matches])

  // The shared plaza billboard for this event (one row, or none yet).
  const billboard = useMemo<Billboard | undefined>(
    () =>
      eventId === null
        ? undefined
        : billboards.find(b => b.eventId === eventId),
    [billboards, eventId]
  )

  // Identities with a live presence row in this event — i.e. real, connected
  // users driving their avatar. Anyone else (seeded NPCs) wanders client-side.
  const liveHexes = useMemo(() => {
    const s = new Set<string>()
    if (eventId === null) return s
    for (const p of presences) {
      if (p.eventId === eventId) s.add(normHex(p.identity.toHexString()))
    }
    return s
  }, [presences, eventId])

  const others = useMemo<Other[]>(() => {
    if (eventId === null || !myHex) return []
    const result: Other[] = []
    for (const a of attendees) {
      if (a.eventId !== eventId) continue
      const otherHex = a.identity.toHexString()
      if (normHex(otherHex) === normHex(myHex)) continue
      const profile = profiles.find(
        p => normHex(p.identity.toHexString()) === normHex(otherHex)
      )
      if (!profile) continue
      const pairKey = pairKeyFor(eventId, myHex, otherHex)
      result.push({
        otherHex,
        profile,
        pairKey,
        match: matchByKey.get(pairKey),
        live: liveHexes.has(normHex(otherHex)),
      })
    }
    return result.sort((x, y) => (y.match?.score ?? -1) - (x.match?.score ?? -1))
  }, [attendees, profiles, matchByKey, eventId, myHex, liveHexes])

  const profileByHex = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(normHex(p.identity.toHexString()), p)
    return m
  }, [profiles])

  // Rings touching me in this event (either direction).
  const myRings = useMemo<Ring[]>(() => {
    if (eventId === null || !myHex) return []
    const me = normHex(myHex)
    return rings.filter(
      r =>
        r.eventId === eventId &&
        (normHex(r.fromIdentity.toHexString()) === me ||
          normHex(r.toIdentity.toHexString()) === me)
    )
  }, [rings, eventId, myHex])

  // Per-other ring state, so each MatchCard knows what button to show.
  const ringByHex = useMemo(() => {
    const m = new Map<string, { state: RingState; rkey: string }>()
    if (!myHex) return m
    const me = normHex(myHex)
    for (const o of others) {
      const oh = normHex(o.otherHex)
      const out = myRings.find(
        r =>
          normHex(r.fromIdentity.toHexString()) === me &&
          normHex(r.toIdentity.toHexString()) === oh
      )
      const inc = myRings.find(
        r =>
          normHex(r.fromIdentity.toHexString()) === oh &&
          normHex(r.toIdentity.toHexString()) === me
      )
      if (out?.status === 'accepted') m.set(oh, { state: 'active', rkey: out.rkey })
      else if (inc?.status === 'accepted') m.set(oh, { state: 'active', rkey: inc.rkey })
      else if (inc?.status === 'pending') m.set(oh, { state: 'incoming', rkey: inc.rkey })
      else if (out?.status === 'pending') m.set(oh, { state: 'outgoing', rkey: out.rkey })
    }
    return m
  }, [others, myRings, myHex])

  // Pending rings aimed at me — surfaced as accept/decline notifications.
  const incomingRings = useMemo<IncomingRing[]>(() => {
    if (!myHex) return []
    const me = normHex(myHex)
    return myRings
      .filter(r => normHex(r.toIdentity.toHexString()) === me && r.status === 'pending')
      .map(r => {
        const fromHex = normHex(r.fromIdentity.toHexString())
        return { rkey: r.rkey, fromHex, profile: profileByHex.get(fromHex) }
      })
  }, [myRings, myHex, profileByHex])

  // The accepted ring (if any) — drives the audible beacon on both phones.
  const activeRing = useMemo<ActiveRing | undefined>(() => {
    if (!myHex) return undefined
    const me = normHex(myHex)
    const r = myRings.find(x => x.status === 'accepted')
    if (!r) return undefined
    const otherHex =
      normHex(r.fromIdentity.toHexString()) === me
        ? normHex(r.toIdentity.toHexString())
        : normHex(r.fromIdentity.toHexString())
    return { rkey: r.rkey, otherHex, profile: profileByHex.get(otherHex) }
  }, [myRings, myHex, profileByHex])

  const sendRing = (o: Other) => {
    if (eventId === null) return
    sendRingReducer({ eventId, toIdentity: o.profile.identity })
  }
  const acceptRing = (rkey: string) => acceptRingReducer({ rkey })
  const dismissRing = (rkey: string) => dismissRingReducer({ rkey })

  const spotByHex = useMemo(() => {
    const m = new Map<string, Spot>()
    if (eventId === null) return m
    for (const p of presences) {
      if (p.eventId !== eventId) continue
      m.set(normHex(p.identity.toHexString()), {
        x: p.x,
        y: p.y,
        facing: p.facing === 'left' ? 'left' : 'right',
      })
    }
    return m
  }, [presences, eventId])

  const people = useMemo<PlazaPerson[]>(() => {
    if (eventId === null || !myHex) return []
    const list: PlazaPerson[] = []
    if (myProfile) {
      list.push({
        hex: normHex(myHex),
        profile: myProfile,
        spot: spotByHex.get(normHex(myHex)) ?? spawnSpot(myHex),
        isMe: true,
        live: true,
      })
    }
    for (const o of others) {
      list.push({
        hex: normHex(o.otherHex),
        profile: o.profile,
        spot: spotByHex.get(normHex(o.otherHex)) ?? spawnSpot(o.otherHex),
        isMe: false,
        pairKey: o.pairKey,
        match: o.match,
        live: o.live,
      })
    }
    return list
  }, [others, myProfile, myHex, spotByHex, eventId])

  const move = (x: number, y: number, facing: Facing) => {
    if (eventId === null) return
    updatePosition({ eventId, x, y, facing })
  }

  const setBillboard = (message: string) => {
    if (eventId === null || !message.trim()) return
    setBillboardReducer({ eventId, message: message.trim() })
  }

  // Matches are no longer auto-run on entry (that burned API tokens against
  // every attendee on every visit). A match only runs when the user taps
  // "Begin chat" → begin(), or "↻" → reRun(). triggered guards double-taps.
  const runFor = (o: Other) => {
    if (eventId === null || !myHex || !myProfile) return
    runMatch({
      data: {
        eventId: Number(eventId),
        aIdentity: myHex,
        bIdentity: o.otherHex,
        aProfile: toLite(myProfile),
        bProfile: toLite(o.profile),
      },
    }).catch(() => triggered.current.delete(o.pairKey))
  }

  const begin = (o: Other) => {
    if (triggered.current.has(o.pairKey) || matchByKey.has(o.pairKey)) return
    triggered.current.add(o.pairKey)
    runFor(o)
  }

  const messagesByPair = useMemo(() => {
    const m = new Map<string, AgentMessage[]>()
    for (const msg of agentMessages) {
      const arr = m.get(msg.pairKey) ?? []
      arr.push(msg)
      m.set(msg.pairKey, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.turn - b.turn)
    return m
  }, [agentMessages])

  const messagesRef = useRef(messagesByPair)
  messagesRef.current = messagesByPair

  const onSendChat = (
    pairKey: string,
    otherHex: string,
    otherProfile: Profile,
    text: string
  ) => {
    if (!myHex || !text.trim()) return
    sendChatMessage({ pairKey, text: text.trim() })
    const responderSide: 'a' | 'b' =
      normHex(myHex) <= normHex(otherHex) ? 'b' : 'a'
    setTimeout(() => {
      const msgs = messagesRef.current.get(pairKey) ?? []
      const responderTookOver = msgs.some(
        m => sideOf(m.speaker) === responderSide && isHumanSpeaker(m.speaker)
      )
      if (responderTookOver) return
      runAgentReply({
        data: { pairKey, responderSide, responderProfile: toLite(otherProfile) },
      }).catch(() => {})
    }, 1500)
  }

  const onSendDirectChat = (pairKey: string, text: string) => {
    if (!text.trim()) return
    sendChatMessage({ pairKey, text: text.trim() })
  }

  const openPlazaChat = (other: Other) => {
    if (eventId === null) return
    openPlazaChatReducer({ eventId, otherIdentity: other.profile.identity })
  }

  // Auto-start a plaza chat with a seeded NPC: create the lightweight match row
  // (so the human can reply) and have the NPC's agent open with a greeting, so
  // the conversation is already going the moment the visitor arrives. No-op if
  // the pair already has a transcript (don't re-greet an existing chat).
  const autoGreetPlaza = (other: Other) => {
    if (eventId === null || !myHex) return
    openPlazaChatReducer({ eventId, otherIdentity: other.profile.identity })
    if ((messagesRef.current.get(other.pairKey) ?? []).length > 0) return
    // The NPC sits on the opposite side from me (canonical: smaller hex is 'a').
    const npcSide: 'a' | 'b' =
      normHex(myHex) <= normHex(other.otherHex) ? 'b' : 'a'
    runAgentReply({
      data: {
        pairKey: other.pairKey,
        responderSide: npcSide,
        responderProfile: toLite(other.profile),
      },
    }).catch(() => {})
  }

  const reRun = (o: Other) => {
    triggered.current.add(o.pairKey)
    runFor(o)
  }

  const mySideFor = (otherHex: string): 'a' | 'b' =>
    myHex && normHex(myHex) <= normHex(otherHex) ? 'a' : 'b'

  return {
    eventId,
    event,
    myHex,
    myProfile,
    others,
    messagesByPair,
    onSendChat,
    onSendDirectChat,
    openPlazaChat,
    autoGreetPlaza,
    begin,
    reRun,
    mySideFor,
    people,
    move,
    billboard,
    setBillboard,
    ringByHex,
    incomingRings,
    activeRing,
    sendRing,
    acceptRing,
    dismissRing,
  }
}
