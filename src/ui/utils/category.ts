/**
 * Extracts a compact "org/repo" path from a full repository URL.
 * e.g. "https://github.com/redhat-ux/agent-skills" → "redhat-ux/agent-skills"
 * Falls back to the raw string when it cannot be parsed.
 */
export function formatSourcePath(url: string | null | undefined): string {
  if (!url) return '';
  const clean = url.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  const parts = clean.split('/').filter(Boolean);
  // Skip the hostname (github.com, gitlab.com, etc.) and return the rest
  const pathParts = parts.slice(1);
  return pathParts.length >= 2 ? pathParts.slice(0, 2).join('/') : clean;
}

/** Normalize org/repo or partial paths to a full HTTPS repository URL. */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim().replace(/\.git$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.replace(/^github\.com\//i, '');
  if (/^[\w.-]+\/[\w.-]+/.test(path)) return `https://github.com/${path}`;
  return null;
}

import { getStaticDemoSourceUrl } from '../api/staticDemoSources';

type SourceLookup = { id: string; url?: string | null; path?: string | null; label?: string };

function lookupSourceUrl(sourceId: string | undefined, sources?: SourceLookup[]): string | null {
  if (!sourceId) return null;
  const source = sources?.find((s) => s.id === sourceId);
  return normalizeSourceUrl(source?.url ?? source?.path)
    ?? normalizeSourceUrl(getStaticDemoSourceUrl(sourceId) ?? undefined);
}

/** Resolve a skill's repository URL from its own field or parent source. */
export function resolveSkillSourceUrl(
  skill: { sourceUrl?: string | null; sourceId?: string },
  sources?: SourceLookup[],
): string | null {
  return normalizeSourceUrl(skill.sourceUrl) ?? lookupSourceUrl(skill.sourceId, sources);
}

/** Resolve a source catalog row's repository URL. */
export function resolveSourceUrl(source: SourceLookup): string | null {
  return normalizeSourceUrl(source.url ?? source.path)
    ?? normalizeSourceUrl(getStaticDemoSourceUrl(source.id) ?? undefined);
}

// Valid PF v6 Label colors that have actual CSS (pf-m-*):
// blue, teal, green, orange, purple, red, orangered, yellow
// NOTE: 'grey' is in the TypeScript type but has no CSS in v6 — labels render invisible.
export type CategoryLabelColor =
  | 'blue' | 'teal' | 'green' | 'orange' | 'purple' | 'orangered' | 'yellow' | 'red';

export function categoryColor(category: string | null): CategoryLabelColor {
  const c = (category ?? '').toLowerCase();

  if (c.includes('cloud') || c.includes('ai'))                              return 'blue';
  if (c.includes('agent') || c.includes('workflow'))                        return 'teal';
  if (c.includes('frontend') || c.includes('react'))                        return 'purple';
  if (c.includes('design') || c.includes('ui') || c.includes('ux'))         return 'orangered';
  if (c.includes('test') || c.includes('qa'))                               return 'green';
  if (c.includes('cursor') || c.includes('tooling'))                        return 'orange';
  if (c.includes('review') || c.includes('code quality'))                   return 'yellow';
  if (c.includes('util') || c.includes('general'))                          return 'teal';
  if (c.includes('devops') || c.includes('infra') || c.includes('backend')) return 'orange';
  if (c.includes('dev') || c.includes('sdk') || c.includes('api'))          return 'blue';

  // Deterministic fallback — unknown categories spread across the palette.
  const palette: CategoryLabelColor[] = ['blue', 'teal', 'green', 'orange', 'purple', 'orangered', 'yellow', 'red'];
  const hash = [...(category ?? '')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length]!;
}
