export interface SearchResult {
  sourceSlug: string;
  slug: string;
  name: string;
  description: string;
  /** Fuse.js score — lower is a better match (0 = exact) */
  score: number;
}

export interface SearchProvider {
  /** Rebuild the full index from the current catalog. Call after every sync. */
  buildIndex(items: SearchIndexItem[]): void;
  search(query: string, limit?: number): SearchResult[];
}

export interface SearchIndexItem {
  sourceSlug: string;
  slug: string;
  name: string;
  description: string;
}
