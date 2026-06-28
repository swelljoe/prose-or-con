import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCache } from './cache';
import { clean, MAX_WORDS, MIN_WORDS, wordCount } from './clean';
import type { Meta, RawItem } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', 'web', 'public');
const ROUNDS = 10;
// Cleaning can shift length slightly; allow a little slack over the band.
const MAX_SLACK = Math.round(MAX_WORDS * 1.15);
// Poems run longer than prose; allow more room before dropping them.
const POETRY_MAX = 520;

interface PackedItem {
  id: string;
  text: string;
  genre: string;
  wordCount: number;
  secret: string;
}
interface SourceEntry {
  id: string; // matches the corpus item id; the join key for item_stats
  kind: 'human' | 'ai';
  source: string;
  title?: string;
  author?: string;
  url?: string;
  license: string;
  licenseUrl?: string;
  model?: string;
}

function pack(author: string, meta: Meta): string {
  return Buffer.from(JSON.stringify({ author, meta }), 'utf8').toString('base64');
}

function cleanItem(raw: RawItem): string {
  return clean(raw.text, { author: raw.author, poetry: raw.genre === 'poetry' });
}

function main(): void {
  const human = readCache('human');
  const ai = readCache('ai');
  if (human.length === 0 && ai.length === 0) {
    throw new Error('no cached items — run corpus:fetch and corpus:generate first');
  }

  const items: PackedItem[] = [];
  const sources: SourceEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of [...human, ...ai]) {
    const text = cleanItem(raw);
    const wc = wordCount(text);
    const minAllowed = raw.genre === 'poetry' ? 80 : MIN_WORDS;
    const maxAllowed = raw.genre === 'poetry' ? POETRY_MAX : MAX_SLACK;
    if (wc < minAllowed || wc > maxAllowed) {
      dropped++;
      continue;
    }
    const id = createHash('sha256').update(text).digest('hex').slice(0, 12);
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, text, genre: raw.genre, wordCount: wc, secret: pack(raw.author, raw.meta) });
    sources.push({
      id,
      kind: raw.author,
      source: raw.meta.source,
      title: raw.meta.title,
      author: raw.meta.author,
      url: raw.meta.url,
      license: raw.meta.license,
      licenseUrl: raw.meta.licenseUrl,
      model: raw.meta.model,
    });
  }

  sources.sort((a, b) => a.source.localeCompare(b.source) || (a.title ?? '').localeCompare(b.title ?? ''));

  const corpus = {
    version: 1,
    builtAt: new Date().toISOString(),
    rounds: Math.min(ROUNDS, items.length),
    items,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'corpus.json'), JSON.stringify(corpus, null, 2));
  writeFileSync(join(OUT, 'sources.json'), JSON.stringify(sources, null, 2));

  const counts: Record<string, { human: number; ai: number }> = {};
  for (const raw of [...human, ...ai]) {
    counts[raw.genre] ??= { human: 0, ai: 0 };
  }
  for (let i = 0; i < items.length; i++) {
    const a = JSON.parse(Buffer.from(items[i]!.secret, 'base64').toString()) as { author: 'human' | 'ai' };
    counts[items[i]!.genre]![a.author]++;
  }
  console.log(`Built ${items.length} passages (dropped ${dropped} out-of-band/duplicate).`);
  console.log('genre          human  ai');
  for (const [g, c] of Object.entries(counts)) {
    console.log(`  ${g.padEnd(13)} ${String(c.human).padStart(4)} ${String(c.ai).padStart(4)}`);
  }
  console.log(`Wrote ${join(OUT, 'corpus.json')} and sources.json`);
}

main();
