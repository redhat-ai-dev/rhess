import type Database from "better-sqlite3";
import type {
  Source,
  SourceRepository,
  CreateSourceInput,
  UpdateSourceInput,
  UpdateSourceSyncInput,
} from "./types.js";

interface SourceRow {
  id: number;
  slug: string;
  label: string;
  url: string;
  created_at: string;
  last_synced_at: string | null;
  sync_status: Source["syncStatus"];
  sync_error: string | null;
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label ?? row.slug,
    url: row.url,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
  };
}

export class SqliteSourceRepository implements SourceRepository {
  private readonly findAllStmt: Database.Statement<[], SourceRow>;
  private readonly findByIdStmt: Database.Statement<[number], SourceRow>;
  private readonly findBySlugStmt: Database.Statement<[string], SourceRow>;
  private readonly createStmt: Database.Statement<[string, string, string], { id: number }>;
  private readonly updateStmt: Database.Statement<[string, string, number]>;
  private readonly updateSyncStmt: Database.Statement<[string, string, string | null, number]>;
  private readonly trySetSyncingStmt: Database.Statement<[number]>;
  private readonly deleteStmt: Database.Statement<[number]>;

  constructor(private readonly db: Database.Database) {
    this.findAllStmt = db.prepare<[], SourceRow>(
      "SELECT * FROM sources ORDER BY created_at ASC"
    );
    this.findByIdStmt = db.prepare<[number], SourceRow>(
      "SELECT * FROM sources WHERE id = ?"
    );
    this.findBySlugStmt = db.prepare<[string], SourceRow>(
      "SELECT * FROM sources WHERE slug = ?"
    );
    this.createStmt = db.prepare<[string, string, string], { id: number }>(
      "INSERT INTO sources (slug, label, url) VALUES (?, ?, ?) RETURNING id"
    );
    this.updateStmt = db.prepare<[string, string, number]>(
      "UPDATE sources SET label = ?, url = ? WHERE id = ?"
    );
    // last_synced_at is only updated to 'now' on success (status='idle');
    // for all other transitions the existing timestamp is preserved.
    this.updateSyncStmt = db.prepare<[string, string, string | null, number]>(
      `UPDATE sources
       SET sync_status    = ?,
           last_synced_at = CASE ? WHEN 'idle' THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE last_synced_at END,
           sync_error     = ?
       WHERE id = ?`
    );
    this.trySetSyncingStmt = db.prepare<[number]>(
      `UPDATE sources SET sync_status = 'syncing'
       WHERE id = ? AND sync_status != 'syncing'`
    );
    this.deleteStmt = db.prepare<[number]>(
      "DELETE FROM sources WHERE id = ?"
    );
  }

  findAll(): Source[] {
    return this.findAllStmt.all().map(toSource);
  }

  findById(id: number): Source | undefined {
    const row = this.findByIdStmt.get(id);
    return row ? toSource(row) : undefined;
  }

  findBySlug(slug: string): Source | undefined {
    const row = this.findBySlugStmt.get(slug);
    return row ? toSource(row) : undefined;
  }

  create(input: CreateSourceInput): Source {
    const row = this.createStmt.get(input.slug, input.label, input.url);
    if (!row) throw new Error("INSERT failed to return id");
    return this.findById(row.id)!;
  }

  update(input: UpdateSourceInput): Source | undefined {
    this.updateStmt.run(input.label, input.url, input.id);
    return this.findById(input.id);
  }

  updateSync(input: UpdateSourceSyncInput): void {
    this.updateSyncStmt.run(
      input.status,
      input.status,
      input.error ?? null,
      input.id
    );
  }

  trySetSyncing(id: number): boolean {
    return this.trySetSyncingStmt.run(id).changes > 0;
  }

  delete(id: number): void {
    this.deleteStmt.run(id);
  }
}
