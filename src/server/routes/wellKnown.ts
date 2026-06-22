import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { SkillRepository } from "../db/types.js";

interface WellKnownOptions {
  skills: SkillRepository;
}

const wellKnownPlugin: FastifyPluginAsync<WellKnownOptions> = async (fastify, opts) => {
  fastify.get(
    "/agent-skills/index.json",
    async (req: FastifyRequest, reply) => {
      const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
      const baseUrl = `${proto}://${host}`;

      const allSkills = opts.skills.findAllUnpaged();
      return reply.send({
        $schema: "https://agentskills.io/schema/v0.2.0/index.json",
        skills: allSkills.map((s) => ({
          name: s.name,
          type: s.artifactType,
          description: s.description,
          url: `${baseUrl}/api/v1/skills/${s.sourceSlug}/${s.slug}/artifact`,
          digest: `sha256:${s.digest}`,
        })),
      });
    }
  );
};

export default wellKnownPlugin;
