export interface SkillSource {
  id: string;
  path: string;
  label: string;
  url?: string | null;
  lastSynced?: string;
  skillCount?: number;
  status?: string;
}

export interface SkillFile {
  path: string;
  contents: string;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  allowedTools: string[];
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  skillPath: string;
  frontmatter: Record<string, unknown>;
  installCommand: string;
  lastModified: string;
}

export interface SkillDetail extends Skill {
  content: string;
  files: SkillFile[];
}

export interface PaginatedSkills {
  skills: Skill[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
