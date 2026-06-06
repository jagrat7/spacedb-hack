import { schema, table, t, SenderError } from 'spacetimedb/server';

// ── Tables ────────────────────────────────────────────────────────────────

const event = table(
  { name: 'event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique().index('btree'),
    name: t.string(),
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
    role: t.string(),
    workingOn: t.string(),
    interests: t.string(),
    lookingFor: t.string(),
    offer: t.string(),
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

// speaker: 'a' | 'b'
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

const spacetimedb = schema({ event, attendee, profile, match, agentMessage });
export default spacetimedb;

// ── Client-callable reducers ────────────────────────────────────────────────

export const upsertProfile = spacetimedb.reducer(
  {
    name: t.string(),
    role: t.string(),
    workingOn: t.string(),
    interests: t.string(),
    lookingFor: t.string(),
    offer: t.string(),
  },
  (ctx, { name, role, workingOn, interests, lookingFor, offer }) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new SenderError('Name must not be empty');

    const avatarSeed = ctx.sender.toHexString().substring(0, 12);
    const existing = ctx.db.profile.identity.find(ctx.sender);
    const row = {
      identity: ctx.sender,
      name: trimmedName,
      role: role.trim(),
      workingOn: workingOn.trim(),
      interests: interests.trim(),
      lookingFor: lookingFor.trim(),
      offer: offer.trim(),
      avatarSeed,
    };
    if (existing) {
      ctx.db.profile.identity.update(row);
    } else {
      ctx.db.profile.insert(row);
    }
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

export const appendAgentTurn = spacetimedb.reducer(
  {
    pairKey: t.string(),
    speaker: t.string(),
    turn: t.u32(),
    text: t.string(),
  },
  (ctx, { pairKey, speaker, turn, text }) => {
    ctx.db.agentMessage.insert({
      id: 0n,
      pairKey,
      speaker,
      turn,
      text,
      createdAt: ctx.timestamp,
    });
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
      createdAt: ctx.timestamp,
    });
  }
});
