// Overlap data contract — mirrors the SpacetimeDB tables in docs/plans/backend.md.
// These are the plain TS shapes the mock store serves. When the real module
// bindings land, swap the store hooks for `useSpacetimeDBQuery`/`useReducer`
// and these types map 1:1 onto the generated row types.

/** Mock identity — a stable hex string. Real bindings use `Identity`. */
export type Id = string

export type EventMode = 'online' | 'offline'
export type EventStatus = 'lobby' | 'active' | 'ended'
export type ParticipantStatus = 'available' | 'chatting' | 'away'
export type ConversationStatus = 'pending' | 'running' | 'scored' | 'aborted'

export interface Profile {
  identity: Id
  name: string
  role: string
  workingOn: string
  interests: string
  lookingFor: string
  offering: string
  personality: string
  updatedAt: number
}

export interface Goal {
  id: string
  owner: Id
  text: string
  priority: number
}

export interface OverlapEvent {
  id: string
  code: string
  name: string
  mode: EventMode
  host: Id
  status: EventStatus
  createdAt: number
}

export interface EventParticipant {
  id: string
  eventId: string
  identity: Id
  joinedAt: number
  posX: number
  posY: number
  status: ParticipantStatus
}

export interface AgentConversation {
  id: string
  eventId: string
  participantA: Id
  participantB: Id
  status: ConversationStatus
  nextSpeaker: Id
  takenOverBy?: Id
  turnCount: number
  startedAt: number
  endedAt?: number
}

export interface AgentMessage {
  id: string
  conversationId: string
  speaker: Id
  authoredByHuman: boolean
  text: string
  sent: number
}

export interface MatchMetrics {
  goalAlignment: number
  sharedInterests: number
  complementarySkills: number
  vibe: number
}

export interface Match {
  id: string
  eventId: string
  owner: Id
  other: Id
  conversationId: string
  score: number
  metrics: MatchMetrics
  summary: string
  commonGround: string[]
  icebreakers: string[]
  createdAt: number
}
