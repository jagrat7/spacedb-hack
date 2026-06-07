import { createServerFn } from '@tanstack/react-start';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, generateObject, type ModelMessage } from 'ai';
import { z } from 'zod';
import { callReducer, querySql } from '@/lib/spacetimedb-server';

// ── Input ────────────────────────────────────────────────────────────────────

const ProfileLite = z.object({
  name: z.string(),
  goals: z.string(),
  socials: z.string(),
  bio: z.string(),
  persona: z.string(),
});
type ProfileLite = z.infer<typeof ProfileLite>;

const RunMatchInput = z.object({
  eventId: z.number(),
  aIdentity: z.string(),
  bIdentity: z.string(),
  aProfile: ProfileLite,
  bProfile: ProfileLite,
});

// ── Match scorecard schema (structured LLM output) ───────────────────────────

const Scorecard = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Overall value of these two people meeting, 0-100'),
  metricShared: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('How much they share (interests, domain, background)'),
  metricComplementary: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('How well what one offers fits what the other is looking for'),
  metricGoals: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('How aligned their current goals / what they are working on are'),
  summary: z
    .string()
    .describe('One or two sentences on why they should meet'),
  commonGround: z
    .array(z.string())
    .describe('Concrete shared points of interest or overlap'),
  icebreakers: z
    .array(z.string())
    .describe('Specific opening questions/lines to start a real conversation'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const TURNS = 6; // 3 turns each, alternating, starting with speaker "a"

// Server-side logs print to the terminal running `vite dev`, NOT the browser.
const log = (...args: unknown[]) => console.log('[match]', ...args);

const normHex = (hex: string) => hex.toLowerCase().replace(/^0x/, '');
const idArg = (hex: string) => ({ __identity__: `0x${normHex(hex)}` });

function pairKeyFor(eventId: number, aHex: string, bHex: string): string {
  const [first, second] = [normHex(aHex), normHex(bHex)].sort();
  return `${eventId}:${first}:${second}`;
}

function systemFor(p: ProfileLite): string {
  return [
    `You are an AI agent representing ${p.name} at a networking event.`,
    p.goals && `What they want out of this event: ${p.goals}.`,
    p.socials && `Their public profiles / social links for context: ${p.socials}.`,
    p.bio && `Background gathered from their online presence: ${p.bio}.`,
    p.persona && `Additional context to use when representing them: ${p.persona}.`,
    `Speak in the first person as ${p.name}.`,
    `You are at a networking event chatting with another attendee to discover`,
    `common ground and whether you two should meet in person. Speak in the`,
    `first person, naturally, 1-2 sentences, specific and curious. Do not repeat`,
    `yourself or restate your whole bio. Write plain conversational text — no`,
    `stage directions, asterisks, emotes, or narration.`,
  ]
    .filter(Boolean)
    .join(' ');
}

// ── Server function ──────────────────────────────────────────────────────────

export const runMatch = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => RunMatchInput.parse(data))
  .handler(async ({ data }) => {
    const { eventId } = data;
    const pairKey = pairKeyFor(eventId, data.aIdentity, data.bIdentity);

    // Canonicalize: the lexicographically-smaller identity is always speaker "a"
    // so both trigger directions converge on the same match row + transcript.
    const aFirst = normHex(data.aIdentity) <= normHex(data.bIdentity);
    const A = {
      hex: aFirst ? data.aIdentity : data.bIdentity,
      profile: aFirst ? data.aProfile : data.bProfile,
    };
    const B = {
      hex: aFirst ? data.bIdentity : data.aIdentity,
      profile: aFirst ? data.bProfile : data.aProfile,
    };

    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
      const openrouter = createOpenRouter({ apiKey });
      // One model drives both the agent dialogue and the structured scorecard.
      // It must reliably support JSON/structured output over OpenRouter.
      const modelId = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
      const model = openrouter(modelId);
      const matchModel = model;
      log(`begin ${pairKey} — ${A.profile.name} <> ${B.profile.name} (model ${modelId})`);

      await callReducer('begin_match', [
        pairKey,
        eventId,
        idArg(A.hex),
        idArg(B.hex),
      ]);

      // Track the dialogue as structured turns so each agent gets real message
      // history: its own past turns as `assistant`, the other agent's as `user`.
      const turns: { speaker: 'a' | 'b'; name: string; text: string }[] = [];

      const buildMessages = (speaker: 'a' | 'b'): ModelMessage[] => {
        if (turns.length === 0) {
          return [
            {
              role: 'user',
              content:
                'You are meeting another attendee for the first time. Open ' +
                'with a friendly, specific hello that hints at what you do.',
            },
          ];
        }
        // Turns strictly alternate, so this always ends on a `user` message.
        return turns.map(turn => ({
          role: turn.speaker === speaker ? 'assistant' : 'user',
          content: turn.text,
        }));
      };

      // Stream each turn into SpacetimeDB as it generates, so the board shows
      // the agents typing live. DB writes are throttled to keep churn sane.
      for (let turn = 0; turn < TURNS; turn++) {
        const speaker = turn % 2 === 0 ? 'a' : 'b';
        const self = speaker === 'a' ? A.profile : B.profile;

        let streamError: unknown = null;
        const result = streamText({
          model,
          system: systemFor(self),
          messages: buildMessages(speaker),
          onError: ({ error }) => {
            streamError = error;
          },
        });

        let acc = '';
        let lastFlush = 0;
        for await (const delta of result.textStream) {
          acc += delta;
          const now = Date.now();
          if (now - lastFlush > 200) {
            lastFlush = now;
            await callReducer('append_agent_turn', [
              pairKey,
              speaker,
              turn,
              acc.trimStart(),
            ]);
          }
        }
        if (streamError) {
          throw streamError instanceof Error
            ? streamError
            : new Error(String(streamError));
        }

        const turnText = (await result.text).trim();
        // Final write with the complete, trimmed turn.
        await callReducer('append_agent_turn', [
          pairKey,
          speaker,
          turn,
          turnText,
        ]);
        turns.push({ speaker, name: self.name, text: turnText });
        log(`turn ${turn} (${self.name}): ${turnText}`);
      }

      const transcript = turns.map(t => `${t.name}: ${t.text}`).join('\n');

      // Produce the structured scorecard from the full transcript + profiles.
      const profileBlock = (label: string, p: ProfileLite) =>
        `${label}: ${p.name}. Goals: ${p.goals}. ` +
        `Socials: ${p.socials}. Background: ${p.bio}. Additional context: ${p.persona}.`;

      const { object: card } = await generateObject({
        model: matchModel,
        schema: Scorecard,
        system:
          'You evaluate how valuable it is for two people at a networking ' +
          'event to meet, based on their profiles and the conversation their ' +
          'agents just had. Be concrete and grounded in what they actually said.',
        prompt: [
          profileBlock('Person A', A.profile),
          profileBlock('Person B', B.profile),
          '',
          'Their agents had this conversation:',
          transcript,
          '',
          'Score the match and give common ground and icebreakers they can use ' +
            'when they meet in person.',
        ].join('\n'),
      });

      log(`scorecard ${pairKey}: score=${card.score} shared=${card.metricShared} complementary=${card.metricComplementary} goals=${card.metricGoals}`);
      log(`summary: ${card.summary}`);

      await callReducer('complete_match', [
        pairKey,
        card.score,
        card.metricShared,
        card.metricComplementary,
        card.metricGoals,
        card.summary,
        JSON.stringify(card.commonGround),
        JSON.stringify(card.icebreakers),
      ]);

      return { pairKey, status: 'complete' as const, score: card.score };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[match] FAILED', pairKey, message);
      await callReducer('fail_match', [pairKey, message]).catch(() => {});
      return { pairKey, status: 'error' as const, error: message };
    }
  });

