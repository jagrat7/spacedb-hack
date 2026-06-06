import { createServerFn } from '@tanstack/react-start';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { callReducer } from '@/lib/spacetimedb-server';

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
    `yourself or restate your whole bio.`,
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

      // Stream the agent↔agent dialogue into SpacetimeDB, one turn at a time.
      let transcript = '';
      for (let turn = 0; turn < TURNS; turn++) {
        const speaker = turn % 2 === 0 ? 'a' : 'b';
        const self = speaker === 'a' ? A.profile : B.profile;
        const prompt =
          transcript === ''
            ? 'Open the conversation with a friendly, specific hello that hints at what you do.'
            : `Conversation so far:\n${transcript}\nReply as ${self.name}.`;

        const { text } = await generateText({
          model,
          system: systemFor(self),
          prompt,
        });
        const turnText = text.trim();

        await callReducer('append_agent_turn', [
          pairKey,
          speaker,
          turn,
          turnText,
        ]);
        transcript += `${self.name}: ${turnText}\n`;
      }

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
