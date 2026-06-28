import type { Author, Genre } from './types';

const KEY = 'poc.history.v1';
const NAME_KEY = 'poc.name.v1';

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export interface RoundResult {
  id: string;
  genre: Genre;
  source: string;
  model?: string;
  actual: Author;
  guess: Author;
  correct: boolean;
}

export interface GameRecord {
  date: string; // ISO
  correct: number;
  total: number;
  rounds: RoundResult[];
}

export function loadGames(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGame(record: GameRecord): void {
  const games = loadGames();
  games.unshift(record);
  // Keep history bounded.
  try {
    localStorage.setItem(KEY, JSON.stringify(games.slice(0, 200)));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export interface Stats {
  games: number;
  rounds: number;
  correct: number;
  accuracy: number;
  // How often the player is right when the passage really is AI vs human.
  aiAccuracy: number;
  humanAccuracy: number;
  bestStreakAcrossGames: number;
}

export function aggregateStats(games: GameRecord[]): Stats {
  let rounds = 0;
  let correct = 0;
  let aiTotal = 0;
  let aiRight = 0;
  let humanTotal = 0;
  let humanRight = 0;
  let bestStreak = 0;
  let streak = 0;

  for (const g of games) {
    for (const r of g.rounds) {
      rounds++;
      if (r.correct) {
        correct++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        streak = 0;
      }
      if (r.actual === 'ai') {
        aiTotal++;
        if (r.correct) aiRight++;
      } else {
        humanTotal++;
        if (r.correct) humanRight++;
      }
    }
  }

  return {
    games: games.length,
    rounds,
    correct,
    accuracy: rounds ? correct / rounds : 0,
    aiAccuracy: aiTotal ? aiRight / aiTotal : 0,
    humanAccuracy: humanTotal ? humanRight / humanTotal : 0,
    bestStreakAcrossGames: bestStreak,
  };
}
