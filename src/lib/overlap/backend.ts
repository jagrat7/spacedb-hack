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
  Event as OverlapEvent,
  Match,
  Profile,
} from '../../module_bindings/types'
import { runAgentReply, runMatch } from '@/server/match'

// ── Helpers ────────────────────────────────────────────────────────────────

export const normHex = (hex: string) => hex.toLowerCase().replace(/^0x/, '')

export function pairKeyFor(eventId: bigint, aHex: string, bHex: string): string {
  const [first, second] = [normHex(aHex), normHex(bHex)].sort()
  return `${Number(eventId)}:${first}:${second}`
}

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
}

export type Facing = 'left' | 'right'

export type Spot = { x: number; y: number; facing: Facing }

// One avatar in the plaza: who they are plus where they're standing. `isMe`
// flags the local player; `pairKey`/`match` are only set for other attendees
// (the pair between them and me), driving the introduce action + match lines.
export type PlazaPerson = {
  hex: string
  profile?: Profile
  spot: Spot
  isMe: boolean
  pairKey?: string
  match?: Match
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

// Presence lives in its own subscription so that, before the `presence` table
// is published to the module, a failure here can't tear down the board/chat
// subscription above. Safe to call alongside useOverlapSubscriptions.
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

// Deterministic spawn spot from an identity hex, so attendees who haven't moved
// yet are scattered around the plaza instead of stacked at the origin.
export function spawnSpot(hex: string): Spot {
  const h = normHex(hex)
  let a = 0
  let b = 0
  for (let i = 0; i < h.length; i++) {
    a = (a * 31 + h.charCodeAt(i)) >>> 0
    b = (b * 17 + h.charCodeAt(h.length - 1 - i)) >>> 0
  }
  // Keep spawns within an inset box so nobody lands flush against an edge.
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

  const [profiles] = useSpacetimeDBQuery(tables.profile)
  const [events] = useSpacetimeDBQuery(tables.event)
  const [attendees] = useSpacetimeDBQuery(tables.attendee)
  const [matches] = useSpacetimeDBQuery(tables.match)
  const [agentMessages] = useSpacetimeDBQuery(tables.agentMessage)
  const [presences] = useSpacetimeDBQuery(tables.presence)

  const sendChatMessage = useReducer(reducers.sendChatMessage)
  const updatePosition = useReducer(reducers.updatePosition)
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
      result.push({ otherHex, profile, pairKey, match: matchByKey.get(pairKey) })
    }
    return result.sort((x, y) => (y.match?.score ?? -1) - (x.match?.score ?? -1))
  }, [attendees, profiles, matchByKey, eventId, myHex])

  // ── Plaza ──────────────────────────────────────────────────────────────────
  // Live position per attendee, keyed by normalized hex. Missing rows fall back
  // to a deterministic spawn spot in the component.
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

  // Every avatar to draw: me + each other attendee that has a profile. Position
  // comes from presence, else a stable spawn spot.
  const people = useMemo<PlazaPerson[]>(() => {
    if (eventId === null || !myHex) return []
    const list: PlazaPerson[] = []
    if (myProfile) {
      list.push({
        hex: normHex(myHex),
        profile: myProfile,
        spot: spotByHex.get(normHex(myHex)) ?? spawnSpot(myHex),
        isMe: true,
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
      })
    }
    return list
  }, [others, myProfile, myHex, spotByHex, eventId])

  // Match lines to glow in the plaza: every streaming pair in the room whose
  // endpoints we can place. This is the room's live match graph made visible.
  const liveLinks = useMemo(() => {
    if (eventId === null) return [] as { aHex: string; bHex: string }[]
    const links: { aHex: string; bHex: string }[] = []
    for (const m of matches) {
      if (m.eventId !== eventId || m.status !== 'streaming') continue
      links.push({
        aHex: normHex(m.aIdentity.toHexString()),
        bHex: normHex(m.bIdentity.toHexString()),
      })
    }
    return links
  }, [matches, eventId])

  const move = (x: number, y: number, facing: Facing) => {
    if (eventId === null) return
    updatePosition({ eventId, x, y, facing })
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
    begin,
    reRun,
    mySideFor,
    // plaza
    people,
    liveLinks,
    move,
  }
}
