import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getText } from '../http';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(here, '..', '..', 'cache', 'pg_catalog.csv');
const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv';

/** RFC4180-ish parser: handles quoted fields with embedded commas/newlines/quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface CatalogRow {
  id: number;
  title: string;
  authors: string;
  subjects: string;
  shelves: string;
}

let cached: CatalogRow[] | null = null;

async function loadCatalog(): Promise<CatalogRow[]> {
  if (cached) return cached;
  if (!existsSync(CATALOG)) {
    mkdirSync(dirname(CATALOG), { recursive: true });
    writeFileSync(CATALOG, await getText(CATALOG_URL));
  }
  const rows = parseCsv(readFileSync(CATALOG, 'utf8'));
  const head = rows[0]!;
  const ix = (n: string) => head.indexOf(n);
  const [cId, cType, cTitle, cLang, cAuth, cSubj, cShelf] = [
    ix('Text#'), ix('Type'), ix('Title'), ix('Language'), ix('Authors'), ix('Subjects'), ix('Bookshelves'),
  ];
  cached = rows
    .slice(1)
    .filter((r) => r[cType] === 'Text' && r[cLang] === 'en')
    .map((r) => ({
      id: Number(r[cId]),
      title: r[cTitle] ?? '',
      authors: r[cAuth] ?? '',
      subjects: r[cSubj] ?? '',
      shelves: r[cShelf] ?? '',
    }));
  return cached;
}

// Household-name / heavily-adapted / school-assigned authors whose prose a reader
// might recognize on sight. Excluded so the game tests style, not recognition.
const FAMOUS: RegExp[] = [
  /Austen/, /Dickens/, /Twain/, /Clemens, Samuel/, /Melville/, /Doyle, Arthur/, /Stoker, Bram/,
  /Shelley, Mary/, /Wilde, Oscar/, /Bront/, /Fitzgerald, F/, /Tolstoy/, /Dostoyevsky/, /Dostoevsky/,
  /Dumas/, /Verne, Jules/, /Wells, H\. G/, /Carroll, Lewis/, /Dodgson/, /Stevenson, Robert Louis/,
  /Poe, Edgar/, /Hawthorne, Nathaniel/, /Defoe, Daniel/, /Swift, Jonathan/, /Cervantes/, /Hugo, Victor/,
  /Joyce, James/, /Conrad, Joseph/, /Hardy, Thomas/, /Kipling/, /London, Jack/, /Wharton, Edith/,
  /Alcott/, /Montgomery, L\. M/, /Grahame, Kenneth/, /Barrie, J/, /Baum, L/, /Stowe, Harriet/,
  /Cooper, James Fenimore/, /Irving, Washington/, /Christie, Agatha/, /Burroughs, Edgar Rice/,
  /Lovecraft/, /Wodehouse/, /Buchan, John/, /Forster, E\. M/, /Woolf, Virginia/, /Lawrence, D\. H/,
  /Crane, Stephen/, /Bierce, Ambrose/, /Gilman, Charlotte/, /Chopin, Kate/, /James, Henry/,
  /Galsworthy/, /Collins, Wilkie/, /Gaskell/, /Eliot, George/, /Sinclair, Upton/, /Cather, Willa/,
  /Dreiser/, /Norris, Frank/, /Haggard, H/, /Scott, Walter/, /Thackeray/, /Gogol/, /Turgenev/,
  /Lewis, Sinclair/, /Crane, Stephen/, /Henty/, /Alger, Horatio/, /Grey, Zane/, /Porter, Eleanor/,
  /Dante/, /Alighieri/, /Bulwer/, /Lytton/, /Howard, Robert E/, /Churchill, Winston/, /Belloc/,
  /Tegn/, /Khayyam/, /Goethe/, /Schiller/, /Petrarch/, /Virgil/, /Ovid/, /Horace/,
  /Chekhov/, /Maupassant/, /Balzac/, /Flaubert/, /Zola/, /Machen, Arthur/, /Dunsany/, /Trollope, Anthony/,
  // Poetry
  /Whitman, Walt/, /Dickinson, Emily/, /Keats, John/, /Byron, George/, /Wordsworth/, /Coleridge/,
  /Tennyson/, /Browning/, /Frost, Robert/, /Yeats/, /Longfellow/, /Milton, John/, /Chaucer/,
  /Shakespeare/, /Service, Robert/, /Whittier/, /Riley, James Whitcomb/, /Kilmer, Joyce/,
  /Henley, William Ernest/, /Field, Eugene/, /Millay/, /Sandburg/, /Vachel/, /Masters, Edgar Lee/,
  /Wilcox, Ella/, /Rossetti/, /Hopkins, Gerard/, /Housman/, /Lanier, Sidney/, /Holmes, Oliver Wendell/,
  /Bryant, William Cullen/, /Lowell, /, /Gray, Thomas/, /Pope, Alexander/, /Masefield/, /Greenaway/,
  /Blake, William/, /Burns, Robert/, /Spenser/, /Marlowe/, /Donne, John/, /Dryden/, /Goldsmith, Oliver/,
  /Cowper, William/, /Swinburne/, /Morris, William/, /Brooke, Rupert/, /Owen, Wilfred/, /Sassoon/,
  /de la Mare/, /Moore, Thomas/, /Hood, Thomas/, /Shelley, Percy/, /Sidney, Philip/, /Herrick, Robert/,
  /Marvell/, /Herbert, George/, /Campbell, Thomas/, /Clough/, /Patmore/, /Thompson, Francis/,
  /Cummings, E/, /Pound, Ezra/, /Lowell, Amy/, /Doolittle, Hilda/, /Teasdale/, /Lindsay, Vachel/,
  // Essays
  /Emerson/, /Thoreau/, /Bacon, Francis/, /Montaigne/, /Chesterton/, /Lamb, Charles/, /Hazlitt/,
  /Ruskin/, /Carlyle/, /Arnold, Matthew/, /Du Bois/, /Addison, Joseph/, /Steele, Richard/,
  /Johnson, Samuel/, /Macaulay/,
];

const GENRE_TOKEN: Record<'fiction' | 'poetry' | 'essay', RegExp> = {
  fiction: /Fiction/,
  poetry: /Poetry/,
  essay: /Essays/i,
};
// Forms that aren't an author's own flowing English prose/verse (plays, reference
// works, periodicals, and translations — translationese is its own confound).
const EXCLUDE =
  /Drama|Periodicals|Dictionaries|Indexes|Encyclopedias|Songbooks|Juvenile|Nursery|Translations into English/i;
// Posthumous-fragment / mixed-layout collections that extract into garbled text.
const TITLE_EXCLUDE = /\b(remains|inedited|fragments|prose and verse|commonplace book)\b/i;

/** Random obscure public-domain book ids for a genre (canon + famous excluded). */
export async function selectObscureIds(
  genre: 'fiction' | 'poetry' | 'essay',
  count: number,
): Promise<number[]> {
  const cat = await loadCatalog();
  const token = GENRE_TOKEN[genre];
  const pool = cat.filter(
    (r) =>
      token.test(`${r.subjects} ${r.shelves}`) &&
      !/Best Books Ever Listings/.test(r.shelves) &&
      !EXCLUDE.test(r.subjects) &&
      !TITLE_EXCLUDE.test(r.title) &&
      /\d{4}-\d{4}/.test(r.authors) && // an actual (deceased) author, not anonymous/periodical
      !FAMOUS.some((re) => re.test(r.authors)),
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count).map((r) => r.id);
}
