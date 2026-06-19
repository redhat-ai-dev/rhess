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

const skillsPlugin: FastifyPluginAsync<SkillsRouteOptions> = async (fastify, opts) => {
  const { skills, search } = opts;

  // 5.3 — Search (must be registered BEFORE /:source/:slug to avoid path conflict)
  fastify.get(
    "/search",
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

  // 5.1 — Paginated listing
  fastify.get(
    "/",
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

  // 5.2 — Skill detail (registered AFTER /search)
  fastify.get(
    "/:source/:slug",
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
