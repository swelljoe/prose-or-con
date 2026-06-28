import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCache } from './cache';
import { MAX_WORDS, MIN_WORDS } from './clean';
import type { Meta } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, '..', '..', 'web', 'public', 'corpus.json');
const MAX_SLACK = Math.round(MAX_WORDS * 1.15);

interface PackedItem {
  id: string;
  text: string;
  genre: string;
  wordCount: number;
  secret: string;
}

// Tells that must not survive into a displayed passage.
const BANNED: { re: RegExp; why: string }[] = [
  { re: /\bas an ai\b/i, why: 'AI self-reference' },
  { re: /\[\s*\d+\s*\]/, why: 'citation marker' },
  { re: /^\s*references\s*$/im, why: 'References heading' },
  { re: /\bwikipedia\b/i, why: 'source name (Wikipedia)' },
  { re: /\bwikinews\b/i, why: 'source name (Wikinews)' },
  { re: /\bthe conversation\b/i, why: 'source name (The Conversation)' },
  { re: /\bpropublica\b/i, why: 'source name (ProPublica)' },
  { re: /\bproject gutenberg\b/i, why: 'source name (Project Gutenberg)' },
  { re: /\*\*|^#{1,6}\s|\bhttps?:\/\//im, why: 'leftover markdown/URL' },
];

function fail(msgs: string[]): never {
  console.error(`\n✗ verify failed:\n - ${msgs.join('\n - ')}`);
  process.exit(1);
}

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const corpus = JSON.parse(readFileSync(CORPUS, 'utf8')) as { items: PackedItem[]; rounds: number };
  const byGenre: Record<string, { human: number; ai: number }> = {};

  for (const it of corpus.items) {
    const ans = JSON.parse(Buffer.from(it.secret, 'base64').toString()) as { author: 'human' | 'ai'; meta: Meta };
    byGenre[it.genre] ??= { human: 0, ai: 0 };
    byGenre[it.genre]![ans.author]++;

    const minW = it.genre === 'poetry' ? 80 : MIN_WORDS;
    const maxW = it.genre === 'poetry' ? 520 : MAX_SLACK;
    if (it.wordCount < minW || it.wordCount > maxW) {
      errors.push(`${it.id} (${it.genre}) out of band: ${it.wordCount} words`);
    }
    for (const { re, why } of BANNED) {
      if (re.test(it.text)) errors.push(`${it.id} (${ans.author}/${it.genre}): ${why}`);
    }
    // ND sources must carry an author byline for reveal.
    if (ans.meta.nd && !ans.meta.author) {
      errors.push(`${it.id}: ND source "${ans.meta.source}" missing author byline`);
    }
  }

  // Genre balance: every genre needs both classes, neither more than 3x the other.
  for (const [g, c] of Object.entries(byGenre)) {
    if (c.human === 0 || c.ai === 0) {
      warnings.push(`genre ${g} is one-sided (human ${c.human}, ai ${c.ai})`);
    } else if (c.human > c.ai * 3 || c.ai > c.human * 3) {
      warnings.push(`genre ${g} imbalanced (human ${c.human}, ai ${c.ai})`);
    }
  }

  // Pre-2022 evidence for human items (from the fetch cache).
  for (const raw of readCache('human')) {
    if (!raw.publishedBefore) {
      errors.push(`human "${raw.meta.title ?? raw.meta.source}" lacks pre-2022 evidence`);
      continue;
    }
    const m = raw.publishedBefore.match(/(20\d{2}|19\d{2})/);
    if (m && Number(m[1]) >= 2022) {
      errors.push(`human "${raw.meta.title}" dated ${m[1]} (not pre-2022)`);
    }
    if (raw.meta.nd) {
      warnings.push(`ND source needs manual pre-2022 + verbatim check: ${raw.meta.url}`);
    }
  }

  const total = corpus.items.length;
  const humans = Object.values(byGenre).reduce((s, c) => s + c.human, 0);
  console.log(`Corpus: ${total} passages (${humans} human, ${total - humans} ai), ${corpus.rounds} rounds/game.`);
  for (const [g, c] of Object.entries(byGenre)) {
    console.log(`  ${g.padEnd(13)} human ${c.human}, ai ${c.ai}`);
  }
  if (warnings.length) console.warn(`\n⚠ warnings:\n - ${warnings.join('\n - ')}`);
  if (errors.length) fail(errors);
  console.log('\n✓ verify passed. Final gate: read the passages yourself.');
}

main();
