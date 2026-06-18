import type Database from "better-sqlite3";

interface Migration {
  version: number;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS sources (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        slug          TEXT    NOT NULL UNIQUE,
        url           TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        last_synced_at TEXT,
        sync_status   TEXT    NOT NULL DEFAULT 'idle'
                              CHECK (sync_status IN ('idle', 'syncing', 'error')),
        sync_error    TEXT
      );

      CREATE TABLE IF NOT EXISTS skills (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id        INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        source_slug      TEXT    NOT NULL,
        slug             TEXT    NOT NULL,
        name             TEXT    NOT NULL,
        description      TEXT    NOT NULL DEFAULT '',
        artifact_type    TEXT    NOT NULL DEFAULT 'skill-md'
                                 CHECK (artifact_type IN ('skill-md', 'archive')),
        digest           TEXT    NOT NULL DEFAULT '',
        content          TEXT    NOT NULL DEFAULT '',
        supporting_files TEXT    NOT NULL DEFAULT '[]',
        created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (source_id, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_skills_source_id   ON skills(source_id);
      CREATE INDEX IF NOT EXISTS idx_skills_source_slug ON skills(source_slug);
      CREATE INDEX IF NOT EXISTS idx_skills_name        ON skills(name COLLATE NOCASE);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  const getApplied = db.prepare<[], { version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  const applied = new Set(getApplied.all().map((r) => r.version));

  const insertVersion = db.prepare(
    "INSERT INTO schema_migrations (version) VALUES (?)"
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const apply = db.transaction(() => {
      db.exec(migration.up);
      insertVersion.run(migration.version);
    });
    apply();
  }
}
