import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { simpleGit } from "simple-git";
import { runMigrations } from "../../../src/server/db/schema.js";
import { SqliteSkillRepository } from "../../../src/server/db/SqliteSkillRepository.js";
import { SqliteSourceRepository } from "../../../src/server/db/SqliteSourceRepository.js";
import type { Repositories } from "../../../src/server/db/init.js";
import { ingestFromClonedPath } from "../../../src/server/ingestion/ingest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepos(): Repositories {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return {
    skills: new SqliteSkillRepository(db),
    sources: new SqliteSourceRepository(db),
  };
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rhess-test-"));
}

async function initRepo(dir: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
}

async function commitAll(dir: string, message = "add skills"): Promise<void> {
  const git = simpleGit(dir);
  await git.add(".");
  await git.commit(message);
}

function writeSkill(dir: string, discoveryPath: string, skillName: string, content: string): void {
  const skillDir = path.join(dir, discoveryPath, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

const VALID_SKILL_A = `---
name: Alpha Skill
description: Does alpha things.
---

# Alpha Skill

This skill does alpha things.
`;

const VALID_SKILL_B = `---
name: Beta Skill
description: Does beta things.
---

# Beta Skill

This skill does beta things.
`;

const VALID_SKILL_C = `---
name: Gamma Skill
description: Does gamma things.
---

# Gamma Skill

This skill does gamma things.
`;

const MALFORMED_SKILL = `# No frontmatter here

This is a skill without YAML frontmatter.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestFromClonedPath", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("scenario 1: valid repo → skills indexed", async () => {
    tmpDir = makeTmpDir();
    await initRepo(tmpDir);

    // Place 2 valid skills in different discovery paths
    writeSkill(tmpDir, "skills", "alpha-skill", VALID_SKILL_A);
    writeSkill(tmpDir, ".claude/skills", "beta-skill", VALID_SKILL_B);
    await commitAll(tmpDir);

    const repos = makeRepos();
    const source = repos.sources.create({ slug: "test-source", url: "file:///test" });
    const report = await ingestFromClonedPath(source.id, source.slug, tmpDir, repos);

    expect(report.discovered).toBe(2);
    expect(report.indexed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.failures).toHaveLength(0);

    const allSkills = repos.skills.findAll({ perPage: 100 });
    expect(allSkills).toHaveLength(2);
    const slugs = allSkills.map((s) => s.slug).sort();
    expect(slugs).toContain("alpha-skill");
    expect(slugs).toContain("beta-skill");
  });

  it("scenario 2: malformed frontmatter → skipped + reported", async () => {
    tmpDir = makeTmpDir();
    await initRepo(tmpDir);

    writeSkill(tmpDir, "skills", "alpha-skill", VALID_SKILL_A);
    writeSkill(tmpDir, "skills", "broken-skill", MALFORMED_SKILL);
    await commitAll(tmpDir);

    const repos = makeRepos();
    const source = repos.sources.create({ slug: "test-source", url: "file:///test" });
    const report = await ingestFromClonedPath(source.id, source.slug, tmpDir, repos);

    expect(report.discovered).toBe(2);
    expect(report.indexed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.reason).toMatch(/frontmatter/i);

    const allSkills = repos.skills.findAll({ perPage: 100 });
    expect(allSkills).toHaveLength(1);
    expect(allSkills[0]!.slug).toBe("alpha-skill");
  });

  it("scenario 3: re-sync → atomic replace", async () => {
    tmpDir = makeTmpDir();
    await initRepo(tmpDir);

    // First sync: 2 skills
    writeSkill(tmpDir, "skills", "alpha-skill", VALID_SKILL_A);
    writeSkill(tmpDir, "skills", "beta-skill", VALID_SKILL_B);
    await commitAll(tmpDir, "initial commit");

    const repos = makeRepos();
    const source = repos.sources.create({ slug: "test-source", url: "file:///test" });
    const report1 = await ingestFromClonedPath(source.id, source.slug, tmpDir, repos);
    expect(report1.indexed).toBe(2);

    // Modify repo: remove alpha, add gamma
    fs.rmSync(path.join(tmpDir, "skills", "alpha-skill"), { recursive: true, force: true });
    writeSkill(tmpDir, "skills", "gamma-skill", VALID_SKILL_C);
    await commitAll(tmpDir, "update skills");

    // Second sync: should replace catalog atomically
    const report2 = await ingestFromClonedPath(source.id, source.slug, tmpDir, repos);
    expect(report2.indexed).toBe(2);
    expect(report2.failed).toBe(0);

    const allSkills = repos.skills.findAll({ perPage: 100 });
    expect(allSkills).toHaveLength(2);
    const slugs = allSkills.map((s) => s.slug).sort();
    expect(slugs).toEqual(["beta-skill", "gamma-skill"]);
    // alpha-skill must be gone
    expect(slugs).not.toContain("alpha-skill");
  });
});
