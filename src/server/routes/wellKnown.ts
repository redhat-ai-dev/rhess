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
 *   2. req.protocol + Host header — safe for direct (non-proxied) access.
 *      req.hostname strips the port, so we use req.headers.host (e.g.
 *      "localhost:3000") to preserve it. Do NOT read X-Forwarded-* headers
 *      directly; they are client-controlled without trustProxy configuration.
 */
function resolveBaseUrl(req: FastifyRequest): string {
  const configured = process.env["PUBLIC_BASE_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.headers.host ?? req.hostname;
  return `${req.protocol}://${host}`;
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
