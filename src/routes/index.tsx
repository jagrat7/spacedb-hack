import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Identity, Timestamp } from 'spacetimedb';
import { tables, reducers, DbConnection } from '../module_bindings';
import {
  useSpacetimeDB,
  useReducer,
  useSpacetimeDBQuery,
} from 'spacetimedb/tanstack';
import type { Message, User } from '../module_bindings/types';

type PrettyMessage = {
  senderName: string;
  text: string;
  sent: Timestamp;
  kind: 'system' | 'user';
};

export const Route = createFileRoute('/')({
  component: App,
});

function App() {
  const [newName, setNewName] = useState('');
  const [settingName, setSettingName] = useState(false);
  const [systemMessages, setSystemMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const knownOnlineUsersRef = useRef(new Set<string>());

  const { identity, isActive: connected, getConnection } = useSpacetimeDB();
  const setName = useReducer(reducers.setName);
  const sendMessage = useReducer(reducers.sendMessage);
  const [messages] = useSpacetimeDBQuery(tables.message);
  const [onlineUsers] = useSpacetimeDBQuery(
    tables.user.where(row => row.online.eq(true))
  );
  const [offlineUsers] = useSpacetimeDBQuery(
    tables.user.where(row => row.online.eq(false))
  );

  useEffect(() => {
    if (!connected) return;
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    conn.subscriptionBuilder().subscribe([tables.message, tables.user]);
  }, [connected]);

  const users = useMemo(
    () => [...onlineUsers, ...offlineUsers],
    [onlineUsers, offlineUsers]
  );

  const displayNameByUser = (user: User) =>
    user.name ?? user.identity.toHexString().substring(0, 8);

  const currentName = useMemo(() => {
    if (!identity) return '';
    const currentUser = users.find(user => user.identity.isEqual(identity));
    return (
      currentUser?.name ?? identity?.toHexString().substring(0, 8) ?? ''
    );
  }, [identity, users]);

  const prettyMessages = useMemo<PrettyMessage[]>(
    () =>
      [...messages, ...systemMessages]
        .sort((a, b) => (a.sent.toDate() > b.sent.toDate() ? 1 : -1))
        .map(message => {
          const sender = users.find(user =>
            user.identity.isEqual(message.sender)
          );
          return {
            senderName:
              sender?.name ?? message.sender.toHexString().substring(0, 8),
            text: message.text,
            sent: message.sent,
            kind: Identity.zero().isEqual(message.sender) ? 'system' : 'user',
          };
        }),
    [messages, systemMessages, users]
  );

  useEffect(() => {
    const knownOnlineUsers = knownOnlineUsersRef.current;
    const nextOnlineUsers = new Set(
      onlineUsers.map(user => user.identity.toHexString())
    );

    for (const user of onlineUsers) {
      const userKey = user.identity.toHexString();
      if (!knownOnlineUsers.has(userKey)) {
        setSystemMessages(previousMessages => [
          ...previousMessages,
          {
            sender: Identity.zero(),
            sent: Timestamp.now(),
            text: `${displayNameByUser(user)} has connected.`,
          },
        ]);
      }
    }

    for (const userKey of knownOnlineUsers) {
      if (!nextOnlineUsers.has(userKey)) {
        const offlineUser = offlineUsers.find(
          user => user.identity.toHexString() === userKey
        );
        const userName =
          offlineUser?.name ?? offlineUser?.identity.toHexString().substring(0, 8);
        setSystemMessages(previousMessages => [
          ...previousMessages,
          {
            sender: Identity.zero(),
            sent: Timestamp.now(),
            text: `${userName ?? userKey.substring(0, 8)} has disconnected.`,
          },
        ]);
      }
    }

    knownOnlineUsersRef.current = nextOnlineUsers;
  }, [onlineUsers, offlineUsers]);

  const onSubmitNewName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = newName.trim();
    if (!nextName || !connected) return;
    setSettingName(false);
    setName({ name: nextName });
  };

  const onSubmitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = newMessage.trim();
    if (!nextMessage || !connected) return;
    setNewMessage('');
    sendMessage({ text: nextMessage });
  };

  if (!connected || !identity) {
    return (
      <main className="chat-loading">
        <section className="chat-card chat-panel">
          <h1>Connecting to SpacetimeDB...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-shell">
      <section className="chat-card chat-profile">
        <h1 className="chat-profile-title">Profile</h1>
        {!settingName ? (
          <>
            <span className="chat-profile-name">{currentName}</span>
            <button
              type="button"
              onClick={() => {
                setSettingName(true);
                setNewName(currentName);
              }}
            >
              Edit Name
            </button>
          </>
        ) : (
          <form className="chat-profile-form" onSubmit={onSubmitNewName}>
            <input
              aria-label="username input"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="Enter your display name"
            />
            <button type="submit" disabled={!newName.trim()}>
              Submit
            </button>
          </form>
        )}
      </section>

      <section className="chat-card chat-panel">
        <div className="chat-title-row">
          <h1>Messages</h1>
          <span className="chat-status" data-active={connected}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {prettyMessages.length < 1 ? (
          <p className="chat-empty">No messages yet</p>
        ) : (
          <div className="chat-messages">
            {prettyMessages.map((message, index) => {
              const sentDate = message.sent.toDate();
              const now = new Date();
              const isOlderThanDay =
                now.getFullYear() !== sentDate.getFullYear() ||
                now.getMonth() !== sentDate.getMonth() ||
                now.getDate() !== sentDate.getDate();
              const timeString = sentDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const dateString = isOlderThanDay
                ? `${sentDate.toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })} `
                : '';

              return (
                <article
                  className="chat-message"
                  data-kind={message.kind}
                  key={`${message.sent.toISOString()}-${index}`}
                >
                  <div className="chat-message-header">
                    <span className="chat-message-author">
                      {message.kind === 'system' ? 'System' : message.senderName}
                    </span>
                    <span className="chat-message-time">
                      {dateString}
                      {timeString}
                    </span>
                  </div>
                  <p className="chat-message-text">{message.text}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="chat-card chat-sidebar">
        <section className="chat-users-section">
          <h2>Online</h2>
          <div className="chat-users">
            {onlineUsers.map(user => (
              <div className="chat-user" key={user.identity.toHexString()}>
                {displayNameByUser(user)}
              </div>
            ))}
          </div>
        </section>
        {offlineUsers.length > 0 && (
          <section className="chat-users-section">
            <h2>Offline</h2>
            <div className="chat-users">
              {offlineUsers.map(user => (
                <div className="chat-user" key={user.identity.toHexString()}>
                  {displayNameByUser(user)}
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="chat-card chat-composer">
        <form className="chat-composer-form" onSubmit={onSubmitMessage}>
          <h2>New Message</h2>
          <textarea
            aria-label="message input"
            value={newMessage}
            onChange={event => setNewMessage(event.target.value)}
            placeholder="Type a message..."
            rows={4}
          />
          <div className="chat-composer-actions">
            <button type="submit" disabled={!newMessage.trim() || !connected}>
              Send
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
