import type { FastifyPluginAsync } from "fastify";
import type { SkillRepository } from "../db/types.js";

export interface ProbesPluginOptions {
  skills: SkillRepository;
}

const probesPlugin: FastifyPluginAsync<ProbesPluginOptions> = async (fastify, opts) => {
  const { skills } = opts;

  fastify.get(
    "/healthz",
    {
      schema: {
        tags: ["Ops"],
        summary: "Liveness probe",
        description: "Always returns 200 while the process is running.",
        response: { 200: { type: "object", properties: { status: { type: "string" } } } },
      },
    },
    async () => ({ status: "ok" })
  );

  fastify.get(
    "/readyz",
    {
      schema: {
        tags: ["Ops"],
        summary: "Readiness probe",
        description: "Returns 200 when SQLite is reachable, 503 otherwise.",
        response: {
          200: { type: "object", properties: { status: { type: "string" } } },
          503: {
            type: "object",
            properties: { status: { type: "string" }, message: { type: "string" } },
          },
        },
      },
    },
    async (_req, reply) => {
      try {
        skills.count();
        return { status: "ok" };
      } catch (err) {
        fastify.log.error(err, "readyz: database unreachable");
        return reply.code(503).send({ status: "error", message: "database unavailable" });
      }
    }
  );
};

export default probesPlugin;
