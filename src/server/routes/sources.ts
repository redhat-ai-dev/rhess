import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { Repositories } from "../db/init.js";
import type { SearchProvider } from "../search/types.js";
import type { Source } from "../db/types.js";
import { createAdminAuthHook } from "../plugins/adminAuth.js";
import { clone } from "../ingestion/clone.js";
import { ingestFromClonedPath, ingestSource } from "../ingestion/ingest.js";

export interface SourcesRouteOptions {
  repos: Repositories;
  searchProvider?: SearchProvider;
  adminToken: string;
}

/** Rebuild the Fuse.js search index from all skills currently in DB. */
function rebuildSearchIndex(repos: Repositories, searchProvider: SearchProvider): void {
  searchProvider.buildIndex(
    repos.skills.findAllUnpaged().map((s) => ({
      id: s.id,
      sourceSlug: s.sourceSlug,
      slug: s.slug,
      name: s.name,
      description: s.description,
    }))
  );
}

/** kebab-case: lowercase letters, digits, hyphens; 1–64 chars; no leading/trailing hyphens */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= 64 && SLUG_RE.test(slug);
}

/** Convert a user-supplied label to a valid slug: lowercase, collapse non-alnum to hyphens. */
function labelToSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sourceToResponse(source: Source, skillCount: number) {
  return {
    id: source.slug,
    path: source.url,
    label: source.label,
    url: source.url,
    lastSynced: source.lastSyncedAt,
    skillCount,
    status: source.syncStatus,
  };
}

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { code: { type: "string" }, message: { type: "string" } },
      required: ["code", "message"],
    },
  },
} as const;

const syncReportSchema = {
  type: "object",
  properties: {
    discovered: { type: "integer" },
    indexed: { type: "integer" },
    failed: { type: "integer" },
    failures: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
} as const;

const authSchema = { security: [{ bearerAuth: [] }] } as const;

/** Shape returned by sourceToResponse() — used across sources endpoints. */
const sourceSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Source slug (used as public identifier)" },
    path: { type: "string", description: "Git repository URL (alias for url)" },
    label: { type: "string", description: "Human-readable display name" },
    url: { type: "string", description: "Git repository URL" },
    lastSynced: { type: "string", nullable: true, description: "ISO 8601 timestamp of last successful sync" },
    skillCount: { type: "integer", description: "Number of indexed skills from this source" },
    status: { type: "string", enum: ["idle", "syncing", "error"], description: "Current sync status" },
  },
} as const;

