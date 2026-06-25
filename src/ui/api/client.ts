/**
 * API client — maps the actual RHESS backend response shapes to the UI types
 * defined in ./types.ts.
 *
 * Backend conventions:
 *   - Paginated lists:  { data: [...], meta: { page, per_page, total, total_pages, sort } }
 *   - Search:           { data: [...], total, query }
 *   - Skill fields:     id (integer), source (sourceSlug), slug, name, description,
 *                       artifactType, digest, allowedTools, skillPath, category,
 *                       frontmatter, installCommand, lastModified, sourceLabel, sourceUrl
 *   - Sources:          { sources: [...] }  (id is the slug string)
 */

import type { Skill, SkillDetail, SkillSource, PaginatedSkills } from './types';

const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return requestRaw<T>(`${BASE}${path}`, options);
}

async function requestRaw<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as
      | { error?: { message?: string; code?: string } | string }
      | null;
    const message =
      (typeof body?.error === 'object' ? body?.error?.message : body?.error as string)
      ?? res.statusText;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Backend response types (what the server actually returns)
// ---------------------------------------------------------------------------

interface BackendSkill {
  id: number;
  source: string;
  sourceLabel: string;
  sourceUrl: string | null;
  slug: string;
  name: string;
  description: string;
  artifactType: string;
  digest: string;
  category: string | null;
  allowedTools: string[];
  skillPath: string;
  frontmatter: Record<string, unknown>;
  installCommand: string;
  lastModified: string;
}

interface BackendSkillDetail extends BackendSkill {
  content: string;
  files: Array<{ path: string; contents: string }>;
}

interface BackendMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  sort: string;
}

// ---------------------------------------------------------------------------
// Mappers — backend → UI types
// ---------------------------------------------------------------------------

function mapSkill(s: BackendSkill): Skill {
  return {
    id: `${s.source}/${s.slug}`,
    slug: s.slug,
    name: s.name,
    description: s.description,
    category: s.category,
    allowedTools: s.allowedTools,
    sourceId: s.source,
    sourceLabel: s.sourceLabel,
    sourceUrl: s.sourceUrl,
    skillPath: s.skillPath,
    frontmatter: s.frontmatter,
    installCommand: s.installCommand,
    lastModified: s.lastModified,
  };
}

function mapSkillDetail(s: BackendSkillDetail): SkillDetail {
  return {
    ...mapSkill(s),
    content: s.content,
    files: s.files,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GetSkillsParams {
  page?: number;
  per_page?: number;
  sort?: 'name' | 'updated_at';
}

export async function getSkills(params: GetSkillsParams = {}): Promise<PaginatedSkills> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));
  if (params.sort) qs.set('sort', params.sort);
  const query = qs.toString();
  const res = await request<{ data: BackendSkill[]; meta: BackendMeta }>(
    `/skills${query ? `?${query}` : ''}`
  );
  return {
    skills: res.data.map(mapSkill),
    total: res.meta.total,
    page: res.meta.page,
    per_page: res.meta.per_page,
    total_pages: res.meta.total_pages,
  };
}

export async function searchSkills(q: string): Promise<{ skills: Skill[]; total: number; query: string }> {
  const res = await request<{ data: BackendSkill[]; total: number; query: string }>(
    `/skills/search?q=${encodeURIComponent(q)}`
  );
  return { skills: res.data.map(mapSkill), total: res.total, query: res.query };
}

// UI uses "sourceSlug/skillSlug" as the skill id; split and use as two path segments
export async function getSkill(id: string): Promise<SkillDetail> {
  const slashIdx = id.indexOf('/');
  if (slashIdx === -1) throw new Error(`Invalid skill id: ${id}`);
  const source = encodeURIComponent(id.slice(0, slashIdx));
  const slug = encodeURIComponent(id.slice(slashIdx + 1));
  const res = await request<BackendSkillDetail>(`/skills/${source}/${slug}`);
  return mapSkillDetail(res);
}

export async function getSources(): Promise<{ sources: SkillSource[] }> {
  return request<{ sources: SkillSource[] }>('/sources');
}

export async function addSource(
  token: string,
  source: { path: string; label: string }
): Promise<{ source: SkillSource }> {
  const data = await request<{ source: SkillSource; syncReport: unknown }>('/sources', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(source),
  });
  return { source: data.source };
}

export async function updateSource(
  token: string,
  id: string,
  source: { path: string; label: string }
): Promise<{ source: SkillSource }> {
  return request<{ source: SkillSource }>(`/sources/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(source),
  });
}

export async function syncSource(
  token: string,
  id: string
): Promise<{ synced: boolean; count: number; lastSynced: string }> {
  return request(`/sources/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function syncSkill(
  token: string,
  skillId: string
): Promise<{ synced: boolean; skillId: string; lastSynced: string }> {
  const slashIdx = skillId.indexOf('/');
  if (slashIdx === -1) throw new Error(`Invalid skill id: ${skillId}`);
  const source = encodeURIComponent(skillId.slice(0, slashIdx));
  const slug = encodeURIComponent(skillId.slice(slashIdx + 1));
  return request(`/skills/${source}/${slug}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteSource(token: string, id: string): Promise<{ ok: boolean; skillsRemoved: number }> {
  return request(`/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteSkill(token: string, id: string): Promise<void> {
  const slashIdx = id.indexOf('/');
  if (slashIdx === -1) throw new Error(`Invalid skill id: ${id}`);
  const source = encodeURIComponent(id.slice(0, slashIdx));
  const slug = encodeURIComponent(id.slice(slashIdx + 1));
  await request(`/skills/${source}/${slug}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function syncSources(
  token: string
): Promise<{ synced: boolean; count: number }> {
  const data = await requestRaw<{ synced?: number; count?: number }>('/api/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { synced: (data.synced ?? 0) > 0, count: data.count ?? 0 };
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/healthz');
    return res.ok;
  } catch {
    return false;
  }
}

export const isStaticDemo = false;
