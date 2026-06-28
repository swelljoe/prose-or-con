// Shared normalization. The game must test prose STYLE, not formatting artifacts,
// so human and AI text are normalized to the same surface form. We strip
// formatting and source/chat tells — never stylistic features.

export const MIN_WORDS = 120;
export const MAX_WORDS = 350;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/**
 * Pick a contiguous run of paragraphs. Prefer one reaching `target` words (so
 * human passages don't all cluster at the floor and become shorter than the AI
 * set — a length tell), falling back to the first run that clears `min`.
 */
export function selectPassage(
  paragraphs: string[],
  opts: { minWords?: number; maxWords?: number; targetWords?: number } = {},
): string | null {
  const min = opts.minWords ?? MIN_WORDS;
  const max = opts.maxWords ?? MAX_WORDS;
  const target = opts.targetWords ?? Math.min(max, 200);
  let fallback: string | null = null;
  for (let start = 0; start < paragraphs.length; start++) {
    const acc: string[] = [];
    let wc = 0;
    for (let i = start; i < paragraphs.length; i++) {
      const w = wordCount(paragraphs[i]!);
      if (acc.length > 0 && wc + w > max) break;
      acc.push(paragraphs[i]!);
      wc += w;
      if (wc >= target) return acc.join('\n\n');
      if (wc >= min && fallback === null) fallback = acc.join('\n\n');
    }
  }
  if (fallback) return fallback;
  const whole = paragraphs.join('\n\n');
  return wordCount(whole) >= min ? whole : null;
}

const CITATION = /\[\s*(?:\d+|citation needed|note \d+|[a-z])\s*\]/gi;
const URL = /\bhttps?:\/\/\S+/gi;

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s{0,3}>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*\d+\.\s+/gm, '') // numbered lists
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links → text
}

const CHAT_OPENERS =
  /^(sure[,!.]?|certainly[,!.]?|of course[,!.]?|absolutely[,!.]?|here(?:'s| is| are)\b|below is\b|i(?:'d| would) be happy to\b)[^\n]*\n+/i;
const CHAT_AI_SELF = /\bas an ai(?: language model)?\b[^.]*\.\s*/gi;
const CHAT_CLOSERS =
  /\n+(?:let me know if[^\n]*|i hope this[^\n]*|feel free to[^\n]*|would you like[^\n]*)\s*$/i;

function stripChatScaffolding(text: string): string {
  let t = text;
  // Remove up to two leading conversational opener lines.
  for (let i = 0; i < 2; i++) t = t.replace(CHAT_OPENERS, '');
  t = t.replace(CHAT_AI_SELF, '');
  t = t.replace(CHAT_CLOSERS, '');
  // Drop a leading bold/quoted title line the model sometimes adds.
  t = t.replace(/^["“][^"”\n]{0,80}["”]\s*\n+/, '');
  return t;
}

// Phrases/lines that would leak a source identity or genre artifact.
const SOURCE_TELLS = [
  /this article (?:was|is) (?:originally )?(?:re)?published (?:from|on|by)[^\n.]*\.?/gi,
  /\bthe conversation\b/gi,
  /\bpropublica\b/gi,
  /\bwikipedia\b/gi,
  /\bwikinews\b/gi,
  /\bproject gutenberg(?:-tm| literary archive foundation)?\b/gi,
  /^\s*(?:by |from )?[A-Z][a-z]+ [A-Z][a-z]+,?\s*(?:correspondent|reporter|staff writer)[^\n]*$/gm,
  /\[\s*edit\s*\]/gi,
  // Leading weekday dateline ("Friday, January 12, 2007") used by Wikinews.
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+[a-z]+\s+\d{1,2},?\s+\d{4}\.?\s*$/gim,
];

function stripSourceTells(text: string): string {
  let t = text;
  for (const re of SOURCE_TELLS) t = t.replace(re, '');
  return t;
}

// Native-script blocks used for foreign-name annotations (Greek, Cyrillic,
// Armenian, Hebrew, Arabic, Devanagari, Thai/Lao, Tibetan, Myanmar, Georgian,
// Khmer, Tifinagh, Kana, CJK, Hangul). A lead-sentence parenthetical with a run
// of these — e.g. "Kyōto (京都)" or "(from Greek χάρτης)" — or an unexpanded
// "Template:Lang-xx" placeholder marks the text as encyclopedic, a source tell.
const NATIVE =
  '\\u0370-\\u03FF\\u1F00-\\u1FFF\\u0400-\\u052F\\u0530-\\u058F\\u0590-\\u05FF\\u0600-\\u06FF' +
  '\\u0750-\\u077F\\u0900-\\u097F\\u0E00-\\u0EFF\\u0F00-\\u0FFF\\u1000-\\u109F' +
  '\\u10A0-\\u10FF\\u1780-\\u17FF\\u2D30-\\u2D7F\\u3040-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF';
// IPA letters/marks that betray a phonetic respelling (schwa, stress marks, etc.).
const IPA = 'ˈˌːɪɛɔəɒæʊʌɜɐʃʒθðŋ';
const FOREIGN_PAREN = new RegExp(
  `\\s*\\([^()]*(?:Template:[A-Za-z-]+|[${NATIVE}]{2,}|[${IPA}])[^()]*\\)`,
  'g',
);
const NATIVE_RUN = new RegExp(`[${NATIVE}]{2,}`, 'g');
// IPA pronunciation in slashes or brackets, e.g. "/ˈsiːləkænθ/" or "[liʒˈboɐ]".
const IPA_GUIDE = new RegExp(`\\s*[/\\[][^/\\[\\]\\n]*[${IPA}][^/\\[\\]\\n]*[/\\]](?:\\s*ⓘ)?`, 'g');

/**
 * Remove foreign-name / etymology / pronunciation annotations — a source tell for
 * encyclopedic text. Strips native-script runs (2+ chars, so lone symbols like the
 * µm or β-lactam science units survive), IPA respellings, and unexpanded
 * "Template:Lang-xx" placeholders. Latin transliterations are left as-is.
 */
export function stripForeignAnnotations(text: string): string {
  return text
    .replace(FOREIGN_PAREN, '')
    .replace(/\s*Template:[A-Za-z-]+/g, '')
    .replace(IPA_GUIDE, '')
    .replace(NATIVE_RUN, '')
    .replace(/\s*\(\s*(?:UK|US|U\.K\.|U\.S\.)\s*:?\s*\)/g, '') // "(UK:)" left after IPA strip
    .replace(/\(\s*[;,]+\s*/g, '(') // "(; X" left by an inner strip → "(X"
    .replace(/\s*[;,]+\s*\)/g, ')') // "X ,)" → "X)"
    .replace(/\(\s*\)/g, '') // empty parens left behind
    .replace(/ +([,.;:)])/g, '$1') // tidy space before punctuation
    .replace(/\(\s+/g, '(')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Join hard-wrapped lines within each paragraph (prose only — not poetry). */
function unwrapProse(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function cleanCommon(text: string): string {
  return normalizeWhitespace(text.replace(URL, ''));
}

export function clean(text: string, opts: { author: 'human' | 'ai'; poetry: boolean }): string {
  let t: string;
  if (opts.author === 'human') {
    t = stripMarkdown(stripSourceTells(text.replace(CITATION, '')));
  } else {
    t = stripSourceTells(stripMarkdown(stripChatScaffolding(text)));
  }
  t = stripForeignAnnotations(t);
  if (!opts.poetry) t = unwrapProse(t);
  return cleanCommon(t);
}
