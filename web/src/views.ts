import type { Corpus, SourceEntry } from './types';
import { escapeHtml } from './util';
import { aggregateStats, loadGames } from './storage';
import { fetchLeaderboard, scoreboardEnabled } from './scoreboard';

export function renderStart(view: HTMLElement, corpus: Corpus): void {
  const stats = aggregateStats(loadGames());
  const lifetime =
    stats.rounds > 0
      ? `<p class="lifetime">Lifetime: ${stats.correct}/${stats.rounds} (${Math.round(
          stats.accuracy * 100,
        )}%) · best streak ${stats.bestStreakAcrossGames}</p>`
      : '';
  view.innerHTML = `
    <main class="card start">
      <h1>Can you tell human writing from AI?</h1>
      <p class="lede">You'll read ${corpus.rounds} passages. For each one, guess whether a
        person or a machine wrote it. Sources are revealed after every guess.</p>
      <a class="primary big" href="#/play">Play →</a>
      ${lifetime}
      <p class="dim">${corpus.items.length} passages in the pool · all human writing predates 2022.</p>
    </main>`;
}

export function renderHistory(view: HTMLElement): void {
  const games = loadGames();
  const stats = aggregateStats(games);
  if (games.length === 0) {
    view.innerHTML = `<main class="card"><h2>No games yet</h2><p><a href="#/play">Play one →</a></p></main>`;
    return;
  }
  const rows = games
    .map((g) => {
      const d = new Date(g.date);
      return `<tr><td>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${g.correct}/${g.total}</td>
        <td>${Math.round((g.correct / g.total) * 100)}%</td></tr>`;
    })
    .join('');
  view.innerHTML = `
    <main class="card">
      <h2>Your history</h2>
      <div class="stat-grid">
        <div><b>${stats.games}</b><span>games</span></div>
        <div><b>${Math.round(stats.accuracy * 100)}%</b><span>overall</span></div>
        <div><b>${Math.round(stats.humanAccuracy * 100)}%</b><span>spotting humans</span></div>
        <div><b>${Math.round(stats.aiAccuracy * 100)}%</b><span>spotting AI</span></div>
      </div>
      <table class="history"><thead><tr><th>When</th><th>Score</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>
    </main>`;
}

export async function renderLeaderboard(view: HTMLElement): Promise<void> {
  if (!scoreboardEnabled()) {
    view.innerHTML = `<main class="card"><h2>Leaderboard</h2><p class="dim">The leaderboard isn't configured for this deployment.</p></main>`;
    return;
  }
  view.innerHTML = `<main class="card"><h2>Leaderboard</h2><p class="dim">Loading…</p></main>`;
  try {
    const rows = await fetchLeaderboard('all');
    const body = rows
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.correct}/${r.total}</td></tr>`,
      )
      .join('');
    view.innerHTML = `
      <main class="card">
        <h2>Leaderboard</h2>
        <table class="leaderboard-table"><thead><tr><th>#</th><th>Name</th><th>Score</th></tr></thead><tbody>${body}</tbody></table>
      </main>`;
  } catch (err) {
    view.innerHTML = `<main class="card"><h2>Leaderboard</h2><p>Could not load: ${(err as Error).message}</p></main>`;
  }
}

export function renderSources(view: HTMLElement, sources: SourceEntry[]): void {
  const human = sources.filter((s) => s.kind === 'human');
  const ai = sources.filter((s) => s.kind === 'ai');

  const list = (entries: SourceEntry[]): string =>
    entries
      .map((s) => {
        const title = s.url
          ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title ?? s.source)}</a>`
          : escapeHtml(s.title ?? s.source);
        const author = s.author ? ` by ${escapeHtml(s.author)}` : '';
        const lic = s.licenseUrl
          ? `<a href="${escapeHtml(s.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(s.license)}</a>`
          : escapeHtml(s.license);
        const model = s.model ? ` <span class="dim">${escapeHtml(s.model)}</span>` : '';
        return `<li>${title}${author} — <span class="dim">${escapeHtml(s.source)}${model}, ${lic}</span></li>`;
      })
      .join('');

  view.innerHTML = `
    <main class="card sources">
      <h2>Sources &amp; attribution</h2>
      <p>Every human passage is reproduced under the license shown, with identifying details
        hidden only during play. AI passages were generated for this project.</p>
      <h3>Human writing (${human.length})</h3>
      <ul class="source-list">${list(human)}</ul>
      <h3>AI writing (${ai.length})</h3>
      <ul class="source-list">${list(ai)}</ul>
    </main>`;
}
