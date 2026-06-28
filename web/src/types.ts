export type Author = 'human' | 'ai';

export type Genre =
  | 'encyclopedic'
  | 'news'
  | 'essay'
  | 'travel'
  | 'fiction'
  | 'poetry';

/** Attribution for a passage. Shown only after the player guesses. */
export interface Meta {
  source: string; // "Wikipedia", "The Conversation", "DeepSeek", ...
  title?: string;
  author?: string; // human byline (required on reveal for ND sources)
  url?: string;
  license: string; // "CC BY-SA 4.0", "Public Domain", "AI-generated", ...
  licenseUrl?: string;
  model?: string; // AI only
  nd?: boolean; // verbatim-required source
}

/** One entry in corpus/index.json — selection data only, no text or meta. */
export interface IndexEntry {
  id: string;
  genre: Genre;
  secret: string; // base64(JSON({ author }))
}

export interface CorpusIndex {
  version: number;
  builtAt: string;
  rounds: number;
  items: IndexEntry[];
}

/** A single passage file (corpus/items/<id>.json), fetched only when played. */
export interface ItemFile {
  text: string;
  meta: Meta;
}

/** One row on the public Sources/attribution page. */
export interface SourceEntry {
  id: string;
  kind: Author;
  source: string;
  title?: string;
  author?: string;
  url?: string;
  license: string;
  licenseUrl?: string;
  model?: string;
}
