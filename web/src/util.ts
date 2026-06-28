import type { Answer, PackedItem } from './types';

/** Decode a UTF-8 base64 string (the packed answer). */
export function b64decodeUtf8(b: string): string {
  const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function unpackAnswer(item: PackedItem): Answer {
  return JSON.parse(b64decodeUtf8(item.secret)) as Answer;
}

/** Fisher–Yates shuffle (copy). */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Tagged {
  it: PackedItem;
  author: string;
}

/** Pick `n` items from a pool, spread as evenly as possible across genres. */
function pickSpread(pool: Tagged[], n: number): Tagged[] {
  const byGenre = new Map<string, Tagged[]>();
  for (const d of shuffle(pool)) {
    const g = byGenre.get(d.it.genre) ?? [];
    g.push(d);
    byGenre.set(d.it.genre, g);
  }
  const buckets = shuffle([...byGenre.values()]);
  const out: Tagged[] = [];
  let i = 0;
  while (out.length < n && buckets.some((b) => b.length > 0)) {
    const next = buckets[i % buckets.length]!.pop();
    if (next) out.push(next);
    i++;
  }
  return out;
}

/**
 * Pick `count` passages for a game. The human/AI split is roughly balanced but
 * deliberately fuzzy — a random count/2 ± ~10% (e.g. 4–6 humans out of 10) — so
 * neither "always guess AI" (the pool is mostly AI) nor end-of-game counting
 * ("we must be due for an AI one") pays off. Spread across genres within each side.
 */
export function pickRounds(items: readonly PackedItem[], count: number): PackedItem[] {
  const tagged: Tagged[] = items.map((it) => ({ it, author: unpackAnswer(it).author }));
  const human = tagged.filter((d) => d.author === 'human');
  const ai = tagged.filter((d) => d.author === 'ai');

  const skew = Math.max(1, Math.round(count * 0.1));
  const jitter = Math.floor(Math.random() * (2 * skew + 1)) - skew; // [-skew, +skew]
  const wantHuman = Math.min(Math.max(Math.round(count / 2) + jitter, 1), count - 1);

  const nHuman = Math.min(wantHuman, human.length);
  const nAi = Math.min(count - nHuman, ai.length);
  const picked = [...pickSpread(human, nHuman), ...pickSpread(ai, nAi)];

  // Top up from whatever's left if one side was too small.
  if (picked.length < count) {
    const used = new Set(picked.map((d) => d.it.id));
    const rest = shuffle(tagged.filter((d) => !used.has(d.it.id)));
    picked.push(...rest.slice(0, count - picked.length));
  }
  return shuffle(picked).map((d) => d.it);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
