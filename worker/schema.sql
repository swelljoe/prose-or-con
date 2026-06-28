CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores (created_at);
CREATE INDEX IF NOT EXISTS idx_scores_correct ON scores (correct DESC, total ASC);

-- Per-passage aggregate outcomes. `shown` counts submissions that included the
-- item; `correct` counts how often players guessed it right. Join id against
-- sources.json offline to find the most human-seeming AI / most AI-seeming human.
-- No per-player data is stored here — only running totals.
CREATE TABLE IF NOT EXISTS item_stats (
  id TEXT PRIMARY KEY,
  shown INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0
);

-- Optional D1-backed rate limiting table. The Worker uses KV (binding RL) by
-- default; this table exists only if you choose to rate limit in D1 instead.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
