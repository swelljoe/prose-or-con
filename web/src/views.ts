import type { CorpusIndex, SourceEntry } from './types';
import { escapeHtml } from './util';
import { aggregateStats, loadGames } from './storage';
import { fetchLeaderboard, scoreboardEnabled } from './scoreboard';

export function renderStart(view: HTMLElement, corpus: CorpusIndex): void {
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
      <p class="lede">Read ${corpus.rounds} passages. For each, guess whether a
        person or a machine wrote it.</p>
      <a class="primary big" href="#/play">Play →</a>
      ${lifetime}
      <p class="dim">${corpus.items.length} passages in the pool.</p>
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
        const titleText = s.title ?? s.snippet ?? s.source;
        const title = s.url
          ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(titleText)}</a>`
          : s.kind === 'ai'
            ? `<a href="#/passage/${s.id}">${escapeHtml(titleText)}</a>`
            : escapeHtml(titleText);
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

export function renderPassage(view: HTMLElement, item: ItemFile): void {
  const m = item.meta;
  const paragraphs = item.text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const attrParts: string[] = [`<strong>${escapeHtml(m.source)}</strong>`];
  if (m.title) attrParts.push(escapeHtml(m.title));
  if (m.author) attrParts.push(`by ${escapeHtml(m.author)}`);
  const license = m.licenseUrl
    ? `<a href="${escapeHtml(m.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(m.license)}</a>`
    : escapeHtml(m.license);
  const link = m.url
    ? `<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View original</a>`
    : '';

  view.innerHTML = `
    <main class="card reveal">
      <article class="passage">${paragraphs}</article>
      <div class="verdict">
        <p class="attribution">${attrParts.join(' · ')}<br>${license}${link ? ' · ' + link : ''}</p>
      </div>
      <a class="primary" href="#/sources">← Back to sources</a>
    </main>`;
}
