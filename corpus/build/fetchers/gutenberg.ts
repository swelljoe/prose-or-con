import { getText } from '../http';
import { paragraphsOf, selectPassage, wordCount } from '../clean';
import type { RawItem } from '../types';
import { selectObscureIds } from './gutenberg-catalog';

// Excerpts per book. With a huge obscure catalog to draw from, 1 per fiction work
// maximizes author variety; poetry/essay collections hold many independent pieces.
const PASSAGES: Record<'fiction' | 'poetry' | 'essay', number> = {
  fiction: 1,
  poetry: 2,
  essay: 3,
};

interface Book {
  title: string;
  author?: string;
  paras: string[];
}

function headerField(text: string, field: string): string | undefined {
  const m = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'im'));
  return m?.[1]?.replace(/\s+/g, ' ').trim();
}

function stripBoilerplate(text: string): string {
  const startIdx = text.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i);
  // Handle both the *** END *** marker and the older bare "End of ... Project Gutenberg" line.
  const endIdx = text.search(
    /(?:\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG|\n\s*End of (?:the |this )?Project Gutenberg)/i,
  );
  let body = text;
  if (endIdx > 0) body = body.slice(0, endIdx);
  if (startIdx >= 0) {
    const after = body.indexOf('\n', startIdx);
    body = body.slice(after >= 0 ? after : startIdx);
  }
  return body;
}

// Editorial/metadata paragraphs (front- and back-matter) that aren't the work itself.
const EDITORIAL =
  /\b(produced by|transcriber|transcribed|release date|etext|gutenberg|proofread|david widger|public domain|this e-?book|\[illustration\]|contents)\b/i;

async function fetchBook(id: number): Promise<Book> {
  const full = await getText(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`);
  const header = full.slice(0, full.search(/\*\*\*\s*START OF/i) + 1 || 2000);
  const title = headerField(header, 'Title') ?? `Project Gutenberg #${id}`;
  const author = headerField(header, 'Author');
  const paras = paragraphsOf(stripBoilerplate(full)).filter(
    (p) => wordCount(p) >= 6 && !EDITORIAL.test(p),
  );
  return { title, author, paras };
}

/** Reject tables of contents / indexes: many lines ending in a page number. */
function looksLikeIndex(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const tocish = lines.filter(
    (l) => /[.—–-]\s*\d{1,4}$/.test(l) || /^\d{1,4}$/.test(l) || /^[A-Z][A-Z ’'-]{6,}$/.test(l),
  ).length;
  return tocish / lines.length > 0.3;
}

/** Take up to `count` non-overlapping passages spread across the book body. */
function extractPassages(paras: string[], count: number): string[] {
  if (paras.length < 4) return [];
  const out: string[] = [];
  const used = new Set<number>();
  const starts = Array.from({ length: count }, (_, i) =>
    Math.floor(paras.length * (0.15 + (0.7 * i) / Math.max(1, count))),
  );
  for (const start of starts) {
    // Walk forward from the spread point to the next unused window.
    for (let s = start; s < paras.length; s++) {
      if (used.has(s)) continue;
      const passage = selectPassage(paras.slice(s));
      if (!passage) break;
      const len = paragraphsOf(passage).length;
      for (let k = s; k < s + len; k++) used.add(k);
      if (!looksLikeIndex(passage)) out.push(passage);
      break;
    }
  }
  return out;
}

export async function fetchGutenberg(
  genre: 'fiction' | 'poetry' | 'essay',
  limit: number,
): Promise<RawItem[]> {
  const passages = PASSAGES[genre];
  // Draw extra candidates: some books fail extraction (too short, all dialogue, etc.).
  const ids = await selectObscureIds(genre, limit * 2);
  const items: RawItem[] = [];
  for (const id of ids) {
    if (items.length >= limit) break;
    try {
      const book = await fetchBook(id);
      const extracted = extractPassages(book.paras, passages);
      for (const text of extracted) {
        if (items.length >= limit) break;
        items.push({
          author: 'human',
          genre: genre === 'essay' ? 'essay' : genre,
          text,
          publishedBefore: 'public domain',
          meta: {
            source: 'Project Gutenberg',
            title: book.title,
            author: book.author,
            url: `https://www.gutenberg.org/ebooks/${id}`,
            license: 'Public Domain',
            licenseUrl: 'https://www.gutenberg.org/policy/license.html',
          },
        });
      }
    } catch (err) {
      console.warn(`  gutenberg #${id} skipped: ${(err as Error).message}`);
    }
  }
  return items;
}
