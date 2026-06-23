import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Returns a Fastify preHandler hook that enforces Bearer token auth.
 *
 * Designed as a factory so the implementation can be swapped for an
 * OIDC/SSO hook in a future release without touching route handler code —
 * the Authorization: Bearer convention is preserved regardless.
 *
 * Behaviour:
 *   - No Authorization header          → 401 UNAUTHORIZED
 *   - Wrong scheme or incorrect token  → 403 FORBIDDEN
 *   - Correct token                    → passes through
 *
 * The token value is never written to logs or error responses.
 */
export function createAdminAuthHook(token: string) {
  return async function adminAuth(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return reply.code(401).send({
        error: { code: "UNAUTHORIZED", message: "Admin token required" },
      });
    }

    const spaceIdx = authHeader.indexOf(" ");
    const scheme = spaceIdx === -1 ? authHeader : authHeader.slice(0, spaceIdx);
    const value = spaceIdx === -1 ? "" : authHeader.slice(spaceIdx + 1);

    if (scheme !== "Bearer" || value !== token) {
      return reply.code(403).send({
        error: { code: "FORBIDDEN", message: "Invalid admin token" },
      });
    }
  };
}
