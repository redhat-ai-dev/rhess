export interface Source {
  id: number;
  slug: string;
  url: string;
  createdAt: string;
  lastSyncedAt: string | null;
  syncStatus: "idle" | "syncing" | "error";
  syncError: string | null;
}

export interface Skill {
  id: number;
  sourceId: number;
  sourceSlug: string;
  slug: string;
  name: string;
  description: string;
  artifactType: "skill-md" | "archive";
  /** SHA-256 hex digest of the served artifact */
  digest: string;
  /** Raw SKILL.md content */
  content: string;
  /** Paths of supporting files relative to the skill root */
  supportingFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceInput {
  slug: string;
  url: string;
}

export interface UpdateSourceSyncInput {
  id: number;
  status: Source["syncStatus"];
  error?: string | null;
}

export interface UpsertSkillInput {
  sourceId: number;
  sourceSlug: string;
  slug: string;
  name: string;
  description: string;
  artifactType: Skill["artifactType"];
  digest: string;
  content: string;
  supportingFiles: string[];
}

export interface SkillRepository {
  findAll(opts?: { page?: number; perPage?: number; sort?: "name" | "createdAt" | "updatedAt" }): Skill[];
  findBySourceAndSlug(sourceSlug: string, slug: string): Skill | undefined;
  findBySource(sourceId: number): Skill[];
  upsertMany(skills: UpsertSkillInput[]): void;
  deleteBySource(sourceId: number): void;
  count(): number;
  /** Runs fn inside a single SQLite transaction. Callback MUST be synchronous — do not await inside. */
  transactionSync<T>(fn: () => T): T;
}

export interface SourceRepository {
  findAll(): Source[];
  findById(id: number): Source | undefined;
  findBySlug(slug: string): Source | undefined;
  create(input: CreateSourceInput): Source;
  updateSync(input: UpdateSourceSyncInput): void;
  delete(id: number): void;
}
