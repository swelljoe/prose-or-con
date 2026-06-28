const UA =
  'prose-or-con-corpus-builder/0.1 (+https://github.com/; research/educational game)';

export async function getText(url: string, init?: RequestInit): Promise<string> {
  const res = await withRetry(() =>
    fetch(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers ?? {}) } }),
  );
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await withRetry(() =>
    fetch(url, {
      ...init,
      headers: { 'user-agent': UA, accept: 'application/json', ...(init?.headers ?? {}) },
    }),
  );
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function withRetry(fn: () => Promise<Response>, tries = 5): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        last = new Error(`status ${res.status}`);
        if (i < tries - 1) {
          // Honor Retry-After when present; otherwise exponential backoff.
          await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 1000 * 2 ** i));
        }
        continue;
      }
      return res;
    } catch (err) {
      last = err;
      if (i < tries - 1) await sleep(Math.min(8000, 1000 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
