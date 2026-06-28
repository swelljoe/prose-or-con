# Prose or Con — Scoreboard Worker

The only backend for the game: a Cloudflare Worker storing scores in D1, rate
limited via KV, and gated by Turnstile. Designed so abuse cannot create overage
bills — the Cloudflare free plan has hard request/D1/KV caps, and the Worker
rejects junk before it touches the database.

## Setup

```sh
npm install                       # installs wrangler + types (devDeps)
npx wrangler login

# D1: create the database, paste the returned database_id into wrangler.toml.
npx wrangler d1 create prose-or-con
npx wrangler d1 execute prose-or-con --file=schema.sql            # local
npx wrangler d1 execute prose-or-con --remote --file=schema.sql   # production

# KV: create the rate-limit namespace, paste the returned id into wrangler.toml.
npx wrangler kv namespace create RL

# Turnstile secret (a secret, never a plaintext var):
npx wrangler secret put TURNSTILE_SECRET

# Set ALLOWED_ORIGIN in wrangler.toml [vars] to your GitHub Pages origin,
# e.g. https://USERNAME.github.io

npm run deploy
```

Use `npm run dev` for local development.

## Turnstile

Create a Turnstile site at https://dash.cloudflare.com (Turnstile section).
It gives you two keys:

- **Site key** → frontend build env `VITE_TURNSTILE_SITEKEY`. Public.
- **Secret key** → `wrangler secret put TURNSTILE_SECRET`. Never commit it.

The Worker verifies every `/score` submission server-side against Turnstile; if
`TURNSTILE_SECRET` is unset the Worker returns 500 rather than accepting traffic.

## API

- `POST /score` — body `{ name, correct, total, turnstileToken, rounds }`.
  Validates strictly (name 1..24 sane chars; `0 <= correct <= total <= 50`),
  checks the rate limit (10/min/IP), verifies Turnstile, then writes the score
  and the per-item stats in one atomic D1 batch. Returns `{ ok: true }`.
  `rounds` is an array of `[itemId, 0|1]` pairs (1 = guessed correctly). It is
  optional, but if present it must have `total` entries, all ids matching
  `^[0-9a-f]{12}$`, no duplicates, and exactly `correct` ones — otherwise the
  whole submission is rejected, so the stats can't be skewed apart from the
  Turnstile-gated score.
- `GET /leaderboard?window=all|today` — top 20 by `correct DESC, total ASC`.
  Returns `{ rows: [{ name, correct, total, created_at }] }`.

CORS is locked to `ALLOWED_ORIGIN`; the Worker echoes the request Origin only
when it exactly matches.

## Per-item stats

Every `/score` submission also increments running per-passage counters in the
`item_stats` table (`id`, `shown`, `correct`). No per-player data — just totals.
The point: find which AI passages fool people and which human passages get
wrongly accused. The Worker doesn't know an item's true author; it only counts
`correct`, which the client computes. To bucket by author/model/source you join
the item `id` against `web/public/sources.json` **offline**:

```sh
# Dump the table (newest data lives on --remote, the deployed DB):
npx wrangler d1 execute prose-or-con --remote --json \
  --command "SELECT id, shown, correct FROM item_stats WHERE shown > 0" \
  > /tmp/item_stats.json
```

Then join locally. `sources.json` is an array of attribution entries; map each
`id` to its `kind` (`human`/`ai`), `source`, and `model`, and rank by accuracy:

```js
const stats = require('/tmp/item_stats.json')[0].results;
const src = require('./web/public/sources.json'); // index by id
const byId = Object.fromEntries(src.map((s) => [s.id, s]));
const scored = stats
  .filter((r) => r.shown >= 5)                       // ignore tiny samples
  .map((r) => ({ ...r, ...byId[r.id], acc: r.correct / r.shown }));

// Most human-seeming AI: AI items players got WRONG most often (low acc).
scored.filter((s) => s.kind === 'ai').sort((a, b) => a.acc - b.acc).slice(0, 10);
// Most AI-seeming human: human items wrongly flagged as AI (low acc).
scored.filter((s) => s.kind === 'human').sort((a, b) => a.acc - b.acc).slice(0, 10);
```

Each `sources.json` entry carries its item `id` (added in
`corpus/build/build-corpus.ts`), so the join is a direct id lookup. Item ids are
content hashes, so a corpus rebuild changes them — analyse against the
`sources.json` committed with the corpus that produced the data.

## Headless / VM auth

No browser on the box? Skip `wrangler login` (its OAuth callback hits
`localhost:8976`, which fails over SSH). Create a scoped API token instead —
**Workers Scripts: Edit**, **Workers KV Storage: Edit**, **D1: Edit**,
**Account Settings: Read** — and export it:

```sh
export CLOUDFLARE_API_TOKEN=...      # keep in /home/joe/secrets, never commit
export CLOUDFLARE_ACCOUNT_ID=...     # only if the token sees multiple accounts
```

All `wrangler` commands then run non-interactively.
