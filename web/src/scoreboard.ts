// Scoreboard client. The backend is a Cloudflare Worker; both URL and Turnstile
// site key are injected at build time. When unset (e.g. local dev without a
// backend) the scoreboard UI is hidden and the game still works fully offline.

// Tolerate a misconfigured base URL: strip a trailing slash or an accidental
// /leaderboard|/score endpoint suffix so we don't build "/leaderboard/leaderboard".
const SCOREBOARD_URL = (import.meta.env.VITE_SCOREBOARD_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/(?:leaderboard|score)$/, '');
export const TURNSTILE_SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY ?? '';

export function scoreboardEnabled(): boolean {
  return SCOREBOARD_URL.length > 0;
}

export interface LeaderRow {
  name: string;
  correct: number;
  total: number;
  created_at: number;
}

export async function fetchLeaderboard(
  window: 'all' | 'today' = 'all',
): Promise<LeaderRow[]> {
  const res = await fetch(`${SCOREBOARD_URL}/leaderboard?window=${window}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  const data = (await res.json()) as { rows: LeaderRow[] };
  return data.rows ?? [];
}

export async function submitScore(input: {
  name: string;
  correct: number;
  total: number;
  turnstileToken: string;
  rounds: [string, number][]; // [item id, 1 correct | 0 wrong] per round
}): Promise<void> {
  const res = await fetch(`${SCOREBOARD_URL}/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`submit ${res.status}: ${msg}`);
  }
}
