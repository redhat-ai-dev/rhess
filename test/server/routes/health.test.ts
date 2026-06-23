import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "../../../src/server/db/schema.js";
import { SqliteSkillRepository } from "../../../src/server/db/SqliteSkillRepository.js";
import type { SkillRepository } from "../../../src/server/db/types.js";
import probesPlugin from "../../../src/server/routes/probes.js";

function makeRealSkillRepo(): SkillRepository {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return new SqliteSkillRepository(db);
}

/** SkillRepository stub where count() throws to simulate a DB failure. */
function makeFailingSkillRepo(): SkillRepository {
  return {
    count: () => { throw new Error("SQLITE_CANTOPEN: unable to open database file"); },
  } as unknown as SkillRepository;
}

async function buildTestServer(skills: SkillRepository): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(probesPlugin, { skills });
  return app;
}

describe("Health & Readiness Probes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // 7.1 — /healthz
  it("returns 200 {status: ok} while process is running", async () => {
    app = await buildTestServer(makeRealSkillRepo());
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  // 7.2 — /readyz healthy path
  it("returns 200 {status: ok} when SQLite is reachable", async () => {
    app = await buildTestServer(makeRealSkillRepo());
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  // 7.3 — /readyz unhealthy path
  it("returns 503 {status: error} when SQLite is unreachable", async () => {
    app = await buildTestServer(makeFailingSkillRepo());
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "error", message: "database unavailable" });
  });

  // 7.3 — /healthz must remain 200 even when SQLite is unreachable
  it("healthz still returns 200 when SQLite is unreachable", async () => {
    app = await buildTestServer(makeFailingSkillRepo());
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
