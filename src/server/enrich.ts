import { createServerFn } from '@tanstack/react-start';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { z } from 'zod';

// ── Input ────────────────────────────────────────────────────────────────────

const EnrichInput = z.object({
  name: z.string(),
  goals: z.string(),
  socials: z.array(z.string()),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_LINKS = 5; // cap scrapes so onboarding stays fast + cheap
const MAX_CHARS = 4000; // trim each page before sending to the LLM

// Server-side logs print to the terminal running `vite dev`, NOT the browser
// console (server functions execute on the server).
const log = (...args: unknown[]) => console.log('[enrich]', ...args);

// Accept bare handles/domains ("twitter.com/rachel") as well as full URLs.
function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

// Scrape one page to markdown via the Firecrawl REST API.
async function scrape(url: string, apiKey: string): Promise<string> {
  const started = Date.now();
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { markdown?: string } };
  const markdown = json.data?.markdown ?? '';
  log(`scraped ${url} -> ${markdown.length} chars in ${Date.now() - started}ms`);
  return markdown;
}

// ── Server function ──────────────────────────────────────────────────────────
// Scrapes the attendee's social links with Firecrawl, then asks the LLM to
// distill them into a short context blurb the matching agent can use. Returns
// the blurb for the client to review before saving — it is not persisted here.

export const enrichFromSocials = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => EnrichInput.parse(data))
  .handler(async ({ data }) => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY is not set');

    const urls = data.socials
      .map(normalizeUrl)
      .filter((u): u is string => !!u)
      .slice(0, MAX_LINKS);

    log(`request for "${data.name}" — ${urls.length} link(s):`, urls);

    if (urls.length === 0) {
      log('no valid links, aborting');
      return { description: '', sources: [] as string[], note: 'No valid links to read.' };
    }

    // Scrape in parallel; tolerate individual failures (private/blocked pages).
    const results = await Promise.all(
      urls.map(async url => {
        try {
          const markdown = await scrape(url, firecrawlKey);
          return markdown.trim() ? { url, content: markdown.slice(0, MAX_CHARS) } : null;
        } catch (err) {
          log(`FAILED ${url}:`, err instanceof Error ? err.message : err);
          return null;
        }
      })
    );
    const scraped = results.filter((r): r is { url: string; content: string } => !!r);
    log(`scraped ${scraped.length}/${urls.length} link(s) successfully`);

    if (scraped.length === 0) {
      return {
        description: '',
        sources: [] as string[],
        note: 'Could not read any of those links (they may be private or blocked).',
      };
    }

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) throw new Error('OPENROUTER_API_KEY is not set');
    const model = createOpenRouter({ apiKey: openrouterKey })(
      process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'
    );

    const sourceBlocks = scraped
      .map(s => `--- Source: ${s.url} ---\n${s.content}`)
      .join('\n\n');

    const { text } = await generateText({
      model,
      system:
        'You write a concise context note about a person for their AI networking ' +
        'agent to use. Base it ONLY on the scraped pages provided. Cover what they ' +
        'do, what they are working on, notable background, and clear interests. ' +
        '2-4 sentences, third person, factual, no fluff or speculation. If the ' +
        'pages reveal little, keep it short rather than inventing.',
      prompt: [
        data.name && `Person: ${data.name}.`,
        data.goals && `Their stated goals: ${data.goals}.`,
        '',
        'Scraped from their social links:',
        sourceBlocks,
        '',
        'Write the context note now.',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const description = text.trim();
    log(`generated description (${description.length} chars):\n${description}`);

    return {
      description,
      sources: scraped.map(s => s.url),
    };
  });
