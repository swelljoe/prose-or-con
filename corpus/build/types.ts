export type Author = 'human' | 'ai';

export type Genre =
  | 'encyclopedic'
  | 'news'
  | 'essay'
  | 'travel'
  | 'fiction'
  | 'poetry';

export interface Meta {
  source: string;
  title?: string;
  author?: string;
  url?: string;
  license: string;
  licenseUrl?: string;
  model?: string;
  nd?: boolean;
}

/** A passage before cleaning/packing, as produced by a fetcher or generator. */
export interface RawItem {
  author: Author;
  genre: Genre;
  text: string;
  meta: Meta;
  /** Evidence the human source predates 2022 (ISO date or year). */
  publishedBefore?: string;
  /** Internal: AI prompt style, never displayed. */
  promptStyle?: 'plain' | 'humanized';
}
