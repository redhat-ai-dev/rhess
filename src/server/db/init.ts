import BetterSqlite3 from "better-sqlite3";
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

  const db = new BetterSqlite3(dbPath);

  // WAL mode for better concurrent read performance.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return {
    skills: new SqliteSkillRepository(db),
    sources: new SqliteSourceRepository(db),
  };
}
