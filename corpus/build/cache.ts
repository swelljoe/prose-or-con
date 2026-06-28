import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawItem } from './types';

const here = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(here, '..', 'cache');

export function cachePath(name: string): string {
  return join(CACHE_DIR, `${name}.json`);
}

export function writeCache(name: string, items: RawItem[]): void {
  mkdirSync(dirname(cachePath(name)), { recursive: true });
  writeFileSync(cachePath(name), JSON.stringify(items, null, 2));
}

export function readCache(name: string): RawItem[] {
  const p = cachePath(name);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8')) as RawItem[];
}

export function hasCache(name: string): boolean {
  return existsSync(cachePath(name));
}
