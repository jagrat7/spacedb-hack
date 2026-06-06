# Overlap — Backend Plan

Covers the SpacetimeDB module (`spacetimedb/src/index.ts`) and the `agent-runner`
service. See [overview.md](./overview.md) for context. Code shown as compact
signatures only — implement in the module per the TypeScript server rules.

## 1. Tables

All `public: true` unless noted. Naming is snake_case; `ctx.db` accessor is
camelCase.

### `user` (existing — keep)
`identity` (PK), `name` (option string), `online` (bool)

### `profile` — agent seed
`identity` (PK, FK→user), `role`, `workingOn`, `interests`, `lookingFor`,
`offering`, `personality` (all string), `updatedAt` (timestamp)

### `goal` — what the user wants to achieve (one-to-many)
`id` (PK autoInc), `owner` (identity, `.index('btree')`), `text` (string),
`priority` (i32)

### `event`
`id` (PK autoInc), `code` (string, `.unique()`), `name` (string),
`mode` (enum `online | offline`), `host` (identity),
`status` (enum `lobby | active | ended`), `createdAt` (timestamp)

### `event_participant`
`id` (PK autoInc), `eventId` (u64), `identity` (identity),
`joinedAt` (timestamp), `posX` (f32), `posY` (f32),
`status` (enum `available | chatting | away`)
Indexes: `by_event` [eventId], `by_event_user` [eventId, identity]

### `agent_conversation`
`id` (PK autoInc), `eventId` (u64), `participantA` (identity),
`participantB` (identity), `status` (enum `pending | running | scored | aborted`),
`nextSpeaker` (identity), `takenOverBy` (option identity),
`turnCount` (i32), `startedAt` (timestamp), `endedAt` (option timestamp)
Indexes: `by_event` [eventId], `by_status` [status] (runner polling),
`by_pair` [eventId, participantA, participantB] (dedupe pairings)

### `agent_message`
`id` (PK autoInc), `conversationId` (u64, `.index('btree')`),
`speaker` (identity), `authoredByHuman` (bool), `text` (string),
`sent` (timestamp)

### `match` — the card
`id` (PK autoInc), `eventId` (u64), `owner` (identity), `other` (identity),
`conversationId` (u64), `score` (i32, 0–100),
`metrics` (object `MatchMetrics`), `summary` (string),
`commonGround` (array string), `icebreakers` (array string),
`createdAt` (timestamp)
Indexes: `by_event_owner` [eventId, owner], `by_conversation` [conversationId]

`MatchMetrics` = `t.object('MatchMetrics', { goalAlignment, sharedInterests, complementarySkills, vibe })` (each `i32`, 0–100).

### `pairing_timer` (scheduled)
`scheduledId` (PK autoInc), `scheduledAt` (scheduleAt) → triggers `pairingTick`.

### `service_identity` (private) — optional authz
`identity` (PK). Seeded in `init`; whitelists the `agent-runner`. Alternative:
compare against module owner.

## 2. Reducers

### Profile / goals
- `upsertProfile({ role, workingOn, interests, lookingFor, offering, personality })`
  — insert or update `profile` for `ctx.sender`, stamp `updatedAt`.
- `addGoal({ text, priority })` — insert `goal` owned by `ctx.sender`.
- `removeGoal({ goalId })` — delete if `owner == ctx.sender`.
- `setName` (existing) — keep.

### Events
- `createEvent({ name, mode })` — host = `ctx.sender`; generate `code` via
  `ctx.random`; status `lobby`.
- `joinEvent({ code })` — look up event by `code`; guard duplicate via
  `by_event_user`; insert participant with random `posX/posY`.
- `leaveEvent({ eventId })` — delete participant row.
- `updatePosition({ eventId, x, y })` — update caller's participant position
  (client throttles ~10/s).
- `startEvent({ eventId })` / `endEvent({ eventId })` — host only.

### Pairing (deterministic — safe in a reducer)
- `pairingTick(timer)` — scheduled. For each `active` event, take `available`
  participants and create `agent_conversation` rows (status `pending`) for pairs
  not already present (check `by_pair`). Cap new pairings per tick.

