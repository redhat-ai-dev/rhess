import { describe, it, expect, beforeEach } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "../../../src/server/db/schema.js";
import { SqliteSourceRepository } from "../../../src/server/db/SqliteSourceRepository.js";
import { SqliteSkillRepository } from "../../../src/server/db/SqliteSkillRepository.js";
import { FuseSearchProvider } from "../../../src/server/search/FuseSearchProvider.js";
import skillsPlugin from "../../../src/server/routes/skills.js";
import Fastify, { type FastifyError } from "fastify";
import type { FastifyInstance } from "fastify";

function makeDb() {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

async function buildTestServer() {
  const db = makeDb();
  const sources = new SqliteSourceRepository(db);
  const skills = new SqliteSkillRepository(db);
  const src = sources.create({ slug: "team-a", url: "https://example.com/repo" });

  const baseSkill = {
    sourceId: src.id,
    sourceSlug: "team-a",
    artifactType: "skill-md" as const,
    digest: "abc",
    content: "# React Patterns\nContent here.",
    supportingFiles: [],
  };

  skills.upsertMany([
    { ...baseSkill, slug: "react-patterns", name: "React Patterns", description: "Best practices for React" },
    { ...baseSkill, slug: "typescript-basics", name: "TypeScript Basics", description: "TypeScript fundamentals", digest: "def" },
    { ...baseSkill, slug: "vue-components", name: "Vue Components", description: "Building Vue.js components", digest: "ghi" },
  ]);

  const search = new FuseSearchProvider();
  search.buildIndex(
    skills.findAllUnpaged().map((s) => ({
      id: s.id,
      sourceSlug: s.sourceSlug,
      slug: s.slug,
      name: s.name,
      description: s.description,
    }))
  );

  const app = Fastify({ logger: false });

  // Mirror the global error handler from src/server/index.ts so that
  // AJV schema-validation errors are serialised as { error: { code, message } }
  // (matching the 400 response schemas defined on each route).
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status < 500) {
      const code = err.code === "FST_ERR_VALIDATION" ? "INVALID_PARAMS" : "BAD_REQUEST";
      return reply.code(status).send({ error: { code, message: err.message } });
    }
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "An internal error occurred." } });
  });

  await app.register(skillsPlugin, { prefix: "/api/v1/skills", skills, search });
  await app.ready();

  return { app, skills, sources };
}

describe("GET /api/v1/skills", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildTestServer());
  });

  it("returns paginated listing with defaults", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    expect(body.meta).toMatchObject({ page: 1, per_page: 20, total: 3 });
    expect(body.data[0]).toHaveProperty("id");
    expect(body.data[0]).toHaveProperty("name");
    expect(body.data[0]).toHaveProperty("source");
    expect(body.data[0]).toHaveProperty("slug");
    expect(body.data[0]).toHaveProperty("artifactType");
    expect(body.data[0]).toHaveProperty("digest");
  });

  it("paginates correctly", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?page=1&per_page=2" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({ page: 1, per_page: 2, total: 3 });
  });

  it("returns second page", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?page=2&per_page=2" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ page: 2, per_page: 2, total: 3 });
  });

  it("sorts by name by default (ascending)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?sort=name" });
    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((s: { name: string }) => s.name);
    expect(names).toEqual([...names].sort());
  });

  it("returns 400 for per_page=0", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?per_page=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_PARAMS" } });
  });

  it("returns 400 for per_page=999", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?per_page=999" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_PARAMS" } });
  });

  it("returns 400 for page=0", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?page=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_PARAMS" } });
  });

  it("returns 400 for invalid sort", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills?sort=invalid" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_PARAMS" } });
  });
});

describe("GET /api/v1/skills/:source/:slug", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildTestServer());
  });

  it("returns full skill detail for existing skill", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/team-a/react-patterns" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: expect.any(Number),
      source: "team-a",
      slug: "react-patterns",
      name: "React Patterns",
      description: "Best practices for React",
      artifactType: "skill-md",
      digest: "sha256:abc",
    });
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({ path: "SKILL.md", contents: expect.stringContaining("React Patterns") });
  });

  it("returns 404 for unknown skill", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/team-a/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "SKILL_NOT_FOUND" } });
  });

  it("returns 404 for unknown source", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/unknown-source/react-patterns" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "SKILL_NOT_FOUND" } });
  });
});

describe("GET /api/v1/skills/search", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildTestServer());
  });

  it("returns 400 when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search" });
    expect(res.statusCode).toBe(400);
    // Schema validation fires before the handler when q is absent entirely.
    expect(res.json()).toMatchObject({ error: { code: "INVALID_PARAMS" } });
  });

  it("returns 400 when q is empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search?q=" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "MISSING_QUERY" } });
  });

  it("returns matching results", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search?q=react" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("score");
    expect(body.data[0]).toHaveProperty("source");
    expect(body.data[0]).toHaveProperty("slug");
    expect(body.data[0]).toHaveProperty("name");
    expect(body.data[0]).toHaveProperty("description");
  });

  it("handles typos (fuzzy matching)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search?q=reakt" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns empty array for no matches", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search?q=xyzzy-no-match-12345" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ data: [] });
  });

  it("search route is not caught by /:source/:slug", async () => {
    // The word 'search' should not be interpreted as a source slug
    const res = await app.inject({ method: "GET", url: "/api/v1/skills/search?q=typescript" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("data");
  });
});

describe("GET /api/v1/skills/:source/:slug/artifact", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildTestServer());
  });

  it("serves skill-md artifact as text/markdown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/skills/team-a/react-patterns/artifact",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.payload).toContain("React Patterns");
  });

  it("returns 404 for unknown skill", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/skills/team-a/no-such-skill/artifact",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "SKILL_NOT_FOUND" } });
  });
});
