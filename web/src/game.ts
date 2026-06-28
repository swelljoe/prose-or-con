import type { Answer, Author, Corpus, PackedItem } from './types';
import { escapeHtml, pickRounds, unpackAnswer } from './util';
import { saveGame, type GameRecord, type RoundResult } from './storage';
import { renderEndScreen } from './endscreen';

interface RoundState {
  item: PackedItem;
  answer: Answer;
}

export function renderGame(root: HTMLElement, corpus: Corpus): void {
  const rounds = pickRounds(corpus.items, corpus.rounds).map(
    (item): RoundState => ({ item, answer: unpackAnswer(item) }),
  );
  const results: RoundResult[] = [];
  let idx = 0;

  function paragraphs(text: string): string {
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function renderRound(): void {
    const { item } = rounds[idx]!;
    root.innerHTML = `
      <main class="card">
        <div class="progress">Passage ${idx + 1} of ${rounds.length}</div>
        <article class="passage">${paragraphs(item.text)}</article>
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
    const { item, answer } = rounds[idx]!;
    const correct = guess === answer.author;
    results.push({
      id: item.id,
      genre: item.genre,
      source: answer.meta.source,
      model: answer.meta.model,
      actual: answer.author,
      guess,
      correct,
    });
    renderReveal(guess, correct);
  }

  function renderReveal(guess: Author, correct: boolean): void {
    const { item, answer } = rounds[idx]!;
    const m = answer.meta;
    const verdict = correct ? 'Correct' : 'Not quite';
    const truth =
      answer.author === 'human'
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
        <article class="passage muted">${paragraphs(item.text)}</article>
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
    renderEndScreen(root, record, () => renderGame(root, corpus));
  }

  renderRound();
}
