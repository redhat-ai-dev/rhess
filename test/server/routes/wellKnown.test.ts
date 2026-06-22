import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "../../../src/server/db/schema.js";
import { SqliteSkillRepository } from "../../../src/server/db/SqliteSkillRepository.js";
import { SqliteSourceRepository } from "../../../src/server/db/SqliteSourceRepository.js";
import wellKnownPlugin from "../../../src/server/routes/wellKnown.js";

function makeRepos() {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  const sources = new SqliteSourceRepository(db);
  const skills = new SqliteSkillRepository(db);
  const src = sources.create({ slug: "team-a", url: "https://example.com/repo" });
  skills.upsertMany([
    {
      sourceId: src.id,
      sourceSlug: "team-a",
      slug: "react-patterns",
      name: "React Patterns",
      description: "Best practices for React",
      artifactType: "skill-md",
      digest: "abc123",
      content: "# React Patterns\nContent.",
      supportingFiles: [],
    },
    {
      sourceId: src.id,
      sourceSlug: "team-a",
      slug: "ts-utils",
      name: "TypeScript Utils",
      description: "Utility helpers",
      artifactType: "skill-md",
      digest: "def456",
      content: "# TS Utils\nContent.",
      supportingFiles: [],
    },
  ]);
  return skills;
}

async function buildTestServer(): Promise<FastifyInstance> {
  const skills = makeRepos();
  const app = Fastify({ logger: false });
  await app.register(wellKnownPlugin, { prefix: "/.well-known", skills });
  await app.ready();
  return app;
}

describe("GET /.well-known/agent-skills/index.json", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with valid v0.2.0 schema shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("$schema");
    expect(body.$schema).toContain("v0.2.0");
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it("lists all indexed skills", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    const { skills } = res.json();
    expect(skills).toHaveLength(2);
  });

  it("each entry has required fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    const { skills } = res.json();
    for (const s of skills) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("type");
      expect(s).toHaveProperty("description");
      expect(s).toHaveProperty("url");
      expect(s).toHaveProperty("digest");
    }
  });

  it("digest is sha256-prefixed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    const { skills } = res.json();
    for (const s of skills) {
      expect(s.digest).toMatch(/^sha256:/);
    }
  });

  it("url points to artifact endpoint for each skill", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    const { skills } = res.json();
    const reactSkill = skills.find((s: { slug: string }) => s.slug === "react-patterns") ??
      skills.find((s: { url: string }) => s.url.includes("react-patterns"));
    expect(reactSkill.url).toMatch(/\/api\/v1\/skills\/team-a\/react-patterns\/artifact$/);
  });

  it("type is skill-md or archive", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/agent-skills/index.json",
    });
    const { skills } = res.json();
    for (const s of skills) {
      expect(["skill-md", "archive"]).toContain(s.type);
    }
  });
});