const sourcesPlugin: FastifyPluginAsync<SourcesRouteOptions> = async (fastify, opts) => {
  const { repos, searchProvider, adminToken } = opts;
  const adminAuth = createAdminAuthHook(adminToken);

  // GET /api/v1/sources — list all sources with skill counts
  fastify.get("/", {
    schema: {
      tags: ["Sources"],
      summary: "List skill sources",
      description: "Returns all registered skill sources with their skill counts and sync status.",
        response: {
        200: {
          type: "object",
          properties: {
            sources: { type: "array", items: sourceSchema },
          },
          required: ["sources"],
        },
      },
    },
  }, async (_req, reply) => {
    const allSources = repos.sources.findAll();
    const sourcesWithCounts = allSources.map((s) => ({
      ...sourceToResponse(s, repos.skills.countBySourceId(s.id)),
    }));
    return reply.send({ sources: sourcesWithCounts });
  });

  // POST /api/v1/sources — register a new source
  // Accepts { path, label } (UI shape) or legacy { slug, url }
  fastify.post("/", {
    onRequest: adminAuth,
    schema: {
      tags: ["Sources"],
      summary: "Register a skill source",
      description: "Clones the given git repository, discovers SKILL.md files, and indexes them.",
      body: {
        type: "object",
        properties: {
          path: { type: "string", description: "HTTPS or SSH git URL (required if url is not supplied)" },
          label: { type: "string", description: "Display name; derived from URL if omitted" },
          url: { type: "string", description: "Legacy alias for path" },
          slug: { type: "string", description: "Legacy explicit slug; derived from label/path if omitted" },
        },
      },
      ...authSchema,
      response: {
        201: {
          type: "object",
          properties: {
            source: sourceSchema,
            syncReport: syncReportSchema,
          },
          required: ["source", "syncReport"],
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
        422: errorSchema,
      },
    },
  }, async (req, reply) => {
    const body = req.body as { path?: unknown; label?: unknown; url?: unknown; slug?: unknown };
    const url = (typeof body.path === "string" ? body.path : typeof body.url === "string" ? body.url : null)?.trim() ?? null;
    const rawLabel = (typeof body.label === "string" ? body.label : null)?.trim() ?? null;
    const slug = (typeof body.slug === "string" ? body.slug : rawLabel ? labelToSlug(rawLabel) : null);
    const label = rawLabel ?? slug ?? "";

    if (!slug || !isValidSlug(slug)) {
      return reply.code(400).send({
        error: {
          code: "INVALID_SLUG",
          message: "label must produce a valid kebab-case identifier (letters, digits, hyphens), 1–64 chars",
        },
      });
    }

    if (!url) {
      return reply.code(400).send({ error: { code: "INVALID_URL", message: "path (git URL) is required" } });
    }

    if (repos.sources.findBySlug(slug)) {
      return reply.code(409).send({
        error: { code: "SLUG_CONFLICT", message: `A source with slug "${slug}" already exists` },
      });
    }

    const tmpDir = path.join(os.tmpdir(), `rhess-register-${Date.now()}`);
    try {
      await clone(url, tmpDir);
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(422).send({ error: { code: "CLONE_FAILED", message } });
    }

    const source = repos.sources.create({ slug, label, url });
    try {
      const syncReport = await ingestFromClonedPath(source.id, source.slug, tmpDir, repos);
      repos.sources.updateSync({ id: source.id, status: "idle", error: null });
      if (searchProvider) rebuildSearchIndex(repos, searchProvider);
      const updatedSource = repos.sources.findById(source.id) ?? source;
      const skillCount = repos.skills.countBySourceId(source.id);
      return reply.code(201).send({
        source: sourceToResponse(updatedSource, skillCount),
        syncReport,
      });
    } catch (err) {
      repos.sources.delete(source.id);
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(422).send({ error: { code: "INGEST_FAILED", message } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // PUT /api/v1/sources/:id — update source label and/or URL
  fastify.put<{ Params: { id: string } }>("/:id", {
    onRequest: adminAuth,
    schema: {
      tags: ["Sources"],
      summary: "Update a skill source",
      description: "Updates the display label and/or git URL for a source. Does not re-sync.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Source slug" } },
      },
      body: {
        type: "object",
        properties: {
          path: { type: "string" },
          label: { type: "string" },
        },
      },
      ...authSchema,
      response: {
        200: {
          type: "object",
          properties: { source: sourceSchema },
          required: ["source"],
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
  }, async (req, reply) => {
    const source = repos.sources.findBySlug(req.params.id);
    if (!source) {
      return reply.code(404).send({
        error: { code: "SOURCE_NOT_FOUND", message: `Source '${req.params.id}' not found` },
      });
    }
    const body = req.body as { path?: unknown; label?: unknown };
    const url = typeof body.path === "string" ? body.path.trim() : source.url;
    const label = typeof body.label === "string" ? body.label.trim() : source.label;
    if (typeof body.path === "string" && !url) {
      return reply.code(400).send({ error: { code: "INVALID_URL", message: "path must not be empty" } });
    }
    if (typeof body.label === "string" && !label) {
      return reply.code(400).send({ error: { code: "INVALID_LABEL", message: "label must not be empty" } });
    }
    const updated = repos.sources.update({ id: source.id, label, url });
    if (!updated) {
      return reply.code(404).send({ error: { code: "SOURCE_NOT_FOUND", message: "Update failed" } });
    }
    const skillCount = repos.skills.countBySourceId(source.id);
    return reply.send({ source: sourceToResponse(updated, skillCount) });
  });

  // DELETE /api/v1/sources/:id — delete by slug
  fastify.delete<{ Params: { id: string } }>("/:id", {
    onRequest: adminAuth,
    schema: {
      tags: ["Sources"],
      summary: "Delete a skill source",
      description: "Removes the source record and all associated skills from the index.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Source slug" } },
      },
      ...authSchema,
      response: {
        200: { type: "object", properties: { ok: { type: "boolean" }, skillsRemoved: { type: "integer" } } },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
  }, async (req, reply) => {
    const source = repos.sources.findBySlug(req.params.id);
    if (!source) {
      return reply.code(404).send({
        error: { code: "SOURCE_NOT_FOUND", message: `Source '${req.params.id}' not found` },
      });
    }
    const skillsRemoved = repos.skills.countBySourceId(source.id);
    repos.sources.delete(source.id);
    if (searchProvider) rebuildSearchIndex(repos, searchProvider);
    return reply.code(200).send({ ok: true, skillsRemoved });
  });

  // POST /api/v1/sources/:id/sync — sync by slug
  fastify.post<{ Params: { id: string } }>("/:id/sync", {
    onRequest: adminAuth,
    schema: {
      tags: ["Sources"],
      summary: "Sync a skill source",
      description: "Re-clones the repository and re-indexes all skills. Rejects with 409 if a sync is already in progress.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Source slug" } },
      },
      ...authSchema,
      response: {
        200: {
          type: "object",
          properties: {
            synced: { type: "boolean" },
            count: { type: "integer" },
            lastSynced: { type: "string" },
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        422: errorSchema,
      },
    },
  }, async (req, reply) => {
    const source = repos.sources.findBySlug(req.params.id);
    if (!source) {
      return reply.code(404).send({
        error: { code: "SOURCE_NOT_FOUND", message: `Source '${req.params.id}' not found` },
      });
    }

    const locked = repos.sources.trySetSyncing(source.id);
    if (!locked) {
      return reply.code(409).send({
        error: { code: "SYNC_IN_PROGRESS", message: "A sync is already in progress for this source" },
      });
    }

    try {
      await ingestSource(source.id, source.slug, source.url, repos);
      repos.sources.updateSync({ id: source.id, status: "idle", error: null });
      if (searchProvider) rebuildSearchIndex(repos, searchProvider);
      const count = repos.skills.countBySourceId(source.id);
      const lastSynced = new Date().toISOString();
      return reply.code(200).send({ synced: true, count, lastSynced });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repos.sources.updateSync({ id: source.id, status: "error", error: message });
      return reply.code(422).send({ error: { code: "CLONE_FAILED", message } });
    }
  });
};

export default sourcesPlugin;