### Agent I/O (called by `agent-runner` only)
- `postAgentMessage({ conversationId, speaker, text })` — authorize caller as
  service/owner; append `agent_message` (`authoredByHuman=false`), bump
  `turnCount`, set status `running`, flip `nextSpeaker`.
- `submitMatch({ conversationId, owner, other, score, metrics, summary, commonGround, icebreakers })`
  — authorize as service/owner; insert a `match` row; when both directions
  submitted, set conversation `status=scored`, `endedAt`. (Runner calls once per
  owner so each side gets a card addressed to them.)

### Take-over (human joins)
- `takeOverConversation({ conversationId })` — `ctx.sender` must be a participant;
  set `takenOverBy = ctx.sender`; runner stops generating for that side.
- `postUserMessage({ conversationId, text })` — participant only; append
  `agent_message` (`authoredByHuman=true`, `speaker=ctx.sender`).

### Lifecycle
- `init` — schedule `pairing_timer` (`ScheduleAt.interval(...)`); seed
  `service_identity` if used.
- `onConnect` / `onDisconnect` (existing) — keep; optionally flip participant
  `status`.

## 3. `agent-runner` service (new folder `agent-runner/`)

Bun process = STDB client + LLM SDK. Holds the LLM API key (never on the client).

**Connect**: as module owner or seeded service identity (token from env).

**Subscribe**: `profile`, `goal`, `agent_conversation` (`pending`/`running`),
`agent_message`, `event_participant`.

**Loop**:
1. New `pending` conversation → build system prompts from both participants'
   `profile` + `goal`s + `personality`.
2. Alternate turns up to `MAX_TURNS` (e.g. 6–8) or until `takenOverBy` set:
   each turn calls the LLM with history + persona → `postAgentMessage`.
   Respect `takenOverBy` (skip the human-controlled side).
3. At budget → scoring prompt returns JSON
   `{ score, metrics, summary, commonGround[], icebreakers[] }` → call
   `submitMatch` for each owner (A→B and B→A).

**Env**: `STDB_HOST`, `STDB_DB_NAME`, `STDB_SERVICE_TOKEN`, `LLM_API_KEY`,
`LLM_MODEL`, `MAX_TURNS`.

**Fallback (no service)**: client-driven driver — the participant with the
smaller identity hex runs the loop in-browser and calls the same reducers. Only
runs while a client is online; acceptable for a live demo but not for offline
pre-screening.

## 4. Authorization notes

- Profile/goal/event/take-over reducers: trust `ctx.sender` (the participant).
- `postAgentMessage` / `submitMatch`: restrict to the runner — check
  `ctx.sender` against `service_identity` (or module owner). Throw
  `SenderError` otherwise.
- Never trust identities passed as args for ownership; use `ctx.sender`. The
  one exception is `speaker`/`owner` on runner-only reducers, which are
  validated against the conversation's participants.

## 5. Complexity / scaling notes

- `pairingTick` is O(n²) per event in the worst case. Mitigate: dedupe via
  `by_pair` index, cap new pairings per tick, and only pair `available`
  participants. For the hackathon n is small.
- Conversation/message reads use single-column indexes (`by_conversation`,
  `by_status`); avoid full-table scans in the runner by filtering on `status`.
- `updatePosition` is high-frequency: throttle on the client and keep the row
  tiny; positions are last-write-wins.

## 6. Task checklist

- [ ] Add `profile`, `goal` tables + `upsertProfile`, `addGoal`, `removeGoal`.
- [ ] Add `event`, `event_participant` + `createEvent`, `joinEvent`,
      `leaveEvent`, `updatePosition`, `startEvent`/`endEvent`.
- [ ] Add `agent_conversation`, `agent_message`, `pairing_timer` +
      `pairingTick`, `postAgentMessage`, `takeOverConversation`,
      `postUserMessage`.
- [ ] Add `match` table + `MatchMetrics` type + `submitMatch`.
- [ ] (Optional) `service_identity` table + seed in `init`; authz helpers.
- [ ] Remove/repurpose legacy `message` table + `sendMessage` once chat is
      replaced.
- [ ] Scaffold `agent-runner/` (connect, subscribe, turn loop, scoring).
- [ ] `bun run spacetime:generate` after each schema change to refresh bindings.
