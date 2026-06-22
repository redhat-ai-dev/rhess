import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { SkillRepository } from "../db/types.js";

interface WellKnownOptions {
  skills: SkillRepository;
}

/**
 * Derive the server's public base URL.
 *
 * Priority:
 *   1. PUBLIC_BASE_URL env var — the only trusted source for proxy deployments.
 *      Must be set when RHESS sits behind a reverse proxy.
 *   2. req.protocol + req.hostname — safe for direct (non-proxied) access.
 *      Do NOT read X-Forwarded-* headers directly; they are client-controlled
 *      without explicit Fastify trustProxy configuration.
 */
function resolveBaseUrl(req: FastifyRequest): string {
  const configured = process.env["PUBLIC_BASE_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.hostname}`;
}

const wellKnownPlugin: FastifyPluginAsync<WellKnownOptions> = async (fastify, opts) => {
  fastify.get("/agent-skills/index.json", async (req: FastifyRequest, reply) => {
    const baseUrl = resolveBaseUrl(req);
    const entries = opts.skills.findAllDiscoveryEntries();
    return reply.send({
      $schema: "https://agentskills.io/schema/v0.2.0/index.json",
      skills: entries.map((s) => ({
        name: s.name,
        type: s.artifactType,
        description: s.description,
        url: `${baseUrl}/api/v1/skills/${encodeURIComponent(s.sourceSlug)}/${encodeURIComponent(s.slug)}/artifact`,
        digest: `sha256:${s.digest}`,
      })),
    });
  });
};

export default wellKnownPlugin;
