import { createServerFn } from '@tanstack/react-start';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, generateObject, type ModelMessage } from 'ai';
import { z } from 'zod';
import { callReducer, querySql } from '@/lib/spacetimedb-server';

// ── Input ────────────────────────────────────────────────────────────────────

const ProfileLite = z.object({
  name: z.string(),
  role: z.string(),
  workingOn: z.string(),
  interests: z.string(),
  lookingFor: z.string(),
  offer: z.string(),
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
const normHex = (hex: string) => hex.toLowerCase().replace(/^0x/, '');
const idArg = (hex: string) => ({ __identity__: `0x${normHex(hex)}` });

function pairKeyFor(eventId: number, aHex: string, bHex: string): string {
  const [first, second] = [normHex(aHex), normHex(bHex)].sort();
  return `${eventId}:${first}:${second}`;
}

function systemFor(p: ProfileLite): string {
  return [
    `You are ${p.name}, ${p.role}.`,
    p.workingOn && `You are currently working on: ${p.workingOn}.`,
    p.interests && `Your interests: ${p.interests}.`,
    p.lookingFor && `At this event you are looking for: ${p.lookingFor}.`,
    p.offer && `You can offer: ${p.offer}.`,
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
      // Conversational model for the agent dialogue.
      const model = openrouter(
        process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-haiku'
      );
      // Separate model for the structured scorecard — must reliably support
      // JSON/structured output over OpenRouter (claude-3.5-haiku does not).
      const matchModel = openrouter(
        process.env.OPENROUTER_MATCH_MODEL ?? 'openai/gpt-4o-mini'
      );

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
      }

      const transcript = turns.map(t => `${t.name}: ${t.text}`).join('\n');

      // Produce the structured scorecard from the full transcript + profiles.
      const profileBlock = (label: string, p: ProfileLite) =>
        `${label}: ${p.name} (${p.role}). Working on: ${p.workingOn}. ` +
        `Interests: ${p.interests}. Looking for: ${p.lookingFor}. Offers: ${p.offer}.`;

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
        process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-haiku'
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

      return { pairKey, ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { pairKey, ok: false as const, error: message };
    }
  });
