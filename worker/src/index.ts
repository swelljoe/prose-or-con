export interface Env {
  DB: D1Database;
  RL: KVNamespace;
  TURNSTILE_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const MAX_ROUNDS = 50;
const RL_LIMIT = 10;
const NAME_MAX = 24;

// Per-round outcome: [item id, 1 if guessed correctly else 0].
type RoundStat = [string, number];

interface ScoreBody {
  name: string;
  correct: number;
  total: number;
  turnstileToken: string;
  rounds?: RoundStat[];
}

const ITEM_ID = /^[0-9a-f]{12}$/;

/**
 * Validate the optional per-round outcomes against the already-checked score.
 * Returns the cleaned pairs, or null if anything is malformed (so a tampered
 * payload is rejected rather than polluting the stats). Absent rounds => [].
 */
function parseRounds(raw: unknown, correct: number, total: number): RoundStat[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length !== total) return null;
  const seen = new Set<string>();
  let okSum = 0;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [id, ok] = entry as [unknown, unknown];
    if (typeof id !== "string" || !ITEM_ID.test(id)) return null;
    if (ok !== 0 && ok !== 1) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    okSum += ok;
  }
  if (okSum !== correct) return null;
  return raw as RoundStat[];
}

interface LeaderboardRow {
  name: string;
  correct: number;
  total: number;
  created_at: number;
}

interface TurnstileResult {
  success: boolean;
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  const origin = request.headers.get("Origin");
  if (origin !== null && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  data: unknown,
  status: number,
  env: Env,
  request: Request,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(env, request),
    },
  });
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Drop control characters, then keep only the allowed charset.
  const stripped = raw
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^A-Za-z0-9 \-_.!]/g, "")
    .trim();
  if (stripped.length < 1 || stripped.length > NAME_MAX) return null;
  return stripped;
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

async function verifyTurnstile(
  env: Env,
  token: string,
  ip: string,
): Promise<boolean> {
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  if (ip !== "unknown") form.set("remoteip", ip);

  const resp = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form },
  );
  if (!resp.ok) return false;
  const result = (await resp.json()) as TurnstileResult;
  return result.success === true;
}

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${bucket}`;
  const current = await env.RL.get(key);
  const count = current === null ? 0 : Number.parseInt(current, 10);
  if (Number.isFinite(count) && count >= RL_LIMIT) return true;
  const next = Number.isFinite(count) ? count + 1 : 1;
  await env.RL.put(key, String(next), { expirationTtl: 120 });
  return false;
}

async function handleScore(env: Env, request: Request): Promise<Response> {
  if (env.TURNSTILE_SECRET === undefined || env.TURNSTILE_SECRET === "") {
    return json({ error: "server error" }, 500, env, request);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400, env, request);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "invalid body" }, 400, env, request);
  }
  const b = body as Partial<ScoreBody>;

  const name = sanitizeName(b.name);
  if (name === null) {
    return json({ error: "invalid name" }, 400, env, request);
  }

  const { correct, total } = b;
  if (!isInt(correct) || !isInt(total)) {
    return json({ error: "invalid score" }, 400, env, request);
  }
  if (
    correct < 0 ||
    total < 0 ||
    correct > total ||
    total > MAX_ROUNDS
  ) {
    return json({ error: "invalid score" }, 400, env, request);
  }

  const rounds = parseRounds(b.rounds, correct, total);
  if (rounds === null) {
    return json({ error: "invalid rounds" }, 400, env, request);
  }

  if (typeof b.turnstileToken !== "string" || b.turnstileToken === "") {
    return json({ error: "failed bot check" }, 403, env, request);
  }

  const ip = clientIp(request);

  if (await rateLimited(env, ip)) {
    return json({ error: "slow down" }, 429, env, request);
  }

  const ok = await verifyTurnstile(env, b.turnstileToken, ip);
  if (!ok) {
    return json({ error: "failed bot check" }, 403, env, request);
  }

  const ops: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT INTO scores (id, name, correct, total, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), name, correct, total, Date.now()),
  ];
  const upsert = env.DB.prepare(
    "INSERT INTO item_stats (id, shown, correct) VALUES (?, 1, ?) " +
      "ON CONFLICT(id) DO UPDATE SET shown = shown + 1, correct = correct + excluded.correct",
  );
  for (const [id, ok] of rounds) ops.push(upsert.bind(id, ok));
  await env.DB.batch(ops);

  return json({ ok: true }, 200, env, request);
}

async function handleLeaderboard(
  env: Env,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const window = url.searchParams.get("window") ?? "all";

  let stmt: D1PreparedStatement;
  if (window === "today") {
    const now = new Date(Date.now());
    const startOfDay = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    stmt = env.DB.prepare(
      "SELECT name, correct, total, created_at FROM scores WHERE created_at >= ? ORDER BY correct DESC, total ASC LIMIT 20",
    ).bind(startOfDay);
  } else {
    stmt = env.DB.prepare(
      "SELECT name, correct, total, created_at FROM scores ORDER BY correct DESC, total ASC LIMIT 20",
    );
  }

  const result = await stmt.all<LeaderboardRow>();
  return json({ rows: result.results }, 200, env, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(env, request) });
      }

      if (request.method === "POST" && url.pathname === "/score") {
        return await handleScore(env, request);
      }

      if (request.method === "GET" && url.pathname === "/leaderboard") {
        return await handleLeaderboard(env, request);
      }

      return json({ error: "not found" }, 404, env, request);
    } catch {
      return json({ error: "server error" }, 500, env, request);
    }
  },
};
