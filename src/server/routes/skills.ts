import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "tar";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { SkillRepository, Skill, Source } from "../db/types.js";
import type { SearchProvider } from "../search/types.js";
import type { Repositories } from "../db/init.js";
import { createAdminAuthHook } from "../plugins/adminAuth.js";
import { ingestSource } from "../ingestion/ingest.js";

/**
 * Decode a base64 tar.gz archive and return all contained files as
 * {path, contents} entries, with SKILL.md sorted first.
 */
async function expandArchiveToFiles(
  base64Content: string
): Promise<Array<{ path: string; contents: string }>> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rhess-skill-"));
  try {
    const buf = Buffer.from(base64Content, "base64");
    const tmpFile = path.join(tmpDir, "_archive.tar.gz");
    fs.writeFileSync(tmpFile, buf);
    await extract({ file: tmpFile, cwd: tmpDir });

    const entries: Array<{ path: string; contents: string }> = [];
    const walk = (dir: string, relBase: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absPath = path.join(dir, entry.name);
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(absPath, relPath);
        } else if (entry.name !== "_archive.tar.gz") {
          entries.push({ path: relPath, contents: fs.readFileSync(absPath, "utf-8") });
        }
      }
    };
    walk(tmpDir, "");

    entries.sort((a, b) => {
      if (a.path.toLowerCase() === "skill.md") return -1;
      if (b.path.toLowerCase() === "skill.md") return 1;
      return a.path.localeCompare(b.path);
    });
    return entries;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Derive the server's public base URL for constructing install commands.
 * Mirrors the logic in wellKnown.ts.
 */
function resolveBaseUrl(req: FastifyRequest): string {
  const configured = process.env["PUBLIC_BASE_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  const raw = req.headers.host;
  const host = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? req.hostname;
  return `${req.protocol}://${host}`;
}

function skillToResponse(skill: Skill, source: Source | undefined, baseUrl: string) {
  const installCommand = `npx skills add ${baseUrl}/api/v1/skills/${encodeURIComponent(skill.sourceSlug)}/${encodeURIComponent(skill.slug)}/artifact`;
  return {
    id: skill.id,
    source: skill.sourceSlug,
    sourceLabel: source?.label ?? skill.sourceSlug,
    sourceUrl: source?.url ?? null,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    artifactType: skill.artifactType,
    digest: `sha256:${skill.digest}`,
    category: skill.category,
    allowedTools: skill.allowedTools,
    skillPath: skill.skillPath,
    frontmatter: skill.frontmatter,
    installCommand,
    lastModified: skill.updatedAt,
  };
}

interface SkillsRouteOptions {
  repos: Repositories;
  search: SearchProvider;
  adminToken: string;
}

function invalidParams(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: { code: "INVALID_PARAMS", message } });
}

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
} as const;

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

