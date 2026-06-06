// Throwaway verification: exercises the full match pipeline (OpenRouter -> AI
// SDK -> reducers -> tables) against the local DB, without the browser.
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { callReducer, querySql } from '../src/lib/spacetimedb-server';

const A = { hex: 'aa00000000000000000000000000000000000000000000000000000000000001', profile: { name: 'Ada', role: 'Backend engineer', workingOn: 'a real-time DB', interests: 'distributed systems, jazz', lookingFor: 'a design partner', offer: 'systems expertise' } };
const B = { hex: 'bb00000000000000000000000000000000000000000000000000000000000002', profile: { name: 'Grace', role: 'Product designer', workingOn: 'dev tools UX', interests: 'developer experience, jazz', lookingFor: 'engineers to build with', offer: 'product/design' } };
const pairKey = `99:${A.hex}:${B.hex}`;
const idArg = (h: string) => ({ __identity__: `0x${h}` });

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const model = openrouter(process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet');

const Scorecard = z.object({
  score: z.number().int().min(0).max(100),
  metricShared: z.number().int().min(0).max(100),
  metricComplementary: z.number().int().min(0).max(100),
  metricGoals: z.number().int().min(0).max(100),
  summary: z.string(),
  commonGround: z.array(z.string()),
  icebreakers: z.array(z.string()),
});

async function main() {
  console.log('model:', process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet');
  await callReducer('begin_match', [pairKey, 99, idArg(A.hex), idArg(B.hex)]);
  let transcript = '';
  for (let turn = 0; turn < 4; turn++) {
    const self = turn % 2 === 0 ? A.profile : B.profile;
    const { text } = await generateText({
      model,
      system: `You are ${self.name}, ${self.role}. Networking, 1-2 sentences, first person.`,
      prompt: transcript === '' ? 'Say hello.' : `So far:\n${transcript}\nReply as ${self.name}.`,
    });
    await callReducer('append_agent_turn', [pairKey, turn % 2 === 0 ? 'a' : 'b', turn, text.trim()]);
    transcript += `${self.name}: ${text.trim()}\n`;
    console.log(`turn ${turn} (${self.name}):`, text.trim().slice(0, 80));
  }
  const { object: card } = await generateObject({
    model: openrouter(process.env.OPENROUTER_MATCH_MODEL ?? 'openai/gpt-4o-mini'),
    schema: Scorecard,
    prompt: `A=${JSON.stringify(A.profile)}\nB=${JSON.stringify(B.profile)}\nConversation:\n${transcript}\nScore the match.`,
  });
  console.log('scorecard:', card);
  await callReducer('complete_match', [pairKey, card.score, card.metricShared, card.metricComplementary, card.metricGoals, card.summary, JSON.stringify(card.commonGround), JSON.stringify(card.icebreakers)]);

  const m = await querySql(`SELECT pair_key, status, score FROM match WHERE pair_key = '${pairKey}'`);
  const msgs = await querySql(`SELECT turn FROM agent_message WHERE pair_key = '${pairKey}'`);
  console.log('match row:', JSON.stringify(m[0]?.rows));
  console.log('agent_message count:', msgs[0]?.rows.length);
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
