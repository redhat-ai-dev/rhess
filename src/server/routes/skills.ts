import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { SkillRepository } from "../db/types.js";
import type { SearchProvider } from "../search/types.js";

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
      const data = results.map((r) => {
        const skill = skills.findBySourceAndSlug(r.sourceSlug, r.slug);
        return {
          id: skill?.id,
          source: r.sourceSlug,
          slug: r.slug,
          name: r.name,
          description: r.description,
          score: r.score,
        };
      });

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

      const files: Array<{ path: string; contents: string }> = [
        { path: "SKILL.md", contents: skill.content },
      ];

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
