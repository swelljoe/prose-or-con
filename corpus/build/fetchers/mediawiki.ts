import * as cheerio from 'cheerio';
import { getJson, sleep } from '../http';
import { paragraphsOf, selectPassage } from '../clean';
import type { RawItem } from '../types';
import {
  WIKINEWS_TOPIC_CATEGORIES,
  WIKIPEDIA_TITLES,
  WIKIVOYAGE_TITLES,
} from '../data';

const WP = 'https://en.wikipedia.org/w/api.php';
const WN = 'https://en.wikinews.org/w/api.php';
const WV = 'https://en.wikivoyage.org/w/api.php';
const BEFORE = '2021-12-31T23:59:59Z';

interface RevQuery {
  query?: { pages?: { missing?: boolean; revisions?: { revid: number; timestamp: string }[] }[] };
}
interface ParseQuery {
  parse?: { text: string };
}
interface CatQuery {
  query?: { categorymembers?: { title: string; ns: number; timestamp?: string }[] };
}

async function revisionBefore(
  api: string,
  title: string,
): Promise<{ revid: number; timestamp: string } | null> {
  const url =
    `${api}?action=query&format=json&formatversion=2&prop=revisions` +
    `&titles=${encodeURIComponent(title)}&rvlimit=1&rvprop=ids|timestamp` +
    `&rvstart=${encodeURIComponent(BEFORE)}&rvdir=older`;
  const data = await getJson<RevQuery>(url);
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.revisions?.[0]) return null;
  return page.revisions[0];
}

async function parseHtml(api: string, target: { oldid: number } | { page: string }): Promise<string> {
  const sel =
    'oldid' in target
      ? `oldid=${target.oldid}`
      : `page=${encodeURIComponent(target.page)}`;
  const url = `${api}?action=parse&format=json&formatversion=2&prop=text&${sel}`;
  const data = await getJson<ParseQuery>(url);
  if (!data.parse?.text) throw new Error('no parse text');
  return data.parse.text;
}

function htmlToParagraphs(html: string): string[] {
  const $ = cheerio.load(html);
  $(
    '.mw-parser-output sup.reference, .mw-editsection, style, table, .thumb, ' +
      '.infobox, .navbox, .hatnote, .mw-empty-elt, .mbox-small, .reflist, ' +
      'figure, .gallery, ol.references, .shortdescription, .ambox',
  ).remove();
  const out: string[] = [];
  $('.mw-parser-output > p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 0) out.push(t);
  });
  return out;
}

export async function fetchWikipedia(limit: number): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (const title of WIKIPEDIA_TITLES) {
    if (items.length >= limit) break;
    await sleep(200);
    try {
      const rev = await revisionBefore(WP, title);
      if (!rev) continue;
      const html = await parseHtml(WP, { oldid: rev.revid });
      const passage = selectPassage(htmlToParagraphs(html));
      if (!passage) continue;
      items.push({
        author: 'human',
        genre: 'encyclopedic',
        text: passage,
        publishedBefore: rev.timestamp,
        meta: {
          source: 'Wikipedia',
          title,
          url: `https://en.wikipedia.org/w/index.php?oldid=${rev.revid}`,
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        },
      });
    } catch (err) {
      console.warn(`  wikipedia "${title}" skipped: ${(err as Error).message}`);
    }
  }
  return items;
}

export async function fetchWikivoyage(limit: number): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (const title of WIKIVOYAGE_TITLES) {
    if (items.length >= limit) break;
    await sleep(250); // be polite to the Wikimedia API
    try {
      const rev = await revisionBefore(WV, title);
      if (!rev) continue;
      const html = await parseHtml(WV, { oldid: rev.revid });
      const passage = selectPassage(htmlToParagraphs(html));
      if (!passage) continue;
      items.push({
        author: 'human',
        genre: 'travel',
        text: passage,
        publishedBefore: rev.timestamp,
        meta: {
          source: 'Wikivoyage',
          title,
          url: `https://en.wikivoyage.org/w/index.php?oldid=${rev.revid}`,
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        },
      });
    } catch (err) {
      console.warn(`  wikivoyage "${title}" skipped: ${(err as Error).message}`);
    }
  }
  return items;
}

async function categoryMembers(category: string, limit: number): Promise<string[]> {
  const url =
    `${WN}?action=query&format=json&formatversion=2&list=categorymembers` +
    `&cmtitle=${encodeURIComponent('Category:' + category)}&cmlimit=${limit}&cmnamespace=0`;
  const data = await getJson<CatQuery>(url);
  return (data.query?.categorymembers ?? []).map((m) => m.title);
}

interface FirstRevQuery {
  query?: { pages?: { revisions?: { timestamp: string }[] }[] };
}

/** First-revision (publication) date for one article. Single-page only per API. */
async function firstRevision(title: string): Promise<string | null> {
  const url =
    `${WN}?action=query&format=json&formatversion=2&prop=revisions&rvdir=newer` +
    `&rvlimit=1&rvprop=timestamp&titles=${encodeURIComponent(title)}`;
  const data = await getJson<FirstRevQuery>(url);
  return data.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? null;
}

function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function fetchWikinews(limit: number): Promise<RawItem[]> {
  // Category-add timestamps are unreliable (bot recategorization), so we sample
  // candidates and check each article's first-revision date individually.
  const candidates = new Set<string>();
  for (const cat of WIKINEWS_TOPIC_CATEGORIES) {
    try {
      for (const t of await categoryMembers(cat, 100)) candidates.add(t);
    } catch {
      /* skip a failed category */
    }
  }

  const items: RawItem[] = [];
  for (const title of shuffleInPlace([...candidates])) {
    if (items.length >= limit) break;
    await sleep(150);
    try {
      const ts = await firstRevision(title);
      if (!ts || new Date(ts).getUTCFullYear() >= 2022) continue;
      const passage = selectPassage(htmlToParagraphs(await parseHtml(WN, { page: title })));
      if (!passage || paragraphsOf(passage).length < 2) continue;
      items.push({
        author: 'human',
        genre: 'news',
        text: passage,
        publishedBefore: ts,
        meta: {
          source: 'Wikinews',
          title,
          url: `https://en.wikinews.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          license: 'CC BY 2.5',
          licenseUrl: 'https://creativecommons.org/licenses/by/2.5/',
        },
      });
    } catch (err) {
      console.warn(`  wikinews "${title}" skipped: ${(err as Error).message}`);
    }
  }
  return items;
}
