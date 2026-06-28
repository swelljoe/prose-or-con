import type { Author, CorpusIndex, Genre, ItemFile, Meta } from './types';
import { escapeHtml, pickRounds, unpackAuthor } from './util';
import { saveGame, type GameRecord, type RoundResult } from './storage';
import { renderEndScreen } from './endscreen';

interface Round {
  id: string;
  genre: Genre;
  author: Author;
  text: string;
  meta: Meta;
}

export async function renderGame(
  root: HTMLElement,
  index: CorpusIndex,
  getItem: (id: string) => Promise<ItemFile>,
): Promise<void> {
  const entries = pickRounds(index.items, index.rounds);
  root.innerHTML = `<main class="card"><p class="dim">Loading passages…</p></main>`;
  let files: ItemFile[];
  try {
    files = await Promise.all(entries.map((e) => getItem(e.id)));
  } catch (err) {
    root.innerHTML = `<main class="card"><p>Could not load passages: ${escapeHtml((err as Error).message)}</p></main>`;
    return;
  }

  const rounds: Round[] = entries.map((e, i) => ({
    id: e.id,
    genre: e.genre,
    author: unpackAuthor(e),
    text: files[i]!.text,
    meta: files[i]!.meta,
  }));
  const results: RoundResult[] = [];
  let idx = 0;

  function paragraphs(text: string): string {
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function renderRound(): void {
    const { text } = rounds[idx]!;
    root.innerHTML = `
      <main class="card">
        <div class="progress">Passage ${idx + 1} of ${rounds.length}</div>
        <article class="passage">${paragraphs(text)}</article>
        <p class="prompt">Who wrote this?</p>
        <div class="choices">
          <button class="choice" data-guess="human">✍️ Human</button>
          <button class="choice" data-guess="ai">🤖 AI</button>
        </div>
      </main>`;
    for (const btn of root.querySelectorAll<HTMLButtonElement>('.choice')) {
      btn.addEventListener('click', () => onGuess(btn.dataset.guess as Author));
    }
  }

  function onGuess(guess: Author): void {
    const r = rounds[idx]!;
    const correct = guess === r.author;
    results.push({
      id: r.id,
      genre: r.genre,
      source: r.meta.source,
      model: r.meta.model,
      actual: r.author,
      guess,
      correct,
    });
    renderReveal(guess, correct);
  }

  function renderReveal(guess: Author, correct: boolean): void {
    const r = rounds[idx]!;
    const m = r.meta;
    const verdict = correct ? 'Correct' : 'Not quite';
    const truth =
      r.author === 'human'
        ? 'A human wrote this.'
        : `An AI wrote this${m.model ? ` (${escapeHtml(m.model)})` : ''}.`;

    const attrParts: string[] = [`<strong>${escapeHtml(m.source)}</strong>`];
    if (m.title) attrParts.push(escapeHtml(m.title));
    if (m.author) attrParts.push(`by ${escapeHtml(m.author)}`);
    const license = m.licenseUrl
      ? `<a href="${escapeHtml(m.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(m.license)}</a>`
      : escapeHtml(m.license);
    const link = m.url
      ? `<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View original</a>`
      : '';

    const last = idx === rounds.length - 1;
    root.innerHTML = `
      <main class="card reveal ${correct ? 'good' : 'bad'}">
        <div class="progress">Passage ${idx + 1} of ${rounds.length}</div>
        <article class="passage muted">${paragraphs(r.text)}</article>
        <div class="verdict">
          <h2>${verdict}</h2>
          <p>You guessed <b>${guess === 'human' ? '✍️ Human' : '🤖 AI'}</b>. ${escapeHtml(truth)}</p>
          <p class="attribution">${attrParts.join(' · ')}<br>${license}${link ? ' · ' + link : ''}</p>
        </div>
        <button class="next">${last ? 'See results' : 'Next passage'} →</button>
      </main>`;
    root.querySelector<HTMLButtonElement>('.next')!.addEventListener('click', () => {
      if (last) finish();
      else {
        idx++;
        renderRound();
      }
    });
  }

  function finish(): void {
    const correct = results.filter((r) => r.correct).length;
    const record: GameRecord = {
      date: new Date().toISOString(),
      correct,
      total: results.length,
      rounds: results,
    };
    saveGame(record);
    renderEndScreen(root, record, () => void renderGame(root, index, getItem));
  }

  renderRound();
}
