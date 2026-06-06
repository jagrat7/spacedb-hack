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
  role: string
  workingOn: string
  interests: string
  lookingFor: string
  offer: string
}

export const toLite = (p: Profile): ProfileLite => ({
  name: p.name,
  role: p.role,
  workingOn: p.workingOn,
  interests: p.interests,
  lookingFor: p.lookingFor,
  offer: p.offer,
})

export const avatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`

export type Other = {
  otherHex: string
  profile: Profile
  pairKey: string
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

  const [profiles] = useSpacetimeDBQuery(tables.profile)
  const [events] = useSpacetimeDBQuery(tables.event)
  const [attendees] = useSpacetimeDBQuery(tables.attendee)
  const [matches] = useSpacetimeDBQuery(tables.match)
  const [agentMessages] = useSpacetimeDBQuery(tables.agentMessage)

  const sendChatMessage = useReducer(reducers.sendChatMessage)
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
  const myAttendee = useMemo(
    () =>
      attendees.find(
        a =>
          eventId !== null &&
          a.eventId === eventId &&
          myHex &&
          normHex(a.identity.toHexString()) === normHex(myHex)
      ),
    [attendees, eventId, myHex]
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

  useEffect(() => {
    if (eventId === null || !myAttendee || !myHex || !myProfile) return
    const timers: ReturnType<typeof setTimeout>[] = []

    const fire = (o: Other) => {
      if (triggered.current.has(o.pairKey)) return
      triggered.current.add(o.pairKey)
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

    for (const o of others) {
      if (matchByKey.has(o.pairKey)) continue
      if (triggered.current.has(o.pairKey)) continue
      const amCanonicalA = normHex(myHex) <= normHex(o.otherHex)
      if (amCanonicalA) fire(o)
      else timers.push(setTimeout(() => fire(o), 4000))
    }
    return () => timers.forEach(clearTimeout)
  }, [others, eventId, myAttendee, myHex, myProfile, matchByKey])

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
    if (eventId === null || !myHex || !myProfile) return
    triggered.current.add(o.pairKey)
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
    reRun,
    mySideFor,
  }
}
