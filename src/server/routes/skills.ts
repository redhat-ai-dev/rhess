import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "tar";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { SkillRepository } from "../db/types.js";
import type { SearchProvider } from "../search/types.js";

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

interface SkillsRouteOptions {
  skills: SkillRepository;
  search: SearchProvider;
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

const skillSummarySchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    description: { type: "string" },
    source: { type: "string" },
    slug: { type: "string" },
    artifactType: { type: "string", enum: ["skill-md", "archive"] },
    digest: { type: "string" },
  },
} as const;

const skillsPlugin: FastifyPluginAsync<SkillsRouteOptions> = async (fastify, opts) => {
  const { skills, search } = opts;

  // Search must be registered BEFORE /:source/:slug to avoid path conflict
  fastify.get(
    "/search",
    {
      schema: {
        tags: ["Skills"],
        summary: "Fuzzy search skills",
        description: "Full-text fuzzy search over skill names, descriptions, and source identifiers. Results are ordered by relevance (best match first).",
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", description: "Search query (typo-tolerant)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    source: { type: "string" },
                    slug: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    score: { type: "number", description: "Fuse.js distance score — lower is a better match (0 = exact)" },
                  },
                },
              },
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

      const results = search.search(q.trim());
      const data = results.map((r) => ({
        id: r.id,
        source: r.sourceSlug,
        slug: r.slug,
        name: r.name,
        description: r.description,
        score: r.score,
      }));

      return reply.send({ data });
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
            page: { type: "integer", minimum: 1, default: 1, description: "Page number (1-based)" },
            per_page: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Results per page (1–100)" },
            sort: { type: "string", enum: ["name", "updated_at"], default: "name", description: "Sort field" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array", items: skillSummarySchema },
              meta: {
                type: "object",
                properties: {
                  page: { type: "integer" },
                  per_page: { type: "integer" },
                  total: { type: "integer" },
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
      const rawPerPage =
        req.query.per_page !== undefined ? Number(req.query.per_page) : 20;
      const rawSort = req.query.sort ?? "name";

      if (
        !Number.isInteger(rawPage) ||
        rawPage < 1
      ) {
        return invalidParams(reply, "'page' must be a positive integer.");
      }
      if (
        !Number.isInteger(rawPerPage) ||
        rawPerPage < 1 ||
        rawPerPage > 100
      ) {
        return invalidParams(
          reply,
          "'per_page' must be an integer between 1 and 100."
        );
      }
      if (rawSort !== "name" && rawSort !== "updated_at") {
        return invalidParams(reply, "'sort' must be 'name' or 'updated_at'.");
      }

      const sort = rawSort === "updated_at" ? "updatedAt" : "name";
      const data = skills.findAll({ page: rawPage, perPage: rawPerPage, sort });
      const total = skills.count();

      return reply.send({
        data: data.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          source: s.sourceSlug,
          slug: s.slug,
          artifactType: s.artifactType,
          digest: s.digest,
        })),
        meta: { page: rawPage, per_page: rawPerPage, total },
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
        description: "Returns the raw artifact: `text/markdown` for single-file skills, `application/gzip` (tar.gz) for multi-file skills. This URL is referenced in the well-known discovery index.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string", description: "Source slug" },
            slug: { type: "string", description: "Skill slug" },
          },
        },
        response: { 404: errorSchema },
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

  // Skill detail (registered AFTER /search)
  fastify.get(
    "/:source/:slug",
    {
      schema: {
        tags: ["Skills"],
        summary: "Get skill detail",
        description: "Returns full skill metadata and the complete file tree. For archive skills the files are extracted on demand.",
        params: {
          type: "object",
          required: ["source", "slug"],
          properties: {
            source: { type: "string", description: "Source slug" },
            slug: { type: "string", description: "Skill slug" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "integer" },
              source: { type: "string" },
              slug: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              artifactType: { type: "string", enum: ["skill-md", "archive"] },
              digest: { type: "string" },
              files: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    contents: { type: "string" },
                  },
                },
              },
            },
          },
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

      const files: Array<{ path: string; contents: string }> =
        skill.artifactType === "skill-md"
          ? [{ path: "SKILL.md", contents: skill.content }]
          : await expandArchiveToFiles(skill.content);

      return reply.send({
        id: skill.id,
        source: skill.sourceSlug,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        artifactType: skill.artifactType,
        digest: skill.digest,
        files,
      });
    }
  );
};

export default skillsPlugin;
