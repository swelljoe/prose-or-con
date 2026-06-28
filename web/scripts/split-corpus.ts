import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Split the committed monolith (public/corpus.json) into the files the site
// actually fetches: a small selection index (id + genre + packed author, no
// text) plus one {text, meta} file per passage, loaded only when played.
// IDs are unchanged, so the index and the item files share the same key.

interface PackedItem {
  id: string;
  text: string;
  genre: string;
  wordCount: number;
  secret: string; // base64(JSON({ author, meta }))
}

function decode(secret: string): { author: 'human' | 'ai'; meta: unknown } {
  return JSON.parse(Buffer.from(secret, 'base64').toString('utf8'));
}

/** Re-pack just the author, matching corpus.json's base64 obfuscation level. */
function packAuthor(secret: string): string {
  const { author } = decode(secret);
  return Buffer.from(JSON.stringify({ author }), 'utf8').toString('base64');
}

export function splitCorpus(publicDir: string): number {
  const corpus = JSON.parse(readFileSync(join(publicDir, 'corpus.json'), 'utf8')) as {
    version: number;
    builtAt: string;
    rounds: number;
    items: PackedItem[];
  };

  const outDir = join(publicDir, 'corpus');
  const itemsDir = join(outDir, 'items');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(itemsDir, { recursive: true });

  const index = {
    version: corpus.version,
    builtAt: corpus.builtAt,
    rounds: corpus.rounds,
    items: corpus.items.map((it) => ({
      id: it.id,
      genre: it.genre,
      secret: packAuthor(it.secret),
    })),
  };
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));

  for (const it of corpus.items) {
    const { meta } = decode(it.secret);
    writeFileSync(join(itemsDir, `${it.id}.json`), JSON.stringify({ text: it.text, meta }));
  }

  return corpus.items.length;
}
