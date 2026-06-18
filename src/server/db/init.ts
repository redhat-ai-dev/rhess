import BetterSqlite3, { type Database } from "better-sqlite3";
import { existsSync, accessSync, constants } from "fs";
import { dirname } from "path";
import { runMigrations } from "./schema.js";
import { SqliteSkillRepository } from "./SqliteSkillRepository.js";
import { SqliteSourceRepository } from "./SqliteSourceRepository.js";
import type { SkillRepository, SourceRepository } from "./types.js";

export interface Repositories {
  skills: SkillRepository;
  sources: SourceRepository;
}

export function initDatabase(dbPath: string): Repositories {
  const dir = dirname(dbPath);

  // Fail fast: directory must exist and be writable.
  if (!existsSync(dir)) {
    process.stderr.write(
      `[RHESS] FATAL: Database directory does not exist: ${dir}\n`
    );
    process.exit(1);
  }

  try {
    accessSync(dir, constants.W_OK);
  } catch {
    process.stderr.write(
      `[RHESS] FATAL: Database directory is not writable: ${dir}\n`
    );
    process.exit(1);
  }

  // If the DB file already exists, verify it is writable too.
  if (existsSync(dbPath)) {
    try {
      accessSync(dbPath, constants.W_OK);
    } catch {
      process.stderr.write(
        `[RHESS] FATAL: Database file exists but is not writable: ${dbPath}\n`
      );
      process.exit(1);
    }
  }

  let db: Database;
  try {
    db = new BetterSqlite3(dbPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[RHESS] FATAL: Failed to open database at ${dbPath}: ${msg}\n`
    );
    process.exit(1);
  }

  // WAL mode for better concurrent read performance.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return {
    skills: new SqliteSkillRepository(db),
    sources: new SqliteSourceRepository(db),
  };
}
