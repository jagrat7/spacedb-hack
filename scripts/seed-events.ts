// Seed script: creates several demo EVENTS, and for each event mints a set of
// distinct SpacetimeDB identities, gives each an agent profile, and joins them
// to that event. Run with:  bun run scripts/seed-events.ts
//
// Like seed-users.ts, every attendee is a real, distinct SpacetimeDB identity
// (POST /v1/identity), so you can "log in" as any of them by dropping their
// token into localStorage. Tokens are written to scripts/seeded-events.json.
//
// Requires the `create_event` reducer to be published to the target DB.
//
// Env (falls back to maincloud / .env.local defaults):
//   SPACETIMEDB_HOST       REST host   (default https://maincloud.spacetimedb.com)
//   SPACETIMEDB_DB_NAME    database    (default overlap)
//   CLIENT_WS_HOST         ws host the browser uses, only for the localStorage
//                          key (default wss://maincloud.spacetimedb.com)

import { writeFileSync } from 'node:fs';

const REST_HOST = (
  process.env.SPACETIMEDB_HOST ?? 'https://maincloud.spacetimedb.com'
).replace(/\/$/, '');
const DB_NAME = process.env.SPACETIMEDB_DB_NAME ?? 'overlap';
const CLIENT_WS_HOST = (
  process.env.CLIENT_WS_HOST ?? 'wss://maincloud.spacetimedb.com'
).replace(/\/$/, '');
const TOKEN_KEY = `${CLIENT_WS_HOST}/${DB_NAME}/auth_token`;

type Profile = {
  name: string;
  goals: string;
  socials: string;
  persona: string;
};

type Event = {
  code: string;
  name: string;
  attendees: Profile[];
};

