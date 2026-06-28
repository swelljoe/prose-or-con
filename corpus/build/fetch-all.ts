import { writeCache } from './cache';
import { fetchWikipedia, fetchWikinews, fetchWikivoyage } from './fetchers/mediawiki';
import { fetchGutenberg } from './fetchers/gutenberg';
import { fetchNews } from './fetchers/news';
import type { Genre, RawItem } from './types';

// Per-genre fetch targets — how many candidates to pull THIS run. Meaning differs
// by source when growing an existing corpus (build with MERGE=1 dedups by content):
//   - Fixed-list sources (Wikipedia, Wikivoyage) re-fetch their existing items
//     (which dedupe away), so the target must be the FULL desired count.
//   - Random sources (Wikinews, Gutenberg, The Conversation/ProPublica) draw a
//     fresh batch each run, so the target is roughly the DELTA you want to add.
// Current values bring the human pool level with the AI pool (~393). For a fresh
// build from empty, set these to the final per-genre counts (mirror AI_TARGETS).
const TARGETS = {
  encyclopedic: 125, // Wikipedia, fixed list → full count (existing ~79 + ~45 new titles)
  news: 40, // Wikinews, random → delta
  essay: 40, // The Conversation/ProPublica, random → delta
  travel: 82, // Wikivoyage, fixed list → full count (existing ~50 + ~32 new titles)
  fiction: 42, // Gutenberg, random → delta
  poetry: 30, // Gutenberg, random → delta
} as const;

async function main(): Promise<void> {
  const all: RawItem[] = [];

  console.log(`Wikipedia (encyclopedic, ${TARGETS.encyclopedic})…`);
  all.push(...(await fetchWikipedia(TARGETS.encyclopedic)));

  console.log(`Wikinews (news, ${TARGETS.news})…`);
  all.push(...(await fetchWikinews(TARGETS.news)));

  console.log(`Wikivoyage (travel, ${TARGETS.travel})…`);
  all.push(...(await fetchWikivoyage(TARGETS.travel)));

  console.log(`Gutenberg (fiction, ${TARGETS.fiction})…`);
  all.push(...(await fetchGutenberg('fiction', TARGETS.fiction)));

  console.log(`Gutenberg (poetry, ${TARGETS.poetry})…`);
  all.push(...(await fetchGutenberg('poetry', TARGETS.poetry)));

  console.log(`The Conversation / ProPublica (essay, ${TARGETS.essay})…`);
  const news = await fetchNews(TARGETS.essay);
  all.push(...news);
  if (news.length < TARGETS.essay) {
    const need = TARGETS.essay - news.length;
    console.log(`  backfilling ${need} essays from public-domain sources…`);
    all.push(...(await fetchGutenberg('essay', need)));
  }

  writeCache('human', all);

  const counts: Record<string, number> = {};
  for (const it of all) counts[it.genre] = (counts[it.genre] ?? 0) + 1;
  console.log(`\nFetched ${all.length} human passages:`);
  for (const g of Object.keys(TARGETS) as Genre[]) {
    console.log(`  ${g.padEnd(13)} ${counts[g] ?? 0} / ${TARGETS[g]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
