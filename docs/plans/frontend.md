# Overlap — Frontend Plan

Covers the React client (TanStack Start, `src/`). See [overview.md](./overview.md)
for context and [backend.md](./backend.md) for tables/reducers. Reuse the
patterns already in `src/routes/index.tsx` (subscriptions, `useReducer`,
shadcn/ui) but split the single screen into the routes below.

## 1. Routes & layout

| Route | Purpose |
|-------|---------|
| `/` | Landing → onboarding gate, then event lobby |
| `/event/$eventId` | Event room: match board + plaza + live chat |

Use file-based routes (`src/routes/`). Keep the connection setup in
`src/router.tsx` (SpacetimeAuth token already persisted there).

## 2. Onboarding gate (profile builder)

- After connect, query `profile` for `identity`. If none → show the profile
  builder; otherwise continue.
- Form fields: `role`, `workingOn`, `interests`, `lookingFor`, `offering`,
  `personality`, plus a **goals** editor (add/remove rows → `addGoal` /
  `removeGoal`).
- Stack: **react-hook-form + zod** for validation; submit → `upsertProfile`.
- Components via shadcn CLI: `form`, `input`, `textarea`, `button`, `card`
  (already have several under `src/components/ui/`).

## 3. Event lobby

- **Create event**: name + mode (online/offline) → `createEvent`; show the join
  `code`.
- **Join event**: enter code → `joinEvent` → navigate to `/event/$eventId`.
- List events the user participates in (query `event_participant` by identity →
  resolve `event`).

## 4. Event room (`/event/$eventId`)

Subscriptions to set up on mount (group by lifetime):

- `event` (this id), `event_participant` `where(eventId)`,
- `profile` + `goal` for participants,
- `agent_conversation` `where(eventId)`, `agent_message` for the open
  conversation,
- `match` `where(eventId && owner == me)`.

Layout: match board (primary), plaza panel, and a live-chat drawer/panel.

### 4a. Match board (cards)

- Query my `match` rows for the event, sort by `score` desc.
- Card contents (from the brief): overall **score ring**, **sub-metrics** bars
  (`goalAlignment`, `sharedInterests`, `complementarySkills`, `vibe`),
  **summary** ("why you should meet"), **common ground** chips, **icebreakers**
  list, and a **Connect / Open chat** action → opens the conversation.
- Empty state while agents are still talking (no match yet).

### 4b. Live agent chat + take-over

- Open a conversation → show `agent_message`s in order (reuse the message-list
  rendering from `index.tsx`); label each turn **agent** vs **you/them**
  (`authoredByHuman`).
- **Monitor**: read-only stream while agents talk (real-time via subscription).
- **Take over**: button → `takeOverConversation`; then show a composer that
  posts via `postUserMessage`. When both sides are human-driven, surface
  "connection made".

### 4c. Plaza (online events — the wow factor)

- Top-down canvas/SVG. Render each `event_participant` as an avatar at
  `posX/posY` (color/initial derived from identity or `name`).
- Local movement (drag or arrow keys) → `updatePosition` **throttled** (~10/s);
  positions are last-write-wins so remote avatars animate from subscription
  updates.
- **Match graph**: draw a glowing line between my avatar and high-`score`
  matches (threshold, e.g. ≥ 70) using `match` rows.
- Click an avatar → open that pair's conversation (or profile preview).
- Render in a `requestAnimationFrame` loop reading the latest positions; O(n)
  avatars + O(e) lines where e = high matches.

## 5. Data & state conventions

- Reactive reads: `useSpacetimeDBQuery(tables.X.where(...))`; mutations:
  `useReducer(reducers.Y)` — same as `index.tsx`.
- Prefer typed query builders over raw SQL for `where` filters.
- Identity compare via `identity.toHexString()` / `isEqual` (see existing code).
- Throttle `updatePosition`; debounce profile autosave if added.

## 6. Styling

- Tailwind v4 + shadcn/ui; **theme variables only** (no hardcoded colors —
  extend `src/styles.css` tokens for plaza/score colors).
- Filenames kebab-case; TS without `;`; `??` over `||`.

## 7. Task checklist

- [ ] Onboarding gate + profile builder form (react-hook-form + zod →
      `upsertProfile`, `addGoal`/`removeGoal`).
- [ ] Event lobby (create/join by code) + `/event/$eventId` route.
- [ ] Event-room subscriptions wired (participants, conversations, messages,
      matches).
- [ ] Match board with score ring, sub-metric bars, summary, common ground,
      icebreakers, connect action.
- [ ] Live agent chat panel: monitor stream + take-over composer
      (`takeOverConversation`, `postUserMessage`).
- [ ] Plaza: avatars from positions, throttled movement, glowing match lines,
      click-to-open.
- [ ] Install any missing shadcn components via CLI (`form`, `avatar`, etc.).
- [ ] Retire the legacy single-screen chat in `index.tsx`.
