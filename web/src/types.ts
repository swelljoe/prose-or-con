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

/** The hidden answer for a passage, base64-packed in corpus.json. */
export interface Answer {
  author: Author;
  meta: Meta;
}

/** A passage as shipped in corpus.json (answer is packed in `secret`). */
export interface PackedItem {
  id: string;
  text: string;
  genre: Genre;
  wordCount: number;
  secret: string; // base64(JSON(Answer))
}

export interface Corpus {
  version: number;
  builtAt: string;
  rounds: number;
  items: PackedItem[];
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
