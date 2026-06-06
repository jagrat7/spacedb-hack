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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
        setSystemMessages(prev => [
          ...prev,
          {
            id: 0n,
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
        setSystemMessages(prev => [
          ...prev,
          {
            id: 0n,
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
      <div className="grid min-h-screen place-items-center p-4">
        <Card>
          <CardHeader>
            <CardTitle>Connecting to SpacetimeDB...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-screen gap-4 p-4 mx-auto w-full max-w-5xl"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) 18rem',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
      }}
    >
      {/* Profile — spans both columns */}
      <Card className="[grid-column:1/-1] flex-row items-center gap-4 py-0">
        <CardContent className="flex flex-1 items-center gap-4 py-3">
          <span className="font-heading text-base font-medium mr-auto">Profile</span>
          {!settingName ? (
            <>
              <span className="text-muted-foreground font-semibold text-sm">
                {currentName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingName(true);
                  setNewName(currentName);
                }}
              >
                Edit Name
              </Button>
            </>
          ) : (
            <form className="flex items-center gap-3 w-full max-w-sm" onSubmit={onSubmitNewName}>
              <Input
                aria-label="username input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Enter your display name"
              />
              <Button type="submit" size="sm" disabled={!newName.trim()}>
                Save
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Messages panel */}
      <Card className="flex flex-col min-h-0 overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>Messages</CardTitle>
          <CardAction>
            <Badge variant={connected ? 'default' : 'outline'}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <ScrollArea className="h-full px-4 pb-4">
            {prettyMessages.length === 0 ? (
              <p className="text-muted-foreground text-sm">No messages yet</p>
            ) : (
              <div className="flex flex-col gap-3">
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
                      key={`${message.sent.toISOString()}-${index}`}
                      className={cn(
                        'rounded-xl px-4 py-3',
                        message.kind === 'system'
                          ? 'bg-primary text-primary-foreground italic'
                          : 'bg-muted'
                      )}
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-sm">
                          {message.kind === 'system' ? 'System' : message.senderName}
                        </span>
                        <span
                          className={cn(
                            'text-xs',
                            message.kind === 'system'
                              ? 'text-primary-foreground/75'
                              : 'text-muted-foreground'
                          )}
                        >
                          {dateString}{timeString}
                        </span>
                      </div>
                      <p className="m-0 text-sm whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* User sidebar */}
      <Card className="min-h-0 overflow-hidden">
        <CardContent className="h-full p-0">
          <ScrollArea className="h-full px-4 py-4">
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Online
              </p>
              <div className="flex flex-col gap-1.5">
                {onlineUsers.map(user => (
                  <div
                    key={user.identity.toHexString()}
                    className="rounded-lg bg-muted px-3 py-2 text-sm font-medium"
                  >
                    {displayNameByUser(user)}
                  </div>
                ))}
              </div>
            </section>
            {offlineUsers.length > 0 && (
              <section className="mt-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Offline
                </p>
                <div className="flex flex-col gap-1.5">
                  {offlineUsers.map(user => (
                    <div
                      key={user.identity.toHexString()}
                      className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground"
                    >
                      {displayNameByUser(user)}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Composer — spans both columns */}
      <Card className="[grid-column:1/-1]">
        <CardHeader>
          <CardTitle>New Message</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmitMessage}>
            <Textarea
              aria-label="message input"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              rows={3}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!newMessage.trim() || !connected}>
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