// Each event has its own cast, with deliberate overlap inside the event so
// matches are interesting (some share a domain, some are complementary).
const EVENTS: Event[] = [
  {
    code: 'AIHACK',
    name: 'AI Builders Hack Night',
    attendees: [
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
        goals:
          'find a founder with a real agent product who needs someone to build the brains',
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
        name: 'Sofia Reyes',
        goals: 'find builders with cool agent demos I can amplify to a big dev audience',
        socials: 'twitter.com/sofiadevrel, github.com/sofiareyes, youtube.com/@sofiabuilds',
        persona:
          'Upbeat developer advocate. Lead with reach, content, and a large developer audience; be genuinely enthusiastic about clever demos and teaching. Friendly and high-energy.',
      },
    ],
  },
  {
    code: 'GAMEDEV',
    name: 'Realtime Game Dev Meetup',
    attendees: [
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
        name: 'Kenji Mori',
        goals: 'find an artist and a backend engineer to build multiplayer with',
        socials: 'github.com/kenjimori, twitter.com/kenji_netcode, itch.io/profile/kenjimori',
        persona:
          'Gameplay programmer obsessed with netcode and rollback. Lead with low-level gameplay and networking engineering; talk shop about ECS and fighting games. Direct and a little intense.',
      },
      {
        name: 'Lena Vogt',
        goals: 'find gameplay engineers to bring my effects to life',
        socials: 'artstation.com/lenavogt, twitter.com/lenavfx, github.com/lenavogt',
        persona:
          'Technical artist doing shaders and VFX. Lead with real-time VFX and a strong art-direction sense; get excited about making things look alive. Visual, expressive, generous with feedback.',
      },
    ],
  },
  {
    code: 'SINGLES',
    name: 'Singles Mixer',
    attendees: [
      {
        name: 'Jamie Cole',
        goals: 'meet someone kind and active to share weekend adventures with',
        socials: 'instagram.com/jamieruns, strava.com/athletes/jamiecole',
        persona:
          'Warm pediatric nurse training for a half-marathon. Lead with warmth and great energy; mention trail running, farmers markets, and dogs. Friendly, upbeat, a little goofy.',
      },
      {
        name: 'Diego Marin',
        goals: 'find a partner who loves live music and lazy Sundays',
        socials: 'instagram.com/diegostrings, soundcloud.com/diegomarin',
        persona:
          'Easygoing music teacher recording a folk EP. Lead with home-cooked dinners, playlists, and genuine listening; mention guitar, vinyl, and hiking. Gentle and sincere.',
      },
      {
        name: 'Priya Anand',
        goals: 'meet someone curious and creative to explore the city with',
        socials: 'instagram.com/priyasketches, linkedin.com/in/priyaanand',
        persona:
          'Spirited architect who sketches old cafes. Lead with spontaneity, an eye for hidden gems, and dance moves; mention art galleries, coffee, and salsa. Playful and curious.',
      },
      {
        name: 'Marcus Bell',
        goals: 'find a down-to-earth partner for road trips and quiet nights in',
        socials: 'instagram.com/marcusrides',
        persona:
          'Steady firefighter restoring a 1970s motorcycle. Lead with reliability, good humor, and surprisingly good pancakes; mention fitness, camping, and classic rock. Grounded and warm.',
      },
      {
        name: 'Sara Lindholm',
        goals: 'meet someone gentle and funny who wants a couple of rescue dogs',
        socials: 'instagram.com/sara.and.dogs',
        persona:
          'Kind veterinarian who volunteers at an animal rescue. Lead with compassion, loyalty, and fresh-baked bread; mention animals, kayaking, and board games. Soft-spoken and funny.',
      },
      {
        name: 'Tom Nguyen',
        goals: 'find a witty partner-in-crime for trying every new restaurant',
        socials: 'instagram.com/tomeatsramen, letterboxd.com/tomnguyen',
        persona:
          'Curious data analyst reviewing ramen spots. Lead with curiosity, a knack for planning great dates, and good photos; mention food, cycling, and indie films. Witty and a bit nerdy.',
      },
    ],
  },
  {
    code: 'FOUNDERS',
    name: 'Founders & Funders Mixer',
    attendees: [
      {
        name: 'Theo Brandt',
        goals: 'meet early founders building in AI infra and developer tools',
        socials: 'twitter.com/theobrandt, linkedin.com/in/theobrandt, theobrandt.vc',
        persona:
          'Angel investor and ex-founder. Lead with capital, board experience, and an operator network; ask sharp questions about the problem and the team. Direct but warm.',
      },
      {
        name: 'Nadia Haddad',
        goals: 'find technical founders attacking unsexy industries',
        socials: 'twitter.com/nadiahaddad, linkedin.com/in/nadiahaddad',
        persona:
          'Thesis-driven seed VC focused on vertical SaaS. Lead with seed capital, hiring help, and follow-on intros; probe for real domain insight. Crisp and decisive.',
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
        name: 'Owen Pierce',
        goals: 'find a seed investor who gets bootstrapped-to-venture',
        socials: 'twitter.com/owenbuilds, linkedin.com/in/owenpierce',
        persona:
          'Bootstrapped solo founder building fintech for freelancers. Lead with a profitable product and real revenue traction; be candid about wanting capital without losing scrappiness. Pragmatic and confident.',
      },
    ],
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
  // Optional CLI filter: `bun run scripts/seed-events.ts SINGLES GAMEDEV`
  // seeds only those event codes. With no args, seeds everything. Use this to
  // add a single new event without re-minting attendees for the existing ones.
  const onlyCodes = process.argv.slice(2).map(c => c.trim().toUpperCase());
  const toSeed =
    onlyCodes.length > 0
      ? EVENTS.filter(e => onlyCodes.includes(e.code))
      : EVENTS;

  if (toSeed.length === 0) {
    console.error(`No matching events for: ${onlyCodes.join(', ')}`);
    console.error(`Known codes: ${EVENTS.map(e => e.code).join(', ')}`);
    process.exit(1);
  }

  console.log(`Seeding ${toSeed.length} events into "${DB_NAME}" at ${REST_HOST}\n`);

  // An organizer identity creates the events (create_event keys off nothing
  // sensitive, so any identity works).
  const organizer = await mintIdentity();

  const out: Array<{
    code: string;
    name: string;
    attendees: Array<{ name: string; identity: string; token: string }>;
  }> = [];

  for (const ev of toSeed) {
    await callReducerAs(organizer.token, 'create_event', [ev.code, ev.name]);
    console.log(`Event ${ev.code} — ${ev.name}`);

    const seeded: Array<{ name: string; identity: string; token: string }> = [];
    for (const profile of ev.attendees) {
      const { identity, token } = await mintIdentity();

      await callReducerAs(token, 'upsert_profile', [
        profile.name,
        profile.goals,
        profile.socials,
        '', // bio — generated from socials at runtime; empty for seeds
        profile.persona,
      ]);
      await callReducerAs(token, 'join_event', [ev.code]);

      seeded.push({ name: profile.name, identity, token });
      console.log(`  ✓ ${profile.name.padEnd(18)} ${identity.slice(0, 12)}…`);
    }
    out.push({ code: ev.code, name: ev.name, attendees: seeded });
    console.log('');
  }

  const outFile = 'scripts/seeded-events.json';
  writeFileSync(outFile, JSON.stringify({ tokenKey: TOKEN_KEY, events: out }, null, 2));

  console.log(`Wrote ${toSeed.length} events -> ${outFile}`);
  console.log(`\nlocalStorage key the app reads: ${TOKEN_KEY}`);
  console.log(`\nEvent codes to join in the app: ${toSeed.map(e => e.code).join(', ')}`);
  console.log('\nTo log in as a seeded attendee, paste in the browser console:');
  for (const ev of out) {
    const first = ev.attendees[0];
    console.log(`// ${first.name} (event ${ev.code})`);
    console.log(
      `localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(first.token)}); location.reload();`
    );
  }
}

main().catch((e) => {
  console.error('SEED FAILED:', e);
  process.exit(1);
});
