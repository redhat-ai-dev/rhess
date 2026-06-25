import type Database from "better-sqlite3";
import type { Skill, SkillDiscoveryEntry, SkillRepository, UpsertSkillInput } from "./types.js";

interface SkillRow {
  id: number;
  source_id: number;
  source_slug: string;
  slug: string;
  name: string;
  description: string;
  artifact_type: Skill["artifactType"];
  digest: string;
  content: string;
  supporting_files: string;
  allowed_tools: string;
  skill_path: string;
  category: string | null;
  frontmatter: string;
  created_at: string;
  updated_at: string;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceSlug: row.source_slug,
    slug: row.slug,
    name: row.name,
    description: row.description,
    artifactType: row.artifact_type,
    digest: row.digest,
    content: row.content,
    supportingFiles: parseJsonArray(row.supporting_files),
    allowedTools: parseJsonArray(row.allowed_tools ?? "[]"),
    skillPath: row.skill_path ?? "",
    category: row.category ?? null,
    frontmatter: parseJsonObject(row.frontmatter ?? "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_SORT: Record<string, string> = {
  name: "name COLLATE NOCASE ASC",
  createdAt: "created_at ASC",
  updatedAt: "updated_at DESC",
};

export class SqliteSkillRepository implements SkillRepository {
  private readonly findBySourceAndSlugStmt: Database.Statement<[string, string], SkillRow>;
  private readonly findBySourceStmt: Database.Statement<[number], SkillRow>;
  private readonly countStmt: Database.Statement<[], { n: number }>;
  private readonly countBySourceIdStmt: Database.Statement<[number], { n: number }>;
  private readonly upsertStmt: Database.Statement;
  private readonly deleteBySourceStmt: Database.Statement<[number]>;
  private readonly deleteBySourceAndSlugStmt: Database.Statement<[string, string]>;

  constructor(private readonly db: Database.Database) {
    this.findBySourceAndSlugStmt = db.prepare<[string, string], SkillRow>(
      "SELECT * FROM skills WHERE source_slug = ? AND slug = ?"
    );
    this.findBySourceStmt = db.prepare<[number], SkillRow>(
      "SELECT * FROM skills WHERE source_id = ? ORDER BY name COLLATE NOCASE ASC"
    );
    this.countStmt = db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM skills"
    );
    this.countBySourceIdStmt = db.prepare<[number], { n: number }>(
      "SELECT COUNT(*) AS n FROM skills WHERE source_id = ?"
    );
    this.upsertStmt = db.prepare(
      `INSERT INTO skills
         (source_id, source_slug, slug, name, description, artifact_type, digest, content,
          supporting_files, allowed_tools, skill_path, category, frontmatter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_id, slug) DO UPDATE SET
         name             = excluded.name,
         description      = excluded.description,
         artifact_type    = excluded.artifact_type,
         digest           = excluded.digest,
         content          = excluded.content,
         supporting_files = excluded.supporting_files,
         allowed_tools    = excluded.allowed_tools,
         skill_path       = excluded.skill_path,
         category         = excluded.category,
         frontmatter      = excluded.frontmatter,
         updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
    );
    this.deleteBySourceStmt = db.prepare<[number]>(
      "DELETE FROM skills WHERE source_id = ?"
    );
    this.deleteBySourceAndSlugStmt = db.prepare<[string, string]>(
      "DELETE FROM skills WHERE source_slug = ? AND slug = ?"
    );
  }

  findAllUnpaged(sort: "name" | "createdAt" | "updatedAt" = "name"): Skill[] {
    const orderBy = VALID_SORT[sort] ?? VALID_SORT["name"]!;
    const stmt = this.db.prepare<[], SkillRow>(
      `SELECT * FROM skills ORDER BY ${orderBy}`
    );
    return stmt.all().map(toSkill);
  }

  findAllDiscoveryEntries(): SkillDiscoveryEntry[] {
    interface DiscoveryRow {
      source_slug: string;
      slug: string;
      name: string;
      description: string;
      artifact_type: Skill["artifactType"];
      digest: string;
    }
    const stmt = this.db.prepare<[], DiscoveryRow>(
      `SELECT source_slug, slug, name, description, artifact_type, digest
       FROM skills ORDER BY name COLLATE NOCASE ASC`
    );
    return stmt.all().map((r) => ({
      sourceSlug: r.source_slug,
      slug: r.slug,
      name: r.name,
      description: r.description,
      artifactType: r.artifact_type,
      digest: r.digest,
    }));
  }

  findAll(opts: { page?: number; perPage?: number; sort?: "name" | "createdAt" | "updatedAt" } = {}): Skill[] {
    const { page = 1, perPage = 20, sort = "name" } = opts;
    const orderBy = VALID_SORT[sort] ?? VALID_SORT["name"]!;
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePerPage = Number.isFinite(perPage)
      ? Math.min(100, Math.max(1, Math.floor(perPage)))
      : 20;
    const offset = (safePage - 1) * safePerPage;
    const stmt = this.db.prepare<[number, number], SkillRow>(
      `SELECT * FROM skills ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    );
    return stmt.all(safePerPage, offset).map(toSkill);
  }

  findBySourceAndSlug(sourceSlug: string, slug: string): Skill | undefined {
    const row = this.findBySourceAndSlugStmt.get(sourceSlug, slug);
    return row ? toSkill(row) : undefined;
  }

  findBySource(sourceId: number): Skill[] {
    return this.findBySourceStmt.all(sourceId).map(toSkill);
  }

  countBySourceId(sourceId: number): number {
    return this.countBySourceIdStmt.get(sourceId)!.n;
  }

  upsertMany(skills: UpsertSkillInput[]): void {
    const upsert = this.db.transaction((items: UpsertSkillInput[]) => {
      for (const s of items) {
        this.upsertStmt.run(
          s.sourceId,
          s.sourceSlug,
          s.slug,
          s.name,
          s.description,
          s.artifactType,
          s.digest,
          s.content,
          JSON.stringify(s.supportingFiles),
          JSON.stringify(s.allowedTools),
          s.skillPath,
          s.category ?? null,
          JSON.stringify(s.frontmatter)
        );
      }
    });
    upsert(skills);
  }

  deleteBySource(sourceId: number): void {
    this.deleteBySourceStmt.run(sourceId);
  }

  deleteBySourceAndSlug(sourceSlug: string, slug: string): void {
    this.deleteBySourceAndSlugStmt.run(sourceSlug, slug);
  }

  count(): number {
    return this.countStmt.get()!.n;
  }

  transactionSync<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
