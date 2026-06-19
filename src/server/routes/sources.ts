import type { FastifyPluginAsync } from "fastify";
import type { Repositories } from "../db/init.js";
import type { SearchProvider } from "../search/types.js";
import { ingestSource } from "../ingestion/ingest.js";

export interface SourcesRouteOptions {
  repos: Repositories;
  searchProvider?: SearchProvider;
}

/** Rebuild the Fuse.js search index from all skills currently in DB. */
function rebuildSearchIndex(repos: Repositories, searchProvider: SearchProvider): void {
  const allSkills = repos.skills.findAll({ perPage: 10000 });
  searchProvider.buildIndex(
    allSkills.map((s) => ({
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

const sourcesPlugin: FastifyPluginAsync<SourcesRouteOptions> = async (fastify, opts) => {
  const { repos, searchProvider } = opts;

  // POST /api/v1/sources
  fastify.post("/", async (req, reply) => {
    const body = req.body as { url?: unknown; slug?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : null;
    const slug = typeof body.slug === "string" ? body.slug.trim() : null;

    if (!slug || !isValidSlug(slug)) {
      return reply.code(400).send({
        error: {
          code: "INVALID_SLUG",
          message: "slug must be kebab-case (lowercase letters, digits, hyphens), 1–64 chars, no leading/trailing hyphens",
        },
      });
    }

    if (!url) {
      return reply.code(400).send({
        error: { code: "INVALID_URL", message: "url is required" },
      });
    }

    if (repos.sources.findBySlug(slug)) {
      return reply.code(409).send({
        error: { code: "SLUG_CONFLICT", message: `A source with slug "${slug}" already exists` },
      });
    }

    const source = repos.sources.create({ slug, url });

    try {
      const syncReport = await ingestSource(source.id, source.slug, url, repos);
      if (searchProvider) rebuildSearchIndex(repos, searchProvider);
      return reply.code(201).send({
        id: source.id,
        slug: source.slug,
        url: source.url,
        createdAt: source.createdAt,
        syncReport,
      });
    } catch (err) {
      repos.sources.delete(source.id);
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(422).send({
        error: { code: "CLONE_FAILED", message },
      });
    }
  });

  // DELETE /api/v1/sources/:id
  fastify.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || String(id) !== req.params.id) {
      return reply.code(400).send({
        error: { code: "INVALID_ID", message: "id must be a valid integer" },
      });
    }

    const source = repos.sources.findById(id);
    if (!source) {
      return reply.code(404).send({
        error: { code: "SOURCE_NOT_FOUND", message: `Source with id ${id} not found` },
      });
    }

    repos.sources.delete(id);
    if (searchProvider) rebuildSearchIndex(repos, searchProvider);
    return reply.code(200).send({ message: "Source deleted" });
  });

  // POST /api/v1/sources/:id/sync
  fastify.post<{ Params: { id: string } }>("/:id/sync", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || String(id) !== req.params.id) {
      return reply.code(400).send({
        error: { code: "INVALID_ID", message: "id must be a valid integer" },
      });
    }

    const source = repos.sources.findById(id);
    if (!source) {
      return reply.code(404).send({
        error: { code: "SOURCE_NOT_FOUND", message: `Source with id ${id} not found` },
      });
    }

    if (source.syncStatus === "syncing") {
      return reply.code(409).send({
        error: { code: "SYNC_IN_PROGRESS", message: "A sync is already in progress for this source" },
      });
    }

    repos.sources.updateSync({ id, status: "syncing" });

    try {
      const syncReport = await ingestSource(source.id, source.slug, source.url, repos);
      repos.sources.updateSync({ id, status: "idle", error: null });
      if (searchProvider) rebuildSearchIndex(repos, searchProvider);
      return reply.code(200).send(syncReport);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repos.sources.updateSync({ id, status: "error", error: message });
      return reply.code(422).send({
        error: { code: "CLONE_FAILED", message },
      });
    }
  });
};

export default sourcesPlugin;
