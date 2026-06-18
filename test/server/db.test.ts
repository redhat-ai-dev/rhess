import { describe, it, expect, beforeEach } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "../../src/server/db/schema.js";
import { SqliteSourceRepository } from "../../src/server/db/SqliteSourceRepository.js";
import { SqliteSkillRepository } from "../../src/server/db/SqliteSkillRepository.js";

function makeDb() {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("SqliteSourceRepository", () => {
  let sources: SqliteSourceRepository;

  beforeEach(() => {
    sources = new SqliteSourceRepository(makeDb());
  });

  it("starts empty", () => {
    expect(sources.findAll()).toHaveLength(0);
  });

  it("creates a source and retrieves by id and slug", () => {
    const created = sources.create({ slug: "team-skills", url: "https://github.com/acme/skills" });
    expect(created.slug).toBe("team-skills");
    expect(created.syncStatus).toBe("idle");

    expect(sources.findById(created.id)).toMatchObject({ slug: "team-skills" });
    expect(sources.findBySlug("team-skills")).toMatchObject({ id: created.id });
  });

  it("rejects duplicate slugs", () => {
    sources.create({ slug: "dupe", url: "https://example.com/a" });
    expect(() => sources.create({ slug: "dupe", url: "https://example.com/b" })).toThrow();
  });

  it("updates sync status to syncing then idle", () => {
    const s = sources.create({ slug: "s1", url: "https://example.com" });
    sources.updateSync({ id: s.id, status: "syncing" });
    expect(sources.findById(s.id)?.syncStatus).toBe("syncing");
    expect(sources.findById(s.id)?.lastSyncedAt).toBeNull();

    sources.updateSync({ id: s.id, status: "idle" });
    expect(sources.findById(s.id)?.lastSyncedAt).not.toBeNull();
  });

  it("records error on sync failure", () => {
    const s = sources.create({ slug: "err-src", url: "https://bad.example.com" });
    sources.updateSync({ id: s.id, status: "error", error: "clone failed" });
    const updated = sources.findById(s.id);
    expect(updated?.syncStatus).toBe("error");
    expect(updated?.syncError).toBe("clone failed");
  });

  it("deletes a source", () => {
    const s = sources.create({ slug: "to-delete", url: "https://example.com" });
    sources.delete(s.id);
    expect(sources.findById(s.id)).toBeUndefined();
  });
});

describe("SqliteSkillRepository", () => {
  let db: ReturnType<typeof makeDb>;
  let sources: SqliteSourceRepository;
  let skills: SqliteSkillRepository;

  beforeEach(() => {
    db = makeDb();
    sources = new SqliteSourceRepository(db);
    skills = new SqliteSkillRepository(db);
  });

  function seedSource(slug = "acme") {
    return sources.create({ slug, url: "https://github.com/acme/skills" });
  }

  const baseSkill = {
    sourceSlug: "acme",
    slug: "react-patterns",
    name: "React Patterns",
    description: "Best practices for React",
    artifactType: "skill-md" as const,
    digest: "abc123",
    content: "# React Patterns\nContent here.",
    supportingFiles: [],
  };

  it("starts empty", () => {
    expect(skills.count()).toBe(0);
    expect(skills.findAll()).toHaveLength(0);
  });

  it("upserts skills and retrieves them", () => {
    const src = seedSource();
    skills.upsertMany([{ ...baseSkill, sourceId: src.id }]);

    expect(skills.count()).toBe(1);
    const found = skills.findBySourceAndSlug("acme", "react-patterns");
    expect(found?.name).toBe("React Patterns");
    expect(found?.content).toBe("# React Patterns\nContent here.");
  });

  it("updates skill on re-upsert", () => {
    const src = seedSource();
    skills.upsertMany([{ ...baseSkill, sourceId: src.id }]);
    skills.upsertMany([{ ...baseSkill, sourceId: src.id, name: "React Patterns v2", digest: "def456" }]);

    expect(skills.count()).toBe(1);
    expect(skills.findBySourceAndSlug("acme", "react-patterns")?.name).toBe("React Patterns v2");
    expect(skills.findBySourceAndSlug("acme", "react-patterns")?.digest).toBe("def456");
  });

  it("paginates findAll", () => {
    const src = seedSource();
    skills.upsertMany(
      Array.from({ length: 5 }, (_, i) => ({
        ...baseSkill,
        sourceId: src.id,
        slug: `skill-${i}`,
        name: `Skill ${i}`,
        digest: `d${i}`,
      }))
    );

    expect(skills.findAll({ page: 1, perPage: 2 })).toHaveLength(2);
    expect(skills.findAll({ page: 3, perPage: 2 })).toHaveLength(1);
  });

  it("finds skills by source", () => {
    const s1 = seedSource("source-a");
    const s2 = seedSource("source-b");
    skills.upsertMany([{ ...baseSkill, sourceId: s1.id, sourceSlug: "source-a", slug: "sk-a" }]);
    skills.upsertMany([{ ...baseSkill, sourceId: s2.id, sourceSlug: "source-b", slug: "sk-b" }]);

    expect(skills.findBySource(s1.id)).toHaveLength(1);
    expect(skills.findBySource(s2.id)).toHaveLength(1);
  });

  it("deleteBySource removes only that source's skills", () => {
    const s1 = seedSource("source-a");
    const s2 = seedSource("source-b");
    skills.upsertMany([{ ...baseSkill, sourceId: s1.id, sourceSlug: "source-a", slug: "sk-a" }]);
    skills.upsertMany([{ ...baseSkill, sourceId: s2.id, sourceSlug: "source-b", slug: "sk-b" }]);

    skills.deleteBySource(s1.id);
    expect(skills.count()).toBe(1);
    expect(skills.findBySourceAndSlug("source-b", "sk-b")).toBeDefined();
  });

  it("cascade-deletes skills when source is deleted", () => {
    const src = seedSource();
    skills.upsertMany([{ ...baseSkill, sourceId: src.id }]);
    expect(skills.count()).toBe(1);

    sources.delete(src.id);
    expect(skills.count()).toBe(0);
  });

  it("returns undefined for unknown source+slug", () => {
    expect(skills.findBySourceAndSlug("no-source", "no-skill")).toBeUndefined();
  });
});