// ── Agent reply (human-in-the-loop chat) ─────────────────────────────────────
// Called when a human posts into a match's chat and the other side is still
// agent-driven (its human hasn't taken over). Generates that side's agent reply
// from the full conversation history and streams it in as the next turn.

const RunAgentReplyInput = z.object({
  pairKey: z.string(),
  responderSide: z.enum(['a', 'b']),
  responderProfile: ProfileLite,
});

export const runAgentReply = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => RunAgentReplyInput.parse(data))
  .handler(async ({ data }) => {
    const { pairKey, responderSide, responderProfile } = data;
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
      const model = createOpenRouter({ apiKey })(
        process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'
      );

      // pairKey is `eventId:hexA:hexB` (no quotes), so this interpolation is safe.
      const rows = await querySql(
        `SELECT speaker, turn, text FROM agent_message WHERE pair_key = '${pairKey}'`
      );
      const history = (rows[0]?.rows ?? [])
        .map(r => ({
          speaker: String(r[0]),
          turn: Number(r[1]),
          text: String(r[2]),
        }))
        .sort((a, b) => a.turn - b.turn);

      const nextTurn =
        history.reduce((mx, h) => Math.max(mx, h.turn), -1) + 1;

      // speaker is 'a'/'b' (agent) or 'a_human'/'b_human'; the leading char is
      // the side. Messages on the responder's side are the assistant's own.
      const messages: ModelMessage[] = history.map(h => ({
        role: h.speaker.startsWith(responderSide) ? 'assistant' : 'user',
        content: h.text,
      }));

      const result = streamText({
        model,
        system: systemFor(responderProfile),
        messages,
      });

      let acc = '';
      let lastFlush = 0;
      for await (const delta of result.textStream) {
        acc += delta;
        const now = Date.now();
        if (now - lastFlush > 200) {
          lastFlush = now;
          await callReducer('append_agent_turn', [
            pairKey,
            responderSide,
            nextTurn,
            acc.trimStart(),
          ]);
        }
      }
      const text = (await result.text).trim();
      await callReducer('append_agent_turn', [
        pairKey,
        responderSide,
        nextTurn,
        text,
      ]);

      log(`agent reply ${pairKey} side=${responderSide} turn=${nextTurn}: ${text}`);
      return { pairKey, ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[match] agent reply FAILED', pairKey, message);
      return { pairKey, ok: false as const, error: message };
    }
  });
