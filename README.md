# Prose or Con?

Can you detect AI written prose?

## How it works

```
web/      Vite + vanilla TS game → GitHub Pages (static, offline-capable)
worker/   Cloudflare Worker + D1 scoreboard (Turnstile + per-IP rate limit)
corpus/   Data pipeline: fetch human text, generate AI text, normalize, verify
```

The game reads `web/public/corpus.json` (passages, answers packed/base64) and
`web/public/sources.json` (full attribution). Both are **built artifacts, committed** to the
repo, so CI needs no API keys.

`corpus.json` is the source of truth but is **not served as one file**. At build time a Vite
plugin (`web/scripts/split-corpus.ts`) splits it into `corpus/index.json` (id + genre + packed
author only — the selection index, ~8 KB gzipped) and one `corpus/items/<id>.json` (`{text, meta}`)
per passage. The game fetches the index once, then only the ~10 item files it plays — so a session
downloads ~14 KB instead of the whole ~475 KB corpus, and the index barely grows as the corpus
does. The split is gitignored and regenerated on every build; the monolith is dropped from `dist`.

### Design principle: test style, not artifacts

Human and AI passages are normalized to the same surface form (citations, headings, markdown,
URLs, chat scaffolding, datelines all stripped from both), genres are count-matched, and lengths
share a band — so the only signal is prose style. See `corpus/build/clean.ts` and
`corpus/build/verify-corpus.ts`.

## Develop

```bash
npm install
npm run dev            # play locally at the printed URL
npm -w web run build   # production build → web/dist
```

The game runs fully without a backend; the leaderboard simply hides itself if not configured.

## Rebuild the corpus (needs network + API keys)

Keys are read from `/home/joe/secrets/{deepseek,openrouter}`; `claude` must be on PATH.

```bash
npm run corpus:fetch             # human passages → corpus/cache/human.json
npm run corpus:generate          # tier-1 AI (older/smaller models) → ai.json
npm run corpus:generate:frontier # tier-2 AI (frontier models), appended to ai.json
npm run corpus:build             # normalize + pack → web/public/{corpus,sources}.json
npm run corpus:verify            # balance / length / no-tells / pre-2022 checks
# or all four (tier-1 only):
npm run corpus:pilot
```

### Grow the corpus (add without starting over)

Item ids are content hashes, so the build can be **additive**: `corpus:grow` keeps every passage
already in `web/public/corpus.json` (and its id) and appends only items not already present.

```bash
npm run corpus:fetch             # fresh draw → new obscure Gutenberg works, etc.
npm run corpus:generate          # new AI passages (non-deterministic each run)
npm run corpus:generate:frontier # optional: more frontier AI
GROW=250 npm run corpus:grow     # append up to 250 NEW items, balanced across genres
npm run corpus:verify
```

`corpus:grow` is `MERGE=1 corpus:build`. `GROW=<n>` caps how many new items to add (omit to add
all new candidates); the cap is spread round-robin across genres. New items are deduped against the
existing corpus by content hash, so a re-fetched passage that's already in the corpus is skipped.

Where growth actually comes from: **Gutenberg** (fiction/poetry) draws a fresh random obscure set
each fetch, and **AI** generation is non-deterministic, so both grow automatically. **Wikipedia**
and **Wikivoyage** use fixed title lists at pinned revisions — re-fetching yields identical text
(same hash, deduped), so to add more of those, extend `WIKIPEDIA_TITLES` / `WIKIVOYAGE_TITLES` in
`data.ts` first. The human pool is the smaller one, so growing it most reduces repeats in play.

AI passages come from two model tiers (`AI_MODELS` and `AI_MODELS_FRONTIER` in `data.ts`): a
range of older/smaller models plus current frontier models (Claude Opus 4.8, Gemini 3.5 Flash,
GPT-5.5, DeepSeek V4 Pro, GLM-5.2), so the human set isn't only pitted against weak models. The
frontier run disables model "reasoning" (creative writing doesn't need it) and replaces only the
frontier-model items in `ai.json`, so it's safe to re-run. Each game then draws a ~50/50
human/AI mix regardless of pool sizes (`pickRounds` in `web/src/util.ts`).

`verify` is automated, but the **final gate is reading the passages yourself** — quality and
"is this actually gameable" can't be fully automated. Sources, counts, and the AI model roster
live in `corpus/build/data.ts`. Corpus size is set by the per-genre targets in `AI_TARGETS`
(`data.ts`) and `TARGETS` (`fetch-all.ts`) — keep the two in sync.

### Human sources

| Source | License | Notes |
|---|---|---|
| Wikipedia | CC BY-SA 4.0 | fetched at a pre-2022 revision |
| Wikinews | CC BY 2.5 | filtered to pre-2022 by first-revision date |
| Wikivoyage | CC BY-SA 4.0 | pre-2022 revision |
| Project Gutenberg | Public Domain | **obscure** works only (see below); boilerplate stripped |
| The Conversation / ProPublica | CC BY-ND / BY-NC-ND | **verbatim** excerpts; byline shown on reveal |

The Conversation and ProPublica articles are discovered automatically from each publisher's
**pre-2022 archive sitemaps** (`corpus/build/fetchers/news.ts`) — year-archives for The
Conversation, day-sitemaps for ProPublica — then filtered to English with a verified
publication date. `NEWS_SOURCES` in `data.ts` lets you pin extra article URLs by hand; any
essay shortfall backfills from public-domain essays. **ND means no derivatives**: these
passages are reproduced verbatim (contiguous paragraphs, unedited), skipped entirely if a byline
can't be resolved, and always credited to their author on reveal and on the Sources page.

All human writing predates 2022 to avoid AI contamination of the "human" set.

**Obscurity matters as much as quality.** Famous prose (Pride and Prejudice, Moby Dick, The
Raven…) is recognized rather than judged on style, which corrupts the stats. So Gutenberg books
are chosen at fetch time from the *full catalog* (`fetchers/gutenberg-catalog.ts`), excluding the
"Best Books Ever" canon, a famous-author denylist, translations, drama, and juvenile/anthology
forms — then a random sample of the long tail. One excerpt per fiction work (max author variety),
taken from mid-book to avoid recognizable openings, with TOC/index passages filtered out. Old
literature is welcome; *recognizable* literature is not. (Selection is randomized, so each corpus
rebuild draws a fresh obscure set.)

## Deploy

### Frontend (GitHub Pages)
1. Settings → Pages → Source: **GitHub Actions**.
2. Push to `main`; `.github/workflows/deploy.yml` builds and deploys. Base path is derived from
   the repo name automatically.
3. (Optional) Settings → Variables → set `VITE_SCOREBOARD_URL` and `VITE_TURNSTILE_SITEKEY` to
   enable the leaderboard.

### Scoreboard (Cloudflare Worker)
See `worker/README.md`. Summary: `wrangler d1 create`, run `schema.sql`, create a KV namespace,
`wrangler secret put TURNSTILE_SECRET`, set `ALLOWED_ORIGIN` to your Pages origin, `npm -w worker run deploy`.

## Attribution

Every human passage is listed with title, author, link, and license on the in-game **Sources**
page (`web/public/sources.json`), satisfying the CC attribution requirements. AI passages note the
generating model.
