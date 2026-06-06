import { schema, table, t, SenderError } from 'spacetimedb/server';

const user = table(
  { name: 'user', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.option(t.string()),
    online: t.bool(),
  }
);

const message = table(
  { name: 'message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    sent: t.timestamp(),
    text: t.string(),
  }
);

const spacetimedb = schema({ user, message });
export default spacetimedb;

function validateName(name: string) {
  if (!name.trim()) {
    throw new SenderError('Names must not be empty');
  }
}

function validateMessage(text: string) {
  if (!text.trim()) {
    throw new SenderError('Messages must not be empty');
  }
}

export const setName = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmedName = name.trim();
    validateName(trimmedName);
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) {
      throw new SenderError('Cannot set name for unknown user');
    }
    ctx.db.user.identity.update({ ...user, name: trimmedName });
  }
);

export const sendMessage = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    const trimmedText = text.trim();
    validateMessage(trimmedText);
    console.info(`User ${ctx.sender}: ${trimmedText}`);
    ctx.db.message.insert({
      id: 0n,
      sender: ctx.sender,
      sent: ctx.timestamp,
      text: trimmedText,
    });
  }
);

export const init = spacetimedb.init(_ctx => {});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    ctx.db.user.identity.update({ ...user, online: true });
  } else {
    ctx.db.user.insert({
      identity: ctx.sender,
      name: undefined,
      online: true,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    ctx.db.user.identity.update({ ...user, online: false });
  } else {
    console.warn(`Disconnect event for unknown user with identity ${ctx.sender}`);
  }
});
