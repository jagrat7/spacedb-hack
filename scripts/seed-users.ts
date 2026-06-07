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
  goals: string;
  socials: string;
  persona: string;
};

// A spread of personas with deliberate overlap so matches are interesting:
// some share a domain, some are complementary (one offers what another seeks).
const USERS: Profile[] = [
  {
    name: 'Ada Okafor',
    goals: 'find a designer to make my real-time multiplayer game actually feel good',
    socials: 'github.com/adaokafor, twitter.com/ada_builds, itch.io/profile/adaokafor',
    persona:
      'Pragmatic backend engineer building on SpacetimeDB. Lead with deep systems and database expertise and a working prototype; nerd out about distributed systems. Calm and precise.',
  },
  {
    name: 'Grace Lindqvist',
    goals: 'find engineers building games or dev tools who want a designer to partner with',
    socials: 'dribbble.com/gracelind, twitter.com/gracedesigns, linkedin.com/in/gracelindqvist',
    persona:
      'Product designer who loves motion. Lead with end-to-end product and interaction design; be curious about the technical constraints. Warm, collaborative, detail-oriented.',
  },
  {
    name: 'Hiro Tanaka',
    goals:
      'find a technical cofounder and intros to angel investors for my pre-seed B2B AI agents startup',
    socials: 'twitter.com/hirobuilds, github.com/hirotanaka, linkedin.com/in/hirotanaka',
    persona:
      'Energetic indie-hacker founder. Lead with go-to-market and sales strength and a validated customer pipeline; be upfront that I need someone technical. Keep it scrappy, not corporate.',
  },
  {
    name: 'Mara Velasquez',
    goals: 'find a founder with a real agent product who needs someone to build the brains',
    socials: 'github.com/maravel, twitter.com/mara_ml, huggingface.co/maravel',
    persona:
      'Thoughtful ML engineer who builds eval harnesses for LLM agents. Lead with applied ML and agent orchestration depth; be curious about what people are actually shipping. Low-ego, open-source friendly.',
  },
  {
    name: 'Theo Brandt',
    goals: 'meet early founders building in AI infra and developer tools',
    socials: 'twitter.com/theobrandt, linkedin.com/in/theobrandt, theobrandt.vc',
    persona:
      'Angel investor and ex-founder. Lead with capital, board experience, and an operator network; ask sharp questions about the problem and the team. Direct but warm.',
  },
  {
    name: 'Priya Nair',
    goals: 'find backend folks doing real-time and a designer to pair with',
    socials: 'github.com/priyanair, twitter.com/priyabuilds, linkedin.com/in/priyanair',
    persona:
      'Frontend engineer building a React real-time collaboration app. Lead with fast, polished React frontends and design-system work; be enthusiastic about real-time UIs. Friendly and precise.',
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
      profile.goals,
      profile.socials,
      '', // bio — generated from socials at runtime; empty for seeds
      profile.persona,
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
