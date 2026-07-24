import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack } from './build-corpus';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(here, '..', '..', 'web', 'public', 'corpus.json');
const SOURCES_PATH = join(here, '..', '..', 'web', 'public', 'sources.json');

function main() {
  console.log('Refreshing sources.json from corpus.json...');
  
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const items = corpus.items;

  const sources = items.map((item: any) => {
    const { author, meta } = unpack(item.secret);
    return {
      id: item.id,
      kind: author,
      source: meta.source,
      title: meta.title,
      author: meta.author,
      url: meta.url,
      license: meta.license,
      licenseUrl: meta.licenseUrl,
      model: meta.model,
      snippet: author === 'ai' && !meta.title ? item.text.slice(0, 60) + '...' : undefined,
    };
  });

  sources.sort((a: any, b: any) => 
    a.source.localeCompare(b.source) || (a.title ?? '').localeCompare(b.title ?? '')
  );

  writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2));
  console.log(`Successfully updated ${SOURCES_PATH} with ${sources.length} entries.`);
}

main();
