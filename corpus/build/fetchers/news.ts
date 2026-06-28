import * as cheerio from 'cheerio';
import { getText, sleep } from '../http';
import { selectPassage } from '../clean';
import type { RawItem } from '../types';
import { NEWS_SOURCES } from '../data';

// Lines that are disclosures, promos, or boilerplate rather than article prose.
const JUNK =
  /(read more|sign up|newsletter|disclosure|republish|cookie|subscribe|follow us|getty images|associated press|does not work for|receives funding|do not have any relevant|this article (is|was produced)|this story was|produced in partnership|co-published with|local reporting network|leer en español|sign up for|get our|^by\b)/i;

/** Content-based English check — robust where the html lang attribute lies. */
function looksEnglish(text: string): boolean {
  return (text.match(/\bthe\b/gi) ?? []).length >= 5;
}

interface Candidate {
  url: string;
  source: 'The Conversation' | 'ProPublica';
  license: string;
  licenseUrl: string;
}

const TC = {
  source: 'The Conversation' as const,
  license: 'CC BY-ND 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nd/4.0/',
};
const PP = {
  source: 'ProPublica' as const,
  license: 'CC BY-NC-ND 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// --- URL discovery from each publisher's archive sitemaps (pre-2022) ---

async function tcCandidates(): Promise<Candidate[]> {
  const regions = ['us', 'uk'];
  const years = [2021, 2020];
  const out = new Set<string>();
  for (const r of regions) {
    for (const y of years) {
      try {
        const xml = await getText(`https://theconversation.com/${r}/sitemap_archive_${y}.xml`);
        for (const u of locs(xml)) {
          if (/^https:\/\/theconversation\.com\/[a-z0-9-]+-\d+$/.test(u)) out.add(u);
        }
      } catch {
        /* skip a missing region/year */
      }
      await sleep(300);
      if (out.size > 3000) break;
    }
  }
  return [...out].map((url) => ({ url, ...TC }));
}

async function ppCandidates(): Promise<Candidate[]> {
  // Sample days spread across 2018–2021; each day-sitemap lists that day's stories.
  const dates: [number, number, number][] = [
    [2021, 3, 4], [2021, 6, 15], [2021, 9, 21], [2021, 11, 9], [2020, 2, 11],
    [2020, 7, 8], [2020, 10, 27], [2019, 5, 14], [2019, 10, 2], [2019, 12, 3],
    [2018, 4, 10], [2018, 8, 23],
  ];
  const out = new Set<string>();
  for (const [y, m, d] of dates) {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    try {
      const xml = await getText(`https://www.propublica.org/sitemap.xml?yyyy=${y}&mm=${mm}&dd=${dd}`);
      for (const u of locs(xml)) if (/propublica\.org\/article\//.test(u)) out.add(u);
    } catch {
      /* skip a missing day */
    }
    await sleep(300);
  }
  return [...out].map((url) => ({ url, ...PP }));
}

// --- Article extraction (JSON-LD first, meta-tag fallbacks) ---

interface LdNode {
  '@type'?: string | string[];
  '@id'?: string;
  '@graph'?: LdNode[];
  headline?: string;
  datePublished?: string;
  name?: string;
  author?: unknown;
}

function jsonLd(html: string): LdNode[] {
  const out: LdNode[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const v = JSON.parse(m[1]!) as LdNode | LdNode[];
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    } catch {
      /* ignore malformed ld+json */
    }
  }
  return out;
}

/** All nodes, with @graph flattened — needed to dereference author @id links. */
function flatten(ld: LdNode[]): LdNode[] {
  const flat: LdNode[] = [];
  for (const n of ld) flat.push(...(n['@graph'] ?? [n]));
  return flat;
}

function articleNode(flat: LdNode[]): LdNode | undefined {
  return flat.find((n) => {
    const t = n['@type'];
    return t && (Array.isArray(t) ? t : [t]).some((x) => /Article|NewsArticle|Report/i.test(x));
  });
}

function authorNames(node: LdNode | undefined, flat: LdNode[]): string | undefined {
  const a = node?.author;
  if (!a) return undefined;
  const arr = Array.isArray(a) ? a : [a];
  const names = arr
    .map((x): string | undefined => {
      if (typeof x === 'string') return x;
      const o = x as { name?: string; '@id'?: string };
      if (o.name) return o.name;
      // Author given by reference — resolve the @id against the graph.
      if (o['@id']) return flat.find((n) => n['@id'] === o['@id'])?.name;
      return undefined;
    })
    .filter((n): n is string => Boolean(n));
  return names.length ? [...new Set(names)].join(', ') : undefined;
}

interface Extracted {
  title?: string;
  author?: string;
  date?: string;
  lang?: string;
  paragraphs: string[];
}

function extractArticle(html: string): Extracted {
  const $ = cheerio.load(html);
  const flat = flatten(jsonLd(html));
  const node = articleNode(flat);
  const lang =
    $('html').attr('lang') ?? $('meta[property="og:locale"]').attr('content') ?? undefined;

  const metaAuthors = $('meta[name="author"]')
    .map((_, e) => $(e).attr('content'))
    .get()
    .filter(Boolean) as string[];
  const author =
    authorNames(node, flat) ??
    (metaAuthors.length
      ? [...new Set(metaAuthors)].join(', ')
      : $('[rel="author"]').first().text().trim() || undefined);

  const date =
    node?.datePublished ??
    $('[itemprop="datePublished"]').attr('datetime') ??
    $('meta[property="article:published_time"]').attr('content') ??
    $('time[datetime]').first().attr('datetime');

  const title =
    node?.headline ??
    $('meta[property="og:title"]').attr('content') ??
    $('title').first().text();

  const containers = [
    '.content-body',
    '.article-body',
    'article [itemprop="articleBody"]',
    'div.story-body',
    'article',
    'main',
  ];
  let paragraphs: string[] = [];
  for (const sel of containers) {
    const ps = $(`${sel} p`)
      .map((_, e) => $(e).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((t) => t.length >= 40 && !JUNK.test(t));
    if (ps.length >= 3) {
      paragraphs = ps;
      break;
    }
  }
  return { title, author, date, lang, paragraphs };
}

async function fetchNewsItem(src: Candidate): Promise<RawItem | null> {
  const { title, author, date, lang, paragraphs } = extractArticle(await getText(src.url));
  // English only — The Conversation's regional archives include other languages.
  if (lang && !/^en/i.test(lang)) return null;
  // ND sources require a byline on reveal; skip anything we can't attribute.
  if (!author) return null;
  // Safety: keep only pre-2022 (the URL discovery already targets old archives).
  if (date && new Date(date).getUTCFullYear() >= 2022) return null;
  const passage = selectPassage(paragraphs); // contiguous, verbatim — ND-safe
  if (!passage || !looksEnglish(passage)) return null;
  return {
    author: 'human',
    genre: 'essay',
    text: passage,
    publishedBefore: date ?? src.url,
    meta: {
      source: src.source,
      title: title?.replace(/\s*[|–—-]\s*(The Conversation|ProPublica).*$/i, '').trim(),
      author,
      url: src.url,
      license: src.license,
      licenseUrl: src.licenseUrl,
      nd: true,
    },
  };
}

export async function fetchNews(limit: number): Promise<RawItem[]> {
  const ppCap = Math.round(limit * 0.4); // aim for a ProPublica/Conversation mix
  const manual: Candidate[] = NEWS_SOURCES.map((s) => ({
    url: s.url,
    source: s.source,
    license: s.license,
    licenseUrl: s.licenseUrl,
  }));
  const pp = shuffle(await ppCandidates());
  const tc = shuffle(await tcCandidates());
  const ordered = [...shuffle(manual), ...pp, ...tc];

  const items: RawItem[] = [];
  let ppCount = 0;
  for (const src of ordered) {
    if (items.length >= limit) break;
    if (src.source === 'ProPublica' && ppCount >= ppCap) continue;
    await sleep(250);
    try {
      const item = await fetchNewsItem(src);
      if (item) {
        items.push(item);
        if (src.source === 'ProPublica') ppCount++;
      }
    } catch (err) {
      console.warn(`  news ${src.url} skipped: ${(err as Error).message}`);
    }
  }
  if (items.length < limit) {
    console.warn(`  news yielded ${items.length}/${limit}; essay shortfall backfills from public domain.`);
  }
  return items;
}
