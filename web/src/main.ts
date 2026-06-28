import './style.css';
import type { Corpus, SourceEntry } from './types';
import { renderGame } from './game';
import { renderHistory, renderLeaderboard, renderSources, renderStart } from './views';

const app = document.getElementById('app')!;
const base = import.meta.env.BASE_URL;

let corpus: Corpus | null = null;
let sources: SourceEntry[] | null = null;

async function getCorpus(): Promise<Corpus> {
  if (!corpus) {
    const res = await fetch(`${base}corpus.json`);
    corpus = (await res.json()) as Corpus;
  }
  return corpus;
}

async function getSources(): Promise<SourceEntry[]> {
  if (!sources) {
    const res = await fetch(`${base}sources.json`);
    sources = (await res.json()) as SourceEntry[];
  }
  return sources;
}

function header(): string {
  return `<header class="site-header">
    <a href="#/" class="brand">Prose <span>or</span> Con</a>
    <nav>
      <a href="#/history">History</a>
      <a href="#/leaderboard">Leaderboard</a>
      <a href="#/sources">Sources</a>
    </nav>
  </header>`;
}

async function route(): Promise<void> {
  const hash = location.hash.replace(/^#/, '') || '/';
  app.innerHTML = header() + '<div id="view"></div>';
  const view = document.getElementById('view')!;
  try {
    switch (true) {
      case hash === '/play': {
        renderGame(view, await getCorpus());
        break;
      }
      case hash === '/history':
        renderHistory(view);
        break;
      case hash === '/leaderboard':
        await renderLeaderboard(view);
        break;
      case hash === '/sources':
        renderSources(view, await getSources());
        break;
      default:
        renderStart(view, await getCorpus());
    }
  } catch (err) {
    view.innerHTML = `<main class="card"><p>Could not load the game: ${(err as Error).message}</p></main>`;
  }
}

window.addEventListener('hashchange', () => void route());
void route();
