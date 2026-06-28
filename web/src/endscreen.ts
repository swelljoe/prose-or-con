import type { GameRecord } from './storage';
import { escapeHtml } from './util';
import {
  TURNSTILE_SITEKEY,
  fetchLeaderboard,
  scoreboardEnabled,
  submitScore,
} from './scoreboard';

let turnstileLoading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('turnstile load failed'));
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}

export function renderEndScreen(
  root: HTMLElement,
  record: GameRecord,
  playAgain: () => void,
): void {
  const pct = Math.round((record.correct / record.total) * 100);
  const breakdown = record.rounds
    .map((r) => {
      const actual = r.actual === 'human' ? '✍️ Human' : '🤖 AI';
      const tag = r.correct ? '✓' : '✗';
      const model = r.model ? ` <span class="dim">(${escapeHtml(r.model)})</span>` : '';
      return `<li class="${r.correct ? 'good' : 'bad'}"><span>${tag}</span> ${escapeHtml(r.source)}${model} — <i>${actual}</i></li>`;
    })
    .join('');

  root.innerHTML = `
    <main class="card end">
      <h1>${record.correct} / ${record.total}</h1>
      <p class="score-sub">${pct}% — ${verdict(pct)}</p>
      <ul class="breakdown">${breakdown}</ul>
      <div id="submit-area"></div>
      <div class="end-actions">
        <button class="primary" id="again">Play again</button>
        <a class="btn-link" href="#/history">History</a>
        <a class="btn-link" href="#/leaderboard">Leaderboard</a>
        <a class="btn-link" href="#/sources">Sources</a>
      </div>
    </main>`;
  root.querySelector<HTMLButtonElement>('#again')!.addEventListener('click', playAgain);

  if (scoreboardEnabled() && TURNSTILE_SITEKEY) {
    renderSubmit(root.querySelector<HTMLElement>('#submit-area')!, record);
  }
}

function renderSubmit(area: HTMLElement, record: GameRecord): void {
  area.innerHTML = `
    <form class="submit-form">
      <label>Add to leaderboard
        <input id="name" maxlength="24" placeholder="your name" autocomplete="off" />
      </label>
      <div id="ts-widget" class="ts-widget"></div>
      <button type="submit" id="submit-btn" disabled>Submit score</button>
      <p class="submit-msg" id="submit-msg"></p>
    </form>`;
  const form = area.querySelector<HTMLFormElement>('.submit-form')!;
  const btn = area.querySelector<HTMLButtonElement>('#submit-btn')!;
  const msg = area.querySelector<HTMLElement>('#submit-msg')!;
  let token = '';

  loadTurnstile()
    .then(() => {
      window.turnstile?.render('#ts-widget', {
        sitekey: TURNSTILE_SITEKEY,
        callback: (t) => {
          token = t;
          btn.disabled = false;
        },
      });
    })
    .catch(() => {
      msg.textContent = 'Could not load the bot check; leaderboard submit disabled.';
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (area.querySelector<HTMLInputElement>('#name')!.value || 'anonymous').trim();
    btn.disabled = true;
    msg.textContent = 'Submitting…';
    try {
      const rounds = record.rounds.map((r) => [r.id, r.correct ? 1 : 0] as [string, number]);
      await submitScore({ name, correct: record.correct, total: record.total, turnstileToken: token, rounds });
      msg.textContent = 'Submitted! Showing leaderboard…';
      const rows = await fetchLeaderboard('all');
      const top = rows
        .slice(0, 10)
        .map((r) => `<li>${escapeHtml(r.name)} — ${r.correct}/${r.total}</li>`)
        .join('');
      form.innerHTML = `<ol class="leaderboard">${top}</ol>`;
    } catch (err) {
      msg.textContent = `Submit failed: ${(err as Error).message}`;
      window.turnstile?.reset();
    }
  });
}

function verdict(pct: number): string {
  if (pct >= 90) return 'sharp eye';
  if (pct >= 70) return 'better than a coin flip';
  if (pct >= 50) return 'a coin flip, basically';
  return 'the machines fooled you';
}
