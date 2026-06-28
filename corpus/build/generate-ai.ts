import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readCache, writeCache } from './cache';
import { wordCount } from './clean';
import {
  AI_MODELS,
  AI_MODELS_FRONTIER,
  buildAssignments,
  type AiModel,
  type Assignment,
} from './data';
import type { Genre, RawItem } from './types';

const execFileP = promisify(execFile);

// TIER=frontier generates with current frontier models and APPENDS to ai.json.
const FRONTIER = process.env.TIER === 'frontier';
// Frontier models reason before answering; effort:low minimizes it, and the big
// budget ensures the prose still completes (some models can't disable reasoning).
const MAX_TOKENS = FRONTIER ? 3500 : 700;

function readKey(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}
const DEEPSEEK_KEY = readKey('/home/joe/secrets/deepseek');
const OPENROUTER_KEY = readKey('/home/joe/secrets/openrouter');

const SYSTEM =
  'You are writing a short, standalone piece of writing to be read on its own. ' +
  'Output ONLY the piece itself: no title, no preamble, no explanation, no sign-off, ' +
  'no markdown formatting. Do not mention that you are an AI.';

function userPrompt(a: Assignment): string {
  const target = '(about 180–260 words)';
  const base: Record<Genre, string> = {
    encyclopedic: `Write an encyclopedia-style explanatory passage ${target}, neutral and factual, in the third person, about: ${a.topic}.`,
    news: `Write a short news report ${target} about: ${a.topic}. Use an inverted-pyramid structure and invent plausible specific details, names, and quotes.`,
    essay: `Write a reflective personal essay ${target} on: ${a.topic}.`,
    travel: `Write a travel guide passage ${target} describing: ${a.topic}.`,
    fiction: `Write a passage of literary short fiction ${target}: ${a.topic}.`,
    poetry: `Write a short poem (3–5 stanzas) about: ${a.topic}. Preserve line breaks.`,
  };
  const humanized =
    a.style === 'humanized'
      ? ' Write in a casual, personal voice with natural rhythm and small imperfections; vary sentence length and avoid a rigid, listy template.'
      : '';
  return base[a.genre] + humanized;
}

async function callOpenAiCompatible(
  endpoint: string,
  key: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'http-referer': 'https://github.com/prose-or-con',
      'x-title': 'Prose or Con corpus',
    },
    body: JSON.stringify({
      model,
      temperature: 1.0,
      max_tokens: MAX_TOKENS,
      // Creative writing needs little chain-of-thought; effort:low keeps reasoning
      // models from burning the whole budget thinking (Gemini rejects fully disabling it).
      ...(FRONTIER ? { reasoning: { effort: 'low' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text().catch(() => '')}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty completion');
  return text;
}

async function callClaudeCli(system: string, user: string): Promise<string> {
  const { stdout } = await execFileP('claude', ['-p', `${system}\n\n${user}`], {
    maxBuffer: 1024 * 1024,
    timeout: 180_000,
  });
  return stdout.trim();
}

async function generate(model: AiModel, a: Assignment): Promise<string> {
  const user = userPrompt(a);
  switch (model.provider) {
    case 'deepseek':
      if (!DEEPSEEK_KEY) throw new Error('no deepseek key');
      return callOpenAiCompatible('https://api.deepseek.com/chat/completions', DEEPSEEK_KEY, model.id, SYSTEM, user);
    case 'openrouter':
      if (!OPENROUTER_KEY) throw new Error('no openrouter key');
      return callOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', OPENROUTER_KEY, model.id, SYSTEM, user);
    case 'claude-cli':
      return callClaudeCli(SYSTEM, user);
  }
}

function availableModels(): AiModel[] {
  const pool = FRONTIER ? AI_MODELS_FRONTIER : AI_MODELS;
  return pool.filter((m) => {
    if (m.provider === 'deepseek') return !!DEEPSEEK_KEY;
    if (m.provider === 'openrouter') return !!OPENROUTER_KEY;
    return true; // claude-cli
  });
}

async function mapPool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main(): Promise<void> {
  const models = availableModels();
  if (models.length === 0) throw new Error('no AI providers available');
  console.log(`Generating with: ${models.map((m) => m.label).join(', ')}`);

  const assignments = buildAssignments();
  const results = await mapPool(assignments, 6, async (a, i): Promise<RawItem | null> => {
    const model = models[i % models.length]!;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await generate(model, a);
        if (wordCount(text) >= 60) {
          const item: RawItem = {
            author: 'ai',
            genre: a.genre,
            text,
            promptStyle: a.style,
            meta: { source: model.label, license: 'AI-generated', model: model.id },
          };
          return item;
        }
      } catch (err) {
        console.warn(`  [${model.label}] ${a.genre}/${a.topic} attempt ${attempt + 1}: ${(err as Error).message}`);
      }
    }
    console.warn(`  dropped ${a.genre}/${a.topic} (${model.label})`);
    return null;
  });

  const fresh = results.filter((r): r is RawItem => r !== null);
  // Frontier tier augments the existing AI set; base tier replaces it. Re-running
  // frontier replaces only the frontier-model items, so it stays idempotent.
  let items = fresh;
  if (FRONTIER) {
    const frontierIds = new Set(AI_MODELS_FRONTIER.map((m) => m.id));
    items = [...readCache('ai').filter((it) => !frontierIds.has(it.meta.model ?? '')), ...fresh];
  }
  writeCache('ai', items);

  const counts: Record<string, number> = {};
  for (const it of fresh) counts[it.genre] = (counts[it.genre] ?? 0) + 1;
  console.log(`\nGenerated ${fresh.length} ${FRONTIER ? 'frontier ' : ''}AI passages (ai.json now ${items.length}):`);
  for (const [g, c] of Object.entries(counts)) console.log(`  ${g.padEnd(13)} ${c}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
