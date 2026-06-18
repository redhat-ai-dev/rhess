import type Database from "better-sqlite3";
import type { Skill, SkillRepository, UpsertSkillInput } from "./types.js";

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
  created_at: string;
  updated_at: string;
}

function parseSupportingFiles(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
    supportingFiles: parseSupportingFiles(row.supporting_files),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_SORT: Record<string, string> = {
  name: "name COLLATE NOCASE ASC",
  createdAt: "created_at ASC",
};

export class SqliteSkillRepository implements SkillRepository {
  private readonly findBySourceAndSlugStmt: Database.Statement<[string, string], SkillRow>;
  private readonly findBySourceStmt: Database.Statement<[number], SkillRow>;
  private readonly countStmt: Database.Statement<[], { n: number }>;
  private readonly upsertStmt: Database.Statement<[number, string, string, string, string, string, string, string, string]>;
  private readonly deleteBySourceStmt: Database.Statement<[number]>;

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
    this.upsertStmt = db.prepare<[number, string, string, string, string, string, string, string, string]>(
      `INSERT INTO skills
         (source_id, source_slug, slug, name, description, artifact_type, digest, content, supporting_files)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_id, slug) DO UPDATE SET
         name             = excluded.name,
         description      = excluded.description,
         artifact_type    = excluded.artifact_type,
         digest           = excluded.digest,
         content          = excluded.content,
         supporting_files = excluded.supporting_files,
         updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
    );
    this.deleteBySourceStmt = db.prepare<[number]>(
      "DELETE FROM skills WHERE source_id = ?"
    );
  }

  findAll(opts: { page?: number; perPage?: number; sort?: "name" | "createdAt" } = {}): Skill[] {
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
          JSON.stringify(s.supportingFiles)
        );
      }
    });
    upsert(skills);
  }

  deleteBySource(sourceId: number): void {
    this.deleteBySourceStmt.run(sourceId);
  }

  count(): number {
    return this.countStmt.get()!.n;
  }
}
