import { createFileRoute } from '@tanstack/react-router';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { tables, reducers, DbConnection } from '../module_bindings';
import {
  useSpacetimeDB,
  useReducer,
  useSpacetimeDBQuery,
} from 'spacetimedb/tanstack';
import type { Profile, Match, AgentMessage } from '../module_bindings/types';
import { runMatch, runAgentReply } from '@/server/match';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/')({
  component: App,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const normHex = (hex: string) => hex.toLowerCase().replace(/^0x/, '');

function pairKeyFor(eventId: bigint, aHex: string, bHex: string): string {
  const [first, second] = [normHex(aHex), normHex(bHex)].sort();
  return `${Number(eventId)}:${first}:${second}`;
}

// speaker is 'a'/'b' (that side's AI agent) or 'a_human'/'b_human' (the real
// attendee on that side). The leading char is the side.
const sideOf = (speaker: string): 'a' | 'b' =>
  speaker.charAt(0) === 'b' ? 'b' : 'a';
const isHumanSpeaker = (speaker: string) => speaker.includes('_human');

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

type ProfileLite = {
  name: string;
  role: string;
  workingOn: string;
  interests: string;
  lookingFor: string;
  offer: string;
};

const toLite = (p: Profile): ProfileLite => ({
  name: p.name,
  role: p.role,
  workingOn: p.workingOn,
  interests: p.interests,
  lookingFor: p.lookingFor,
  offer: p.offer,
});

const avatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

