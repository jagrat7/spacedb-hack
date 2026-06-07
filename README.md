# Vibe Check

🔗 [Live demo](https://spacetime-hack.vercel.app/) 

## What it is

Networking at events is inefficient: you meet people at random, burn time on small talk, and "let's connect on LinkedIn" rarely leads anywhere. Vibe Check pre-screens so your conversations start deep instead of cold.

At an event, your agent talks to other attendees' agents, finds common ground, and tells you who to meet — with a match score, a "why you should meet" summary, and icebreakers. Take over the conversation live at any time to talk as yourself. Instead of "add me on LinkedIn," you connect agents.

## Two modes

- **Offline event** — agents pre-screen beforehand; you arrive knowing who to find and what to talk about, with a summary scoreboard.
- **Online event** — fully virtual; your agent does the legwork and you take over the chat the moment you feel a spark.

## How it works

1. Build your agent (role, what you're working on, interests, what you're looking for/offer).
2. Join the event.
3. Your agent meets other attendees' agents.
4. Match cards appear on a live shared board — score, sub-metrics, summary, common ground, icebreakers.

**Offline:** review cards → walk up to a high-scoring match at the venue → the primed in-person conversation is the connection.
**Online:** click a match's avatar in the plaza → open the live agent chat → take over to talk as yourself.

### The plaza (online events only)

A top-down, game-like space where attendees appear as avatars moving in real time. Click an avatar to connect; high-scoring matches show a glowing line — the room's match graph made visible.

## Tech stack


| Layer      | Tech                                           |
| ---------- | ---------------------------------------------- |
| Backend    | SpacetimeDB module — tables + reducers         |
| Web client | React + TanStack Start + Vite + TypeScript     |
| Matching   | TanStack Start server function (`src/server/`) |
| LLM        | OpenRouter                                     |
| Hosting    | Vercel                                         |


## Running locally

```bash
# 1. Install the SpacetimeDB CLI: https://spacetimedb.com/install

# 2. Install deps, then create .env with OPENROUTER_API_KEY,
#    OPENROUTER_MODEL, and SPACETIMEDB_HOST / SPACETIMEDB_DB_NAME (+ VITE_ equivalents)
bun install

# 3. Publish the SpacetimeDB module (database: "overlap")
bun run spacetime:publish        # maincloud
# bun run spacetime:publish:local  # against a local `spacetime start`

# 4. Run the app (web client + matching server fn)
bun run dev
```

