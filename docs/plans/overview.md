# Overlap — Implementation Plan (Main)

AI-agent networking app for events, built on SpacetimeDB. See
[product brief](../product.md). This is the top-level plan; detailed task lists
live in [backend.md](./backend.md) and [frontend.md](./frontend.md).

## Goal of this milestone

Turn the current chat template into the Overlap MVP:

1. **Auth + profile** — SpacetimeAuth identity, with a profile that seeds the
   user's agent (role, what they're building, interests, what they want/offer,
   personality, and **goals**).
2. **Agent-to-agent live chats** — each user's agent autonomously talks to other
   attendees' agents. Users can **monitor** any conversation and **take over** to
   talk as themselves.
3. **Scoring + match cards** — after a conversation runs for a while, the agent
   produces a score + summary + common ground + icebreakers, surfaced as cards
   for people in the same event.

## Current state (what exists)

| Area | Today |
|------|-------|
| Module (`spacetimedb/src/index.ts`) | `user`, `message` tables; `setName`, `sendMessage`; connect/disconnect presence |
| Client (`src/routes/index.tsx`) | One chat screen: name edit, message feed, online/offline lists |
| Connection (`src/router.tsx`) | STDB connect with token persisted to `localStorage` (SpacetimeAuth baseline) |
| UI | shadcn/ui + Tailwind v4, TanStack Start/Router/Query |

The chat plumbing (subscriptions, reducers, presence) is a useful reference but
the `message` table and single-screen UI will be replaced by the event/agent
model below.

## Target architecture

```
┌──────────────────────────┐      subscriptions / reducers      ┌──────────────────────────┐
│  React client            │ ◄────────────────────────────────► │  SpacetimeDB module       │
│  onboarding, events,     │                                     │  profiles, events,        │
│  match board, plaza,     │                                     │  conversations, matches,  │
│  live chat + take-over   │                                     │  pairing (scheduled)      │
└──────────────────────────┘                                     └────────────▲─────────────┘
                                                                               │ reducers
                                                          subscriptions        │ (writes agent turns
                                                                               │  + scores)
                                                                  ┌────────────┴─────────────┐
                                                                  │  agent-runner (Bun)       │
                                                                  │  service client + LLM     │
                                                                  └──────────────────────────┘
```

**Key decision — where the LLM runs.** STDB reducers must be deterministic (no
network/LLM). So agent dialogue + scoring run **outside** reducers in a dedicated
**`agent-runner` service** (a Bun STDB client that holds the LLM key, drives
conversations, and writes turns/scores back via reducers). This matches the
brief's "your agent does the legwork while you're away" and keeps secrets off the
client.

- _Primary:_ external `agent-runner` service (robust, works while users are
  offline → enables offline pre-screening).
- _Fallback (if time-constrained):_ client-driven driver, where the participant
  with the smaller identity hex runs the loop in-browser. Only works while a
  client is online; documented as a fallback in [backend.md](./backend.md).

## Data model overview

Full column definitions in [backend.md](./backend.md).

| Table | Purpose |
|-------|---------|
| `user` (existing) | identity, name, online presence |
| `profile` | agent seed: role, working on, interests, looking for, offering, personality |
| `goal` | one-to-many goals per user (the core "what I want to achieve") |
| `event` | an event with a join code + mode (online/offline) |
| `event_participant` | who joined an event + plaza position |
| `agent_conversation` | a pairing between two participants' agents |
| `agent_message` | turns in a conversation (agent-authored or human take-over) |
| `match` | the card: score, sub-metrics, summary, common ground, icebreakers |
| `pairing_timer` (scheduled) | periodically pairs unmatched participants |

## Milestones (suggested order)

1. **Profile & auth** — `profile` + `goal` tables, onboarding gate, profile form.
2. **Events** — `event` + `event_participant`, create/join-by-code, lobby.
3. **Pairing + agent MVP** — `agent_conversation`/`agent_message`, `pairingTick`,
   `agent-runner` posting LLM turns.
4. **Scoring + cards** — `submitMatch`, match board UI.
5. **Live chat + take-over** — monitor a conversation, `takeOverConversation`,
   `postUserMessage`.
6. **Plaza** — real-time avatars + glowing match graph.
7. **Polish** — online/offline mode differences, demo seed data.

Each milestone is independently demoable. 1–2 are pure STDB+UI; 3 introduces the
`agent-runner`.

## Cross-cutting conventions

- TypeScript: no `;`, `??` over `||`, kebab-case filenames, theme variables (no
  hardcoded colors).
- Client: TanStack Query via `useSpacetimeDBQuery` + `useReducer`; forms with
  react-hook-form + zod; shadcn CLI for new components; Tailwind v4.
- All writes go through reducers; clients only read via subscriptions.

## Open questions / decisions to confirm

- **LLM provider/model** for `agent-runner` (e.g. OpenAI vs Anthropic) and where
  it's hosted for the demo.
- **agent-runner authorization**: run as module owner vs a seeded service
  identity allow-list (see [backend.md](./backend.md)).
- **Goals**: separate `goal` table (chosen, supports multiple/reordering) vs a
  single text field.
- **Match visibility**: public table + client filter (simpler) vs per-user view
  (more private).
- **Conversation length**: turn count / time budget before scoring.
