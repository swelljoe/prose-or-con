import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function unpack(secret: string): { author: 'human' | 'ai'; meta: Meta } {
  return JSON.parse(Buffer.from(secret, 'base64').toString('utf8'));
}

function cleanItem(raw: RawItem): string {
  return clean(raw.text, { author: raw.author, poetry: raw.genre === 'poetry' });
}

/** Derive the public attribution row from a packed item (single source of truth). */
function sourceOf(item: PackedItem): SourceEntry {
  const { author, meta } = unpack(item.secret);
  return {
    id: item.id,
    kind: author,
    source: meta.source,
    title: meta.title,
    author: meta.author,
    url: meta.url,
    license: meta.license,
    licenseUrl: meta.licenseUrl,
    model: meta.model,
  };
}

/** Existing committed corpus, or [] if none. The base for additive (MERGE) builds. */
function loadExisting(): PackedItem[] {
  const p = join(OUT, 'corpus.json');
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, 'utf8')) as { items?: PackedItem[] }).items ?? [];
}

/** Take up to `cap` items, round-robin across genres so a cap stays balanced. */
function takeBalanced(cands: PackedItem[], cap: number): PackedItem[] {
  if (cands.length <= cap) return cands;
  const byGenre = new Map<string, PackedItem[]>();
  for (const it of cands) {
    const g = byGenre.get(it.genre) ?? [];
    g.push(it);
    byGenre.set(it.genre, g);
  }
  const buckets = [...byGenre.values()];
  const out: PackedItem[] = [];
  for (let i = 0; out.length < cap && buckets.some((b) => b.length > 0); i++) {
    const next = buckets[i % buckets.length]!.shift();
    if (next) out.push(next);
  }
  return out;
}

function main(): void {
  // MERGE=1 keeps the existing corpus and appends only new items (preserving
  // every id). GROW=<n> caps how many new items to add (balanced across genres).
  const merge = process.env.MERGE === '1' || process.env.MERGE === 'true';
  const grow = process.env.GROW ? Number(process.env.GROW) : Infinity;
  if (process.env.GROW && !Number.isFinite(grow)) throw new Error('GROW must be a number');

  const existing = merge ? loadExisting() : [];
  const items: PackedItem[] = [...existing];
  const seen = new Set(items.map((it) => it.id));

  const human = readCache('human');
  const ai = readCache('ai');
  if (existing.length === 0 && human.length === 0 && ai.length === 0) {
    throw new Error('no cached items — run corpus:fetch and corpus:generate first');
  }

  // New, in-band, non-duplicate candidates from the caches.
  const candidates: PackedItem[] = [];
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
    if (seen.has(id)) continue; // already in the corpus, or a duplicate in this batch
    seen.add(id);
    candidates.push({ id, text, genre: raw.genre, wordCount: wc, secret: pack(raw.author, raw.meta) });
  }

  const added = Number.isFinite(grow) ? takeBalanced(candidates, grow) : candidates;
  items.push(...added);

  const sources = items.map(sourceOf);
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
  for (const it of items) {
    const { author } = unpack(it.secret);
    (counts[it.genre] ??= { human: 0, ai: 0 })[author]++;
  }
  console.log(
    merge
      ? `Merged: kept ${existing.length}, added ${added.length} of ${candidates.length} new candidates, dropped ${dropped} out-of-band; total ${items.length}.`
      : `Built ${items.length} passages (dropped ${dropped} out-of-band/duplicate).`,
  );
  console.log('genre          human  ai');
  for (const [g, c] of Object.entries(counts)) {
    console.log(`  ${g.padEnd(13)} ${String(c.human).padStart(4)} ${String(c.ai).padStart(4)}`);
  }
  console.log(`Wrote ${join(OUT, 'corpus.json')} and sources.json`);
}

main();
