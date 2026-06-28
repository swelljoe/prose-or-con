import { writeCache } from './cache';
import { fetchWikipedia, fetchWikinews, fetchWikivoyage } from './fetchers/mediawiki';
import { fetchGutenberg } from './fetchers/gutenberg';
import { fetchNews } from './fetchers/news';
import type { Genre, RawItem } from './types';

// Human targets per genre (~200 total). Mirror corpus/build/data.ts AI_TARGETS.
const TARGETS = {
  encyclopedic: 40,
  news: 35,
  essay: 35,
  travel: 25,
  fiction: 40,
  poetry: 25,
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
