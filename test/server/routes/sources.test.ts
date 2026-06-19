import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock clone so tests don't make real network calls
vi.mock("../../../src/server/ingestion/clone.js", () => ({
  clone: vi.fn().mockRejectedValue(new Error("CLONE_FAILED: simulated network failure")),
}));
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "../../../src/server/db/schema.js";
import { SqliteSkillRepository } from "../../../src/server/db/SqliteSkillRepository.js";
import { SqliteSourceRepository } from "../../../src/server/db/SqliteSourceRepository.js";
import type { Repositories } from "../../../src/server/db/init.js";
import sourcesPlugin from "../../../src/server/routes/sources.js";

function makeRepos(): Repositories {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return {
    skills: new SqliteSkillRepository(db),
    sources: new SqliteSourceRepository(db),
  };
}

async function buildTestServer(repos: Repositories): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(sourcesPlugin, { prefix: "/api/v1/sources", repos });
  return app;
}

describe("Source Management API", () => {
  let repos: Repositories;
  let app: FastifyInstance;

  beforeEach(async () => {
    repos = makeRepos();
    app = await buildTestServer(repos);
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/sources — validation
  // -------------------------------------------------------------------------

  it("6.4.1 — invalid slug format (uppercase/spaces) → 400 INVALID_SLUG", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources",
      headers: { "content-type": "application/json" },
      payload: { url: "https://example.com/repo.git", slug: "INVALID SLUG!" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("INVALID_SLUG");
  });

  it("6.4.1b — slug with uppercase letters → 400 INVALID_SLUG", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources",
      headers: { "content-type": "application/json" },
      payload: { url: "https://example.com/repo.git", slug: "MySource" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SLUG");
  });

  it("6.4.1c — slug exceeding 64 chars → 400 INVALID_SLUG", async () => {
    const longSlug = "a".repeat(65);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources",
      headers: { "content-type": "application/json" },
      payload: { url: "https://example.com/repo.git", slug: longSlug },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SLUG");
  });

  it("6.4.2 — duplicate slug → 409 SLUG_CONFLICT", async () => {
    repos.sources.create({ slug: "team-skills", url: "https://example.com/a" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources",
      headers: { "content-type": "application/json" },
      payload: { url: "https://example.com/b", slug: "team-skills" },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe("SLUG_CONFLICT");
  });

  it("6.4.3 — clone failure → 422 CLONE_FAILED, no source record created", async () => {
    const countBefore = repos.sources.findAll().length;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources",
      headers: { "content-type": "application/json" },
      payload: {
        url: "https://example.com/repo.git",
        slug: "clone-fail-test",
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("CLONE_FAILED");

    // No source record created — clone-before-create guarantees this
    expect(repos.sources.findAll().length).toBe(countBefore);
    expect(repos.sources.findBySlug("clone-fail-test")).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/sources/:id
  // -------------------------------------------------------------------------

  it("6.4.4 — DELETE unknown source → 404 SOURCE_NOT_FOUND", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/sources/99999",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("SOURCE_NOT_FOUND");
  });

  it("6.4.4b — DELETE existing source removes it and its skills (FK CASCADE)", async () => {
    const source = repos.sources.create({ slug: "to-delete", url: "https://example.com" });
    repos.skills.upsertMany([
      {
        sourceId: source.id,
        sourceSlug: source.slug,
        slug: "a-skill",
        name: "A Skill",
        description: "A description",
        artifactType: "skill-md",
        digest: "abc",
        content: "# A",
        supportingFiles: [],
      },
    ]);
    expect(repos.skills.findBySource(source.id)).toHaveLength(1);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/sources/${source.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("Source deleted");

    expect(repos.sources.findById(source.id)).toBeUndefined();
    expect(repos.skills.findBySource(source.id)).toHaveLength(0);
  });

  it("6.4.4c — DELETE with non-integer id → 400", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/sources/not-a-number",
    });
    expect(res.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/sources/:id/sync
  // -------------------------------------------------------------------------

  it("6.4.5 — sync unknown source → 404 SOURCE_NOT_FOUND", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources/99999/sync",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("SOURCE_NOT_FOUND");
  });

  it("6.4.6 — concurrent sync → 409 SYNC_IN_PROGRESS", async () => {
    const source = repos.sources.create({ slug: "sync-test", url: "https://example.com" });

    // Simulate a sync already in progress
    repos.sources.updateSync({ id: source.id, status: "syncing" });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/sources/${source.id}/sync`,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SYNC_IN_PROGRESS");
  });

  it("6.4.6b — sync with non-integer id → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sources/abc/sync",
    });
    expect(res.statusCode).toBe(400);
  });
});
