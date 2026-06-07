import { schema, table, t, SenderError } from 'spacetimedb/server';

// ── Tables ────────────────────────────────────────────────────────────────

const event = table(
  { name: 'event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique().index('btree'),
    name: t.string(),
    imageUrl: t.string(), // cover image shown on lobby cards + event header
    isOnline: t.bool(), // online (remote) event vs in-person
    createdAt: t.timestamp(),
  }
);

const attendee = table(
  {
    name: 'attendee',
    public: true,
    indexes: [
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      {
        accessor: 'by_event_identity',
        algorithm: 'btree',
        columns: ['eventId', 'identity'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    identity: t.identity(),
    joinedAt: t.timestamp(),
  }
);

const profile = table(
  { name: 'profile', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    goals: t.string(), // what they want out of the event
    socials: t.string(), // social links the agent can mine for context
    bio: t.string(), // AI-generated description from scraped socials
    persona: t.string(), // how the agent should represent the human
    avatarSeed: t.string(),
  }
);

// status: 'pending' | 'streaming' | 'complete' | 'error'
const match = table(
  {
    name: 'match',
    public: true,
    indexes: [{ accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] }],
  },
  {
    pairKey: t.string().primaryKey(),
    eventId: t.u64(),
    aIdentity: t.identity(),
    bIdentity: t.identity(),
    status: t.string(),
    score: t.u32(),
    metricShared: t.u32(),
    metricComplementary: t.u32(),
    metricGoals: t.u32(),
    summary: t.string(),
    commonGround: t.string(), // JSON-encoded string[]
    icebreakers: t.string(), // JSON-encoded string[]
    updatedAt: t.timestamp(),
  }
);

// speaker encodes side + authorship: 'a'/'b' = that side's AI agent,
// 'a_human'/'b_human' = the real attendee on that side typed it. (Encoded in
// the existing string column to avoid a destructive migration of a populated
// table — adding a real column requires data deletion.)
const agentMessage = table(
  {
    name: 'agent_message',
    public: true,
    indexes: [{ accessor: 'by_pair', algorithm: 'btree', columns: ['pairKey'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    pairKey: t.string(),
    speaker: t.string(),
    turn: t.u32(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

// Live plaza position for an attendee. Keyed by identity (you occupy one plaza
// at a time); eventId scopes which room you're standing in. x/y are normalized
// 0..1 so the client maps them onto whatever the plaza is sized to. facing is
// 'left' | 'right' for sprite flip. Last-write-wins; clients throttle writes.
const presence = table(
  {
    name: 'presence',
    public: true,
    indexes: [{ accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] }],
  },
  {
    identity: t.identity().primaryKey(),
    eventId: t.u64(),
    x: t.f32(),
    y: t.f32(),
    facing: t.string(),
    updatedAt: t.timestamp(),
  }
);

// A "ring" is an in-person beacon: one attendee pings another so they can find
// each other physically in the room. Only used in offline (in-person) events.
// status: 'pending' (waiting on the recipient) | 'accepted' (both phones ring).
// Decline / cancel / "found them" all just delete the row. rkey is a
// deterministic *directional* key (from→to) so re-ringing the same person
// upserts instead of stacking duplicate rows.
const ring = table(
  {
    name: 'ring',
    public: true,
    indexes: [
      { accessor: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { accessor: 'by_to', algorithm: 'btree', columns: ['toIdentity'] },
      { accessor: 'by_from', algorithm: 'btree', columns: ['fromIdentity'] },
    ],
  },
  {
    rkey: t.string().primaryKey(),
    eventId: t.u64(),
    fromIdentity: t.identity(),
    toIdentity: t.identity(),
    status: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  event,
  attendee,
  profile,
  match,
  agentMessage,
  presence,
  ring,
});
export default spacetimedb;

// ── Client-callable reducers ────────────────────────────────────────────────

export const upsertProfile = spacetimedb.reducer(
  {
    name: t.string(),
    goals: t.string(),
    socials: t.string(),
    bio: t.string(),
    persona: t.string(),
  },
  (ctx, { name, goals, socials, bio, persona }) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new SenderError('Name must not be empty');

    const avatarSeed = ctx.sender.toHexString().substring(0, 12);
    const existing = ctx.db.profile.identity.find(ctx.sender);
    const row = {
      identity: ctx.sender,
      name: trimmedName,
      goals: goals.trim(),
      socials: socials.trim(),
      bio: bio.trim(),
      persona: persona.trim(),
      avatarSeed,
    };
    if (existing) {
      ctx.db.profile.identity.update(row);
    } else {
      ctx.db.profile.insert(row);
    }
  }
);

// Move (or spawn) the caller's avatar in the plaza. Clamps to the [0,1] box so
// a buggy client can't fling an avatar off-screen. Upsert by identity.
export const updatePosition = spacetimedb.reducer(
  { eventId: t.u64(), x: t.f32(), y: t.f32(), facing: t.string() },
  (ctx, { eventId, x, y, facing }) => {
    const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
    const dir = facing === 'left' ? 'left' : 'right';
    const row = {
      identity: ctx.sender,
      eventId,
      x: clamp(x),
      y: clamp(y),
      facing: dir,
      updatedAt: ctx.timestamp,
    };
    const existing = ctx.db.presence.identity.find(ctx.sender);
    if (existing) {
      ctx.db.presence.identity.update(row);
    } else {
      ctx.db.presence.insert(row);
    }
  }
);

// Create an event if its code is free. Idempotent: calling with an existing
// code is a no-op, so it's safe to run from seed scripts repeatedly.
export const createEvent = spacetimedb.reducer(
  { code: t.string(), name: t.string(), imageUrl: t.string(), isOnline: t.bool() },
  (ctx, { code, name, imageUrl, isOnline }) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new SenderError('Event code must not be empty');

    const trimmedName = name.trim();
    if (!trimmedName) throw new SenderError('Event name must not be empty');

    if (ctx.db.event.code.find(normalized)) return;

    ctx.db.event.insert({
      id: 0n,
      code: normalized,
      name: trimmedName,
      imageUrl: imageUrl.trim(),
      isOnline,
      createdAt: ctx.timestamp,
    });
  }
);

export const joinEvent = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new SenderError('Event code must not be empty');

    const ev = ctx.db.event.code.find(normalized);
    if (!ev) throw new SenderError(`No event with code ${normalized}`);

    const already = [
      ...ctx.db.attendee.by_event_identity.filter([ev.id, ctx.sender]),
    ];
    if (already.length > 0) return;

    ctx.db.attendee.insert({
      id: 0n,
      eventId: ev.id,
      identity: ctx.sender,
      joinedAt: ctx.timestamp,
    });
  }
);

// Open a direct human-to-human chat in the plaza (no agents). Idempotent: creates
// a lightweight match row with status 'live' so sendChatMessage can append turns.
export const openPlazaChat = spacetimedb.reducer(
  { eventId: t.u64(), otherIdentity: t.identity() },
  (ctx, { eventId, otherIdentity }) => {
    if (otherIdentity.equals(ctx.sender)) {
      throw new SenderError('Cannot chat with yourself');
    }

    const norm = (hex: string) => hex.toLowerCase().replace(/^0x/, '');
    const [first, second] = [
      norm(ctx.sender.toHexString()),
      norm(otherIdentity.toHexString()),
    ].sort();
    const pairKey = `${Number(eventId)}:${first}:${second}`;

    const myAttendee = [
      ...ctx.db.attendee.by_event_identity.filter([eventId, ctx.sender]),
    ];
    const theirAttendee = [
      ...ctx.db.attendee.by_event_identity.filter([eventId, otherIdentity]),
    ];
    if (myAttendee.length === 0 || theirAttendee.length === 0) {
      throw new SenderError('Both users must be in this event');
    }

    if (ctx.db.match.pairKey.find(pairKey)) return;

    const [aIdentity, bIdentity] =
      norm(ctx.sender.toHexString()) <= norm(otherIdentity.toHexString())
        ? [ctx.sender, otherIdentity]
        : [otherIdentity, ctx.sender];

    ctx.db.match.insert({
      pairKey,
      eventId,
      aIdentity,
      bIdentity,
      status: 'live',
      score: 0,
      metricShared: 0,
      metricComplementary: 0,
      metricGoals: 0,
      summary: '',
      commonGround: '[]',
      icebreakers: '[]',
      updatedAt: ctx.timestamp,
    });
  }
);

// A human jumps into a match's conversation. Authorized by ctx.sender (must be
// one of the two matched attendees). Appended as the next turn, flagged human.
export const sendChatMessage = spacetimedb.reducer(
  { pairKey: t.string(), text: t.string() },
  (ctx, { pairKey, text }) => {
    const trimmed = text.trim();
    if (!trimmed) throw new SenderError('Message must not be empty');

    const m = ctx.db.match.pairKey.find(pairKey);
    if (!m) throw new SenderError('Unknown match');

    let speaker: string;
    if (m.aIdentity.equals(ctx.sender)) speaker = 'a_human';
    else if (m.bIdentity.equals(ctx.sender)) speaker = 'b_human';
    else throw new SenderError('Not a participant in this match');

    const nextTurn =
      [...ctx.db.agentMessage.by_pair.filter(pairKey)].reduce(
        (mx, r) => Math.max(mx, r.turn),
        -1
      ) + 1;

    ctx.db.agentMessage.insert({
      id: 0n,
      pairKey,
      speaker,
      turn: nextTurn,
      text: trimmed,
      createdAt: ctx.timestamp,
    });
  }
);

// ── Ring beacon (in-person events only) ──────────────────────────────────────

const ringKey = (eventId: bigint, fromHex: string, toHex: string) =>
  `${Number(eventId)}:${fromHex.toLowerCase().replace(/^0x/, '')}:${toHex
    .toLowerCase()
    .replace(/^0x/, '')}`;

// Ring another attendee so they can find you in the room. Caller is the sender
// (ctx.sender); upserts a pending ring keyed from→to. In-person events only.
export const sendRing = spacetimedb.reducer(
  { eventId: t.u64(), toIdentity: t.identity() },
  (ctx, { eventId, toIdentity }) => {
    if (toIdentity.equals(ctx.sender)) {
      throw new SenderError('Cannot ring yourself');
    }

    const ev = ctx.db.event.id.find(eventId);
    if (!ev) throw new SenderError('Unknown event');
    if (ev.isOnline) {
      throw new SenderError('Ringing is only for in-person events');
    }

    const mine = [
      ...ctx.db.attendee.by_event_identity.filter([eventId, ctx.sender]),
    ];
    const theirs = [
      ...ctx.db.attendee.by_event_identity.filter([eventId, toIdentity]),
    ];
    if (mine.length === 0 || theirs.length === 0) {
      throw new SenderError('Both users must be in this event');
    }

    const rkey = ringKey(
      eventId,
      ctx.sender.toHexString(),
      toIdentity.toHexString()
    );
    const row = {
      rkey,
      eventId,
      fromIdentity: ctx.sender,
      toIdentity,
      status: 'pending',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    };
    if (ctx.db.ring.rkey.find(rkey)) {
      ctx.db.ring.rkey.update(row);
    } else {
      ctx.db.ring.insert(row);
    }
  }
);

// Recipient accepts a ring → status flips to 'accepted' and both phones ring.
export const acceptRing = spacetimedb.reducer(
  { rkey: t.string() },
  (ctx, { rkey }) => {
    const r = ctx.db.ring.rkey.find(rkey);
    if (!r) throw new SenderError('Ring no longer exists');
    if (!r.toIdentity.equals(ctx.sender)) {
      throw new SenderError('Only the person being rung can accept');
    }
    ctx.db.ring.rkey.update({
      ...r,
      status: 'accepted',
      updatedAt: ctx.timestamp,
    });
  }
);

// Clear a ring: cancel (sender), decline (recipient), or "found them" (either).
export const dismissRing = spacetimedb.reducer(
  { rkey: t.string() },
  (ctx, { rkey }) => {
    const r = ctx.db.ring.rkey.find(rkey);
    if (!r) return;
    if (
      !r.fromIdentity.equals(ctx.sender) &&
      !r.toIdentity.equals(ctx.sender)
    ) {
      throw new SenderError('Not a participant in this ring');
    }
    ctx.db.ring.rkey.delete(rkey);
  }
);

// ── Orchestrator reducers (called by the server match function over HTTP) ────
// The server function is a trusted orchestrator: it passes the participant
// identities as arguments rather than relying on ctx.sender, since the writer
// here is the server's own identity, not either attendee.

export const beginMatch = spacetimedb.reducer(
  {
    pairKey: t.string(),
    eventId: t.u64(),
    aIdentity: t.identity(),
    bIdentity: t.identity(),
  },
  (ctx, { pairKey, eventId, aIdentity, bIdentity }) => {
    // Clear any prior transcript for this pair so a re-run starts fresh.
    for (const msg of [...ctx.db.agentMessage.by_pair.filter(pairKey)]) {
      ctx.db.agentMessage.id.delete(msg.id);
    }

    const base = {
      pairKey,
      eventId,
      aIdentity,
      bIdentity,
      status: 'streaming',
      score: 0,
      metricShared: 0,
      metricComplementary: 0,
      metricGoals: 0,
      summary: '',
      commonGround: '[]',
      icebreakers: '[]',
      updatedAt: ctx.timestamp,
    };
    if (ctx.db.match.pairKey.find(pairKey)) {
      ctx.db.match.pairKey.update(base);
    } else {
      ctx.db.match.insert(base);
    }
  }
);

// Upsert a turn by (pairKey, turn). Called repeatedly as a turn streams in, so
// the same row's text grows live on the board instead of inserting duplicates.
export const appendAgentTurn = spacetimedb.reducer(
  {
    pairKey: t.string(),
    speaker: t.string(),
    turn: t.u32(),
    text: t.string(),
  },
  (ctx, { pairKey, speaker, turn, text }) => {
    const existing = [...ctx.db.agentMessage.by_pair.filter(pairKey)].find(
      m => m.turn === turn
    );
    if (existing) {
      ctx.db.agentMessage.id.update({ ...existing, speaker, text });
    } else {
      ctx.db.agentMessage.insert({
        id: 0n,
        pairKey,
        speaker,
        turn,
        text,
        createdAt: ctx.timestamp,
      });
    }
  }
);

export const completeMatch = spacetimedb.reducer(
  {
    pairKey: t.string(),
    score: t.u32(),
    metricShared: t.u32(),
    metricComplementary: t.u32(),
    metricGoals: t.u32(),
    summary: t.string(),
    commonGround: t.string(),
    icebreakers: t.string(),
  },
  (ctx, args) => {
    const existing = ctx.db.match.pairKey.find(args.pairKey);
    if (!existing) throw new SenderError(`Unknown match ${args.pairKey}`);
    ctx.db.match.pairKey.update({
      ...existing,
      status: 'complete',
      score: args.score,
      metricShared: args.metricShared,
      metricComplementary: args.metricComplementary,
      metricGoals: args.metricGoals,
      summary: args.summary,
      commonGround: args.commonGround,
      icebreakers: args.icebreakers,
      updatedAt: ctx.timestamp,
    });
  }
);

export const failMatch = spacetimedb.reducer(
  { pairKey: t.string(), error: t.string() },
  (ctx, { pairKey, error }) => {
    const existing = ctx.db.match.pairKey.find(pairKey);
    if (!existing) return;
    ctx.db.match.pairKey.update({
      ...existing,
      status: 'error',
      summary: error,
      updatedAt: ctx.timestamp,
    });
  }
);

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const init = spacetimedb.init(ctx => {
  if (!ctx.db.event.code.find('DEMO')) {
    ctx.db.event.insert({
      id: 0n,
      code: 'DEMO',
      name: 'Demo Event',
      imageUrl: 'https://picsum.photos/seed/DEMO/800/400',
      isOnline: false,
      createdAt: ctx.timestamp,
    });
  }
});