const skillsPlugin: FastifyPluginAsync<SkillsRouteOptions> = async (fastify, opts) => {
  const { repos, search, adminToken } = opts;
  const { skills, sources } = repos;
  const adminAuth = createAdminAuthHook(adminToken);

  // Search must be registered BEFORE /:source/:slug to avoid path conflict
  fastify.get(
    "/search",
    {
      schema: {
        tags: ["Skills"],
        summary: "Fuzzy search skills",
        description: "Full-text fuzzy search over skill names, descriptions, and source identifiers.",
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "integer" },
              query: { type: "string" },
            },
          },
          400: errorSchema,
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: { q?: string } }>,
      reply: FastifyReply
    ) => {
      const { q } = req.query;
      if (!q || q.trim() === "") {
        return reply
          .code(400)
          .send({ error: { code: "MISSING_QUERY", message: "Query parameter 'q' is required." } });
      }

      const baseUrl = resolveBaseUrl(req);
      const sourceMap = new Map(sources.findAll().map((s) => [s.slug, s]));
      const results = search.search(q.trim());
      const enriched = results.map((r) => {
        const skill = skills.findBySourceAndSlug(r.sourceSlug, r.slug);
        if (!skill) return null;
        return skillToResponse(skill, sourceMap.get(skill.sourceSlug), baseUrl);
      }).filter(Boolean);

      return reply.send({ data: enriched, total: enriched.length, query: q });
    }
  );

  // Paginated listing
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Skills"],
        summary: "List all skills",
        description: "Returns a paginated list of all indexed skills.",
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            per_page: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            sort: { type: "string", enum: ["name", "updated_at"], default: "name" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array", items: { type: "object", additionalProperties: true } },
              meta: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  page: { type: "integer" },
                  per_page: { type: "integer" },
                  total_pages: { type: "integer" },
                  sort: { type: "string" },
                },
              },
            },
          },
          400: errorSchema,
        },
      },
    },
    async (
      req: FastifyRequest<{
        Querystring: { page?: string; per_page?: string; sort?: string };
      }>,
      reply: FastifyReply
    ) => {
      const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
      const rawPerPage = req.query.per_page !== undefined ? Number(req.query.per_page) : 20;
      const rawSort = req.query.sort ?? "name";

      if (!Number.isInteger(rawPage) || rawPage < 1) {
        return invalidParams(reply, "'page' must be a positive integer.");
      }
      if (!Number.isInteger(rawPerPage) || rawPerPage < 1 || rawPerPage > 100) {
        return invalidParams(reply, "'per_page' must be an integer between 1 and 100.");
      }
      if (rawSort !== "name" && rawSort !== "updated_at") {
        return invalidParams(reply, "'sort' must be 'name' or 'updated_at'.");
      }

      const sort = rawSort === "updated_at" ? "updatedAt" : "name";
      const baseUrl = resolveBaseUrl(req);
      const sourceMap = new Map(sources.findAll().map((s) => [s.slug, s]));

      const data = skills.findAll({ page: rawPage, perPage: rawPerPage, sort });
      const total = skills.count();
      const total_pages = Math.ceil(total / rawPerPage);

      return reply.send({
        data: data.map((s) => skillToResponse(s, sourceMap.get(s.sourceSlug), baseUrl)),
        meta: { total, page: rawPage, per_page: rawPerPage, total_pages, sort: rawSort },
      });
    }
  );

  // Artifact download — registered before /:source/:slug (static suffix wins)
  fastify.get(
    "/:source/:slug/artifact",
    {
      schema: {
        tags: ["Discovery"],
        summary: "Download skill artifact",
        description: "Returns the raw artifact: `text/markdown` for single-file skills, `application/gzip` (tar.gz) for multi-file skills.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string" },
            slug: { type: "string" },
          },
        },
        response: {
          200: { description: "Raw artifact.", type: "string" },
          404: errorSchema,
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { source: string; slug: string } }>,
      reply: FastifyReply
    ) => {
      const { source, slug } = req.params;
      const skill = skills.findBySourceAndSlug(source, slug);

      if (!skill) {
        return reply.code(404).send({
          error: { code: "SKILL_NOT_FOUND", message: `Skill '${source}/${slug}' not found.` },
        });
      }

      if (skill.artifactType === "skill-md") {
        return reply
          .header("Content-Type", "text/markdown; charset=utf-8")
          .header("Content-Disposition", `inline; filename="SKILL.md"`)
          .send(skill.content);
      }

      const buf = Buffer.from(skill.content, "base64");
      return reply
        .header("Content-Type", "application/gzip")
        .header("Content-Disposition", `attachment; filename="${slug}.tar.gz"`)
        .send(buf);
    }
  );

  // Re-sync a single skill — re-runs full source sync and the skill is refreshed as part of that
  fastify.post<{ Params: { source: string; slug: string } }>(
    "/:source/:slug/sync",
    {
      onRequest: adminAuth,
      schema: {
        tags: ["Skills"],
        summary: "Re-sync a single skill's source",
        description: "Triggers a full re-sync of the parent source, refreshing all its skills including this one.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string" },
            slug: { type: "string" },
          },
        },
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              synced: { type: "boolean" },
              skillId: { type: "string" },
              lastSynced: { type: "string" },
            },
          },
          404: errorSchema,
          409: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { source, slug } = req.params;
      const skill = skills.findBySourceAndSlug(source, slug);
      if (!skill) {
        return reply.code(404).send({
          error: { code: "SKILL_NOT_FOUND", message: `Skill '${source}/${slug}' not found.` },
        });
      }

      const dbSource = sources.findById(skill.sourceId);
      if (!dbSource) {
        return reply.code(404).send({
          error: { code: "SOURCE_NOT_FOUND", message: `Source for skill not found.` },
        });
      }

      const locked = sources.trySetSyncing(dbSource.id);
      if (!locked) {
        return reply.code(409).send({
          error: { code: "SYNC_IN_PROGRESS", message: "A sync is already in progress for this source" },
        });
      }

      try {
        await ingestSource(dbSource.id, dbSource.slug, dbSource.url, repos);
        sources.updateSync({ id: dbSource.id, status: "idle", error: null });
        rebuildSearchIndex(repos, search);
        const now = new Date().toISOString();
        return reply.send({ synced: true, skillId: `${source}/${slug}`, lastSynced: now });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sources.updateSync({ id: dbSource.id, status: "error", error: message });
        return reply.code(422).send({ error: { code: "SYNC_FAILED", message } });
      }
    }
  );

  // Delete a single skill (admin)
  fastify.delete<{ Params: { source: string; slug: string } }>(
    "/:source/:slug",
    {
      onRequest: adminAuth,
      schema: {
        tags: ["Skills"],
        summary: "Delete a single skill",
        description: "Removes a single skill from the catalog without touching the source or other skills.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string" },
            slug: { type: "string" },
          },
        },
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { source, slug } = req.params;
      const skill = skills.findBySourceAndSlug(source, slug);
      if (!skill) {
        return reply.code(404).send({
          error: { code: "SKILL_NOT_FOUND", message: `Skill '${source}/${slug}' not found.` },
        });
      }
      skills.deleteBySourceAndSlug(source, slug);
      rebuildSearchIndex(repos, search);
      return reply.send({ ok: true });
    }
  );

  // Skill detail (registered AFTER /search and AFTER /:source/:slug/artifact)
  fastify.get<{ Params: { source: string; slug: string } }>(
    "/:source/:slug",
    {
      schema: {
        tags: ["Skills"],
        summary: "Get skill detail",
        description: "Returns full skill metadata and the complete file tree.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string" },
            slug: { type: "string" },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { source, slug } = req.params;
      const skill = skills.findBySourceAndSlug(source, slug);

      if (!skill) {
        return reply.code(404).send({
          error: { code: "SKILL_NOT_FOUND", message: `Skill '${source}/${slug}' not found.` },
        });
      }

      const baseUrl = resolveBaseUrl(req);
      const dbSource = sources.findById(skill.sourceId);
      const files: Array<{ path: string; contents: string }> =
        skill.artifactType === "skill-md"
          ? [{ path: "SKILL.md", contents: skill.content }]
          : await expandArchiveToFiles(skill.content);

      return reply.send({
        ...skillToResponse(skill, dbSource, baseUrl),
        content: skill.artifactType === "skill-md" ? skill.content : (files[0]?.contents ?? ""),
        files,
      });
    }
  );
};

export default skillsPlugin;