const EMPTY_FORM: ProfileLite = {
  name: '',
  role: '',
  workingOn: '',
  interests: '',
  lookingFor: '',
  offer: '',
};

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { identity, isActive: connected, getConnection } = useSpacetimeDB();
  const auth = useAuth();

  const upsertProfile = useReducer(reducers.upsertProfile);
  const joinEvent = useReducer(reducers.joinEvent);
  const sendChatMessage = useReducer(reducers.sendChatMessage);

  const [profiles] = useSpacetimeDBQuery(tables.profile);
  const [events] = useSpacetimeDBQuery(tables.event);
  const [attendees] = useSpacetimeDBQuery(tables.attendee);
  const [matches] = useSpacetimeDBQuery(tables.match);
  const [agentMessages] = useSpacetimeDBQuery(tables.agentMessage);

  const [form, setForm] = useState<ProfileLite>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('DEMO');
  const triggered = useRef(new Set<string>());

  // Subscribe to everything once connected.
  useEffect(() => {
    if (!connected) return;
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    conn
      .subscriptionBuilder()
      .subscribe([
        tables.profile,
        tables.event,
        tables.attendee,
        tables.match,
        tables.agentMessage,
      ]);
  }, [connected]);

  const myHex = identity?.toHexString();
  const myProfile = useMemo(
    () => profiles.find(p => myHex && normHex(p.identity.toHexString()) === normHex(myHex)),
    [profiles, myHex]
  );
  const myAttendee = useMemo(
    () => attendees.find(a => myHex && normHex(a.identity.toHexString()) === normHex(myHex)),
    [attendees, myHex]
  );

  const matchByKey = useMemo(() => {
    const m = new Map<string, Match>();
    for (const row of matches) m.set(row.pairKey, row);
    return m;
  }, [matches]);

  // Other attendees in my event, joined with their profile + match.
  const others = useMemo(() => {
    if (!myAttendee || !myHex) return [];
    const eventId = myAttendee.eventId;
    return attendees
      .filter(
        a =>
          a.eventId === eventId &&
          normHex(a.identity.toHexString()) !== normHex(myHex)
      )
      .map(a => {
        const otherHex = a.identity.toHexString();
        const profile = profiles.find(
          p => normHex(p.identity.toHexString()) === normHex(otherHex)
        );
        const pairKey = pairKeyFor(eventId, myHex, otherHex);
        return { otherHex, profile, pairKey, match: matchByKey.get(pairKey) };
      })
      .filter(o => o.profile)
      .sort((x, y) => (y.match?.score ?? -1) - (x.match?.score ?? -1));
  }, [attendees, profiles, matchByKey, myAttendee, myHex]);

  // Trigger matching. The canonical "A" side (smaller identity hex) kicks off
  // each pair immediately so two live clients don't both start the same match.
  // If I'm the "B" side and no match row shows up shortly, the A side is
  // probably offline (e.g. a seeded agent), so I trigger it myself.
  useEffect(() => {
    if (!myAttendee || !myHex || !myProfile) return;
    const eventId = myAttendee.eventId;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const fire = (o: (typeof others)[number]) => {
      if (!o.profile || triggered.current.has(o.pairKey)) return;
      triggered.current.add(o.pairKey);
      runMatch({
        data: {
          eventId: Number(eventId),
          aIdentity: myHex,
          bIdentity: o.otherHex,
          aProfile: toLite(myProfile),
          bProfile: toLite(o.profile!),
        },
      }).catch(() => triggered.current.delete(o.pairKey));
    };

    for (const o of others) {
      if (!o.profile) continue;
      if (matchByKey.has(o.pairKey)) continue;
      if (triggered.current.has(o.pairKey)) continue;
      const amCanonicalA = normHex(myHex) <= normHex(o.otherHex);
      if (amCanonicalA) {
        fire(o);
      } else {
        // Fallback: if the canonical-A side hasn't started it in time, do it.
        timers.push(setTimeout(() => fire(o), 4000));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [others, myAttendee, myHex, myProfile, matchByKey]);

  const messagesByPair = useMemo(() => {
    const m = new Map<string, AgentMessage[]>();
    for (const msg of agentMessages) {
      const arr = m.get(msg.pairKey) ?? [];
      arr.push(msg);
      m.set(msg.pairKey, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.turn - b.turn);
    return m;
  }, [agentMessages]);

  // Latest transcript snapshot, read inside the deferred agent-reply check.
  const messagesRef = useRef(messagesByPair);
  messagesRef.current = messagesByPair;

  // A human posts into a match's chat. After a short grace period, if the other
  // side hasn't "taken over" (no human message from that side), its agent
  // replies. Once that side's human has typed even once, the agent stays quiet.
  const onSendChat = (
    pairKey: string,
    otherHex: string,
    otherProfile: Profile,
    text: string
  ) => {
    if (!myHex || !text.trim()) return;
    sendChatMessage({ pairKey, text: text.trim() });
    const responderSide: 'a' | 'b' =
      normHex(myHex) <= normHex(otherHex) ? 'b' : 'a';
    setTimeout(() => {
      const msgs = messagesRef.current.get(pairKey) ?? [];
      const responderTookOver = msgs.some(
        m => sideOf(m.speaker) === responderSide && isHumanSpeaker(m.speaker)
      );
      if (responderTookOver) return;
      runAgentReply({
        data: { pairKey, responderSide, responderProfile: toLite(otherProfile) },
      }).catch(() => {});
    }, 1500);
  };

  const reRun = (pairKey: string, otherHex: string, otherProfile: Profile) => {
    if (!myAttendee || !myHex || !myProfile) return;
    triggered.current.add(pairKey);
    runMatch({
      data: {
        eventId: Number(myAttendee.eventId),
        aIdentity: myHex,
        bIdentity: otherHex,
        aProfile: toLite(myProfile),
        bProfile: toLite(otherProfile),
      },
    }).catch(() => triggered.current.delete(pairKey));
  };

  const onSubmitProfile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim() || !connected) return;
    upsertProfile(form);
    setEditing(false);
  };

  const onJoin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code.trim() || !connected) return;
    joinEvent({ code: code.trim() });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (!connected || !identity) {
    return (
      <Centered>
        <CardHeader>
          <CardTitle>Connecting to Overlap…</CardTitle>
        </CardHeader>
      </Centered>
    );
  }

  // 1. Build your agent.
  if (!myProfile || editing) {
    return (
      <Centered wide>
        <CardHeader>
          <CardTitle>{myProfile ? 'Edit your agent' : 'Build your agent'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmitProfile}>
            <Field label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Ada Lovelace" />
            <Field label="Role" value={form.role} onChange={v => setForm({ ...form, role: v })} placeholder="Founder & engineer" />
            <Field label="What you're working on" value={form.workingOn} onChange={v => setForm({ ...form, workingOn: v })} placeholder="A real-time analytics engine" area />
            <Field label="Interests" value={form.interests} onChange={v => setForm({ ...form, interests: v })} placeholder="Distributed systems, climbing, jazz" area />
            <Field label="What you're looking for" value={form.lookingFor} onChange={v => setForm({ ...form, lookingFor: v })} placeholder="A technical cofounder, design partners" area />
            <Field label="What you offer" value={form.offer} onChange={v => setForm({ ...form, offer: v })} placeholder="Backend expertise, intros to investors" area />
            <div className="flex justify-end gap-2">
              {myProfile && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!form.name.trim()}>
                {myProfile ? 'Save agent' : 'Create agent'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Centered>
    );
  }

  // 2. Join an event.
  if (!myAttendee) {
    const ev = events[0];
    return (
      <Centered>
        <CardHeader>
          <CardTitle>Join an event</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Enter an event code to let your agent start meeting other attendees.
            {ev && <> Try <code className="font-mono">{ev.code}</code> — {ev.name}.</>}
          </p>
          <form className="flex gap-2" onSubmit={onJoin}>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Event code" />
            <Button type="submit" disabled={!code.trim()}>Join</Button>
          </form>
        </CardContent>
      </Centered>
    );
  }

  // 3. Match board.
  const myEvent = events.find(e => e.id === myAttendee.eventId);
  return (
    <div className="mx-auto w-full max-w-5xl p-4 flex flex-col gap-4 min-h-screen">
      <Card className="flex-row items-center gap-3 py-3">
        <CardContent className="flex flex-1 items-center gap-3 py-0">
          <Avatar>
            <AvatarImage src={avatarUrl(myProfile.avatarSeed)} alt={myProfile.name} />
            <AvatarFallback>{initials(myProfile.name)}</AvatarFallback>
          </Avatar>
          <div className="mr-auto">
            <div className="font-medium text-sm">{myProfile.name}</div>
            <div className="text-muted-foreground text-xs">{myProfile.role}</div>
          </div>
          <Badge variant="outline">{myEvent?.name ?? 'Event'}</Badge>
          <Button size="sm" variant="outline" onClick={() => { setForm(toLite(myProfile)); setEditing(true); }}>
            Edit agent
          </Button>
          <Button size="sm" variant="ghost" onClick={() => auth.signoutRedirect()}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-heading text-lg font-semibold mb-1">Who you should meet</h2>
        <p className="text-muted-foreground text-sm mb-3">
          Your agent is meeting everyone here. Cards are ranked by match — find the top ones in person.
        </p>
      </div>

      {others.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No one else has joined yet. Open this app as another attendee to see matching.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {others.map(o => (
            <MatchCard
              key={o.pairKey}
              profile={o.profile!}
              match={o.match}
              transcript={messagesByPair.get(o.pairKey) ?? []}
              mySide={normHex(myHex!) <= normHex(o.otherHex) ? 'a' : 'b'}
              onReRun={() => reRun(o.pairKey, o.otherHex, o.profile!)}
              onSend={text => onSendChat(o.pairKey, o.otherHex, o.profile!, text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MatchCard({
  profile,
  match,
  transcript,
  mySide,
  onReRun,
  onSend,
}: {
  profile: Profile;
  match?: Match;
  transcript: AgentMessage[];
  mySide: 'a' | 'b';
  onReRun: () => void;
  onSend: (text: string) => void;
}) {
  const [showChat, setShowChat] = useState(false);
  const [draft, setDraft] = useState('');
  const status = match?.status ?? 'pending';
  const commonGround = match ? parseList(match.commonGround) : [];
  const icebreakers = match ? parseList(match.icebreakers) : [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3">
        <Avatar>
          <AvatarImage src={avatarUrl(profile.avatarSeed)} alt={profile.name} />
          <AvatarFallback>{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="mr-auto min-w-0">
          <CardTitle className="truncate">{profile.name}</CardTitle>
          <div className="text-muted-foreground text-xs truncate">{profile.role}</div>
        </div>
        <CardAction>
          {status === 'complete' ? (
            <div className="text-right">
              <div className="text-2xl font-bold leading-none">{match!.score}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">match</div>
            </div>
          ) : (
            <Badge variant={status === 'error' ? 'destructive' : 'secondary'}>
              {status === 'streaming' ? 'agents talking…' : status === 'error' ? 'error' : 'matching…'}
            </Badge>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1">
        {status === 'complete' && match && (
          <>
            <div className="flex flex-col gap-1.5">
              <Metric label="Shared" value={match.metricShared} />
              <Metric label="Complementary" value={match.metricComplementary} />
              <Metric label="Goals" value={match.metricGoals} />
            </div>
            <p className="text-sm">{match.summary}</p>
            {commonGround.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {commonGround.map((c, i) => (
                  <Badge key={i} variant="secondary">{c}</Badge>
                ))}
              </div>
            )}
            {icebreakers.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Icebreakers</div>
                <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
                  {icebreakers.map((ib, i) => <li key={i}>{ib}</li>)}
                </ul>
              </div>
            )}
          </>
        )}

        {status === 'error' && (
          <p className="text-sm text-destructive">{match?.summary || 'Matching failed.'}</p>
        )}

        {transcript.length > 0 && (
          <div className="mt-auto">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowChat(s => !s)}
            >
              {showChat ? 'Hide' : 'Show'} conversation ({transcript.length})
            </button>
            {showChat && (
              <>
                <ScrollArea className="h-40 mt-2 rounded-md border p-2">
                  <div className="flex flex-col gap-2">
                    {transcript.map(m => {
                      const mine = sideOf(m.speaker) === mySide;
                      const human = isHumanSpeaker(m.speaker);
                      return (
                        <div
                          key={m.id.toString()}
                          className={cn(
                            'flex flex-col gap-0.5 max-w-[85%]',
                            mine ? 'self-end items-end' : 'self-start items-start'
                          )}
                        >
                          {human && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {mine ? 'you' : profile.name}
                            </span>
                          )}
                          <div
                            className={cn(
                              'rounded-lg px-2.5 py-1.5 text-xs',
                              mine
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            {m.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={e => {
                    e.preventDefault();
                    if (!draft.trim()) return;
                    onSend(draft.trim());
                    setDraft('');
                  }}
                >
                  <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={`Jump in — chat with ${profile.name}…`}
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="sm" disabled={!draft.trim()}>
                    Send
                  </Button>
                </form>
              </>
            )}
          </div>
        )}
      </CardContent>

      {(status === 'complete' || status === 'error') && (
        <CardContent className="pt-0">
          <Button size="sm" variant="ghost" onClick={onReRun}>Re-run match</Button>
        </CardContent>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  area?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {area ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className={wide ? 'w-full max-w-lg' : 'w-full max-w-md'}>{children}</Card>
    </div>
  );
}
