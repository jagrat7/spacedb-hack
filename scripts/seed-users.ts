// Seed script: creates several demo users, each with its own SpacetimeDB
// identity + token, gives each an agent profile, and joins them all to the
// DEMO event. Run with:  bun run scripts/seed-users.ts
//
// Each user is a real, distinct SpacetimeDB identity (POST /v1/identity), so
// you can "log in" as any of them in the browser by dropping their token into
// localStorage — the script prints a ready-to-paste console snippet for each.
//
// Env (falls back to local dev defaults):
//   SPACETIMEDB_HOST       REST host   (default http://127.0.0.1:3000)
//   SPACETIMEDB_DB_NAME    database    (default 1stdb)
//   SEED_EVENT_CODE        event code  (default DEMO)
//   CLIENT_WS_HOST         the ws host the browser uses, only used to compute
//                          the localStorage key (default ws://127.0.0.1:3000)

import { writeFileSync } from 'node:fs';

const REST_HOST = (process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const DB_NAME = process.env.SPACETIMEDB_DB_NAME ?? '1stdb';
const EVENT_CODE = process.env.SEED_EVENT_CODE ?? 'DEMO';
// The browser stores its token under `${VITE_SPACETIMEDB_HOST}/${DB}/auth_token`
// (see src/router.tsx). Default matches .env.local.
const CLIENT_WS_HOST = (process.env.CLIENT_WS_HOST ?? 'ws://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN_KEY = `${CLIENT_WS_HOST}/${DB_NAME}/auth_token`;

type Profile = {
  name: string;
  role: string;
  workingOn: string;
  interests: string;
  lookingFor: string;
  offer: string;
};

// A spread of personas with deliberate overlap so matches are interesting:
// some share a domain, some are complementary (one offers what another seeks).
const USERS: Profile[] = [
  {
    name: 'Ada Okafor',
    role: 'Backend engineer',
    workingOn: 'a real-time multiplayer game backend on SpacetimeDB',
    interests: 'distributed systems, databases, live jazz',
    lookingFor: 'a designer to make the game actually feel good',
    offer: 'deep systems + database expertise, and a working prototype',
  },
  {
    name: 'Grace Lindqvist',
    role: 'Product designer',
    workingOn: 'UX for developer tools and game UIs',
    interests: 'developer experience, motion design, jazz',
    lookingFor: 'engineers building games or dev tools to design with',
    offer: 'end-to-end product & interaction design',
  },
  {
    name: 'Hiro Tanaka',
    role: 'Founder / indie hacker',
    workingOn: 'a B2B AI agents startup, pre-seed',
    interests: 'startups, LLM agents, fundraising, climbing',
    lookingFor: 'a technical cofounder and intros to angel investors',
    offer: 'go-to-market, sales, and a validated pipeline of customers',
  },
  {
    name: 'Mara Velasquez',
    role: 'ML engineer',
    workingOn: 'evaluation harnesses for LLM agents',
    interests: 'LLM agents, eval, open-source, climbing',
    lookingFor: 'a founder with a real agent product to build the brains for',
    offer: 'applied ML, agent orchestration, and eval tooling',
  },
  {
    name: 'Theo Brandt',
    role: 'Angel investor / ex-founder',
    workingOn: 'writing first checks into AI infra startups',
    interests: 'AI infrastructure, developer tools, sailing',
    lookingFor: 'early founders in AI infra and dev tools',
    offer: 'capital, board experience, and a network of operators',
  },
  {
    name: 'Priya Nair',
    role: 'Frontend engineer',
    workingOn: 'a React real-time collaboration app',
    interests: 'React, real-time UIs, design systems, running',
    lookingFor: 'backend folks doing real-time and a designer to pair with',
    offer: 'fast, polished React frontends and design-system work',
  },
];

async function postJson(path: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${REST_HOST}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

async function mintIdentity(): Promise<{ identity: string; token: string }> {
  const res = await fetch(`${REST_HOST}/v1/identity`, { method: 'POST' });
  if (!res.ok) throw new Error(`mint identity failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { identity: string; token: string };
}

async function callReducerAs(token: string, name: string, args: unknown[]) {
  await postJson(`/v1/database/${DB_NAME}/call/${name}`, token, args);
}

async function main() {
  console.log(`Seeding ${USERS.length} users into "${DB_NAME}" at ${REST_HOST}`);
  console.log(`Event code: ${EVENT_CODE}\n`);

  const seeded: Array<{ name: string; identity: string; token: string }> = [];

  for (const profile of USERS) {
    const { identity, token } = await mintIdentity();

    // upsert_profile uses ctx.sender, so we call it WITH this user's token.
    await callReducerAs(token, 'upsert_profile', [
      profile.name,
      profile.role,
      profile.workingOn,
      profile.interests,
      profile.lookingFor,
      profile.offer,
    ]);

    // join_event also keys off ctx.sender.
    await callReducerAs(token, 'join_event', [EVENT_CODE]);

    seeded.push({ name: profile.name, identity, token });
    console.log(`  ✓ ${profile.name.padEnd(18)} ${identity.slice(0, 12)}…`);
  }

  // Persist tokens for convenience / reuse.
  const outFile = 'scripts/seeded-users.json';
  writeFileSync(outFile, JSON.stringify({ tokenKey: TOKEN_KEY, users: seeded }, null, 2));

  console.log(`\nWrote ${seeded.length} users -> ${outFile}`);
  console.log(`\nlocalStorage key the app reads: ${TOKEN_KEY}\n`);
  console.log('To log in as a user: open the app, open the browser console, paste:\n');
  for (const u of seeded) {
    console.log(`// ${u.name}`);
    console.log(
      `localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(u.token)}); location.reload();\n`
    );
  }
}

main().catch((e) => {
  console.error('SEED FAILED:', e);
  process.exit(1);
});
