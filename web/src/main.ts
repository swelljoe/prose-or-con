import './style.css';
import type { CorpusIndex, ItemFile, SourceEntry } from './types';
import { renderGame } from './game';
import { renderHistory, renderLeaderboard, renderSources, renderStart } from './views';

const app = document.getElementById('app')!;
const base = import.meta.env.BASE_URL;

let index: CorpusIndex | null = null;
let sources: SourceEntry[] | null = null;
const itemCache = new Map<string, Promise<ItemFile>>();

async function getIndex(): Promise<CorpusIndex> {
  if (!index) {
    const res = await fetch(`${base}corpus/index.json`);
    if (!res.ok) throw new Error(`corpus ${res.status}`);
    index = (await res.json()) as CorpusIndex;
  }
  return index;
}

function getItem(id: string): Promise<ItemFile> {
  let p = itemCache.get(id);
  if (!p) {
    p = fetch(`${base}corpus/items/${id}.json`).then((res) => {
      if (!res.ok) throw new Error(`item ${res.status}`);
      return res.json() as Promise<ItemFile>;
    });
    itemCache.set(id, p);
  }
  return p;
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
        await renderGame(view, await getIndex(), getItem);
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
        renderStart(view, await getIndex());
    }
  } catch (err) {
    view.innerHTML = `<main class="card"><p>Could not load the game: ${(err as Error).message}</p></main>`;
  }
}

window.addEventListener('hashchange', () => void route());
void route();
