import Fuse, { type IFuseOptions } from "fuse.js";
import type { SearchProvider, SearchIndexItem, SearchResult } from "./types.js";

const FUSE_OPTIONS: IFuseOptions<SearchIndexItem> = {
  keys: ["name", "description", "sourceSlug"],
  includeScore: true,
  threshold: 0.4,
};

export class FuseSearchProvider implements SearchProvider {
  private fuse: Fuse<SearchIndexItem> = new Fuse<SearchIndexItem>([], FUSE_OPTIONS);

  buildIndex(items: SearchIndexItem[]): void {
    this.fuse = new Fuse<SearchIndexItem>(items, FUSE_OPTIONS);
  }

  search(query: string, limit?: number): SearchResult[] {
    const results = this.fuse.search(query, limit !== undefined ? { limit } : undefined);
    return results.map((r) => ({
      id: r.item.id,
      sourceSlug: r.item.sourceSlug,
      slug: r.item.slug,
      name: r.item.name,
      description: r.item.description,
      score: r.score ?? 0,
    }));
  }
}
