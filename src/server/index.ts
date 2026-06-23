import Fastify, { type FastifyError } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./db/init.js";
import type { Repositories } from "./db/init.js";
import { loadExamplesIfEmpty } from "./ingestion/examples.js";
import { FuseSearchProvider } from "./search/FuseSearchProvider.js";
import skillsPlugin from "./routes/skills.js";
import sourcesPlugin from "./routes/sources.js";
import wellKnownPlugin from "./routes/wellKnown.js";
import probesPlugin from "./routes/probes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const UI_DIST = resolve(__dirname, "../../dist/ui");

function requireAdminToken(): string {
  const token = process.env["RHESS_ADMIN_TOKEN"]?.trim();
  if (!token) {
    process.stderr.write(
      "[RHESS] FATAL: RHESS_ADMIN_TOKEN is not set or empty. " +
        "Set this environment variable before starting the server.\n"
    );
    process.exit(1);
  }
  return token;
}

function parseCorsOrigin(): string | string[] | boolean {
  const raw = process.env["ALLOWED_ORIGINS"];
  if (!raw || raw.trim() === "" || raw.trim() === "*") return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

// Paths that must never fall through to the SPA — return a real 404 JSON.
const NON_SPA_PREFIXES = ["/api/", "/.well-known/", "/healthz", "/readyz", "/documentation"];

function isApiPath(url: string): boolean {
  return NON_SPA_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

function isBrowserNavigation(req: { method: string; headers: Record<string, string | string[] | undefined> }): boolean {
  if (req.method !== "GET") return false;
  const accept = req.headers["accept"] ?? "";
  return Array.isArray(accept)
    ? accept.some((v) => v.includes("text/html"))
    : accept.includes("text/html");
}

export async function buildServer(repos?: Repositories) {
  const adminToken = requireAdminToken();

  const DB_PATH = process.env["DATABASE_PATH"] ?? "./rhess.db";
  const db = repos ?? initDatabase(DB_PATH);

  await loadExamplesIfEmpty(db);

  const app = Fastify({ logger: true });

  // Global error handler: all errors return {error: {code, message}}
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status < 500) {
      const code = err.code === "FST_ERR_VALIDATION" ? "INVALID_PARAMS" : "BAD_REQUEST";
      return reply.code(status).send({ error: { code, message: err.message } });
    }
    app.log.error(err);
    return reply
      .code(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "An internal error occurred." } });
  });

  await app.register(fastifyCors, { origin: parseCorsOrigin() });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "RHESS — Red Hat Enterprise Skills Server",
        description:
          "Self-hosted AI agent skills directory. " +
          "Skills Catalog and Discovery endpoints are unauthenticated. " +
          "Source management (write) endpoints require `Authorization: Bearer <RHESS_ADMIN_TOKEN>`.",
        version: "0.1.0",
      },
      tags: [
        { name: "Skills", description: "Browse and search the skill catalog" },
        { name: "Sources", description: "Manage skill sources (admin token required on write routes)" },
        { name: "Discovery", description: "Agent Skills CLI discovery and artifact download" },
        { name: "Ops", description: "Health and readiness probes" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Value of the RHESS_ADMIN_TOKEN environment variable",
          },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/documentation",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Build Fuse.js search index from the current catalog
  const searchProvider = new FuseSearchProvider();
  searchProvider.buildIndex(
    db.skills.findAllUnpaged().map((s) => ({
      id: s.id,
      sourceSlug: s.sourceSlug,
      slug: s.slug,
      name: s.name,
      description: s.description,
    }))
  );

  // Health and readiness probes
  await app.register(probesPlugin, { skills: db.skills });

  // Skills catalog read API
  await app.register(skillsPlugin, {
    prefix: "/api/v1/skills",
    skills: db.skills,
    search: searchProvider,
  });

  // Well-known Agent Skills discovery index
  await app.register(wellKnownPlugin, {
    prefix: "/.well-known",
    skills: db.skills,
  });

  // Source management API
  await app.register(sourcesPlugin, {
    prefix: "/api/v1/sources",
    repos: db,
    searchProvider,
    adminToken,
  });

  await app.register(fastifyStatic, {
    root: UI_DIST,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback: only for browser GET requests that aren't operational/API paths.
  app.setNotFoundHandler(async (req, reply) => {
    if (!isApiPath(req.url) && isBrowserNavigation(req)) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  return { app, searchProvider };
}

// Only start the server when this file is the entry point (not imported as a module).
import { pathToFileURL } from "url";
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { app } = await buildServer();
  await app.listen({ port: PORT, host: "0.0.0.0" });
}
