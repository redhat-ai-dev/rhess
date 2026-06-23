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
    // Normalize: Authorization header is technically string | string[] in Node.
    // Take the first value if the header is somehow duplicated; treat empty as absent.
    const raw = req.headers["authorization"];
    const authHeader = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

    if (!authHeader) {
      return reply.code(401).send({
        error: { code: "UNAUTHORIZED", message: "Admin token required" },
      });
    }

    const spaceIdx = authHeader.indexOf(" ");
    // RFC 7235 §2.1: auth-scheme is case-insensitive.
    const scheme = (spaceIdx === -1 ? authHeader : authHeader.slice(0, spaceIdx)).toLowerCase();
    const value = spaceIdx === -1 ? "" : authHeader.slice(spaceIdx + 1);

    if (scheme !== "bearer" || value !== token) {
      return reply.code(403).send({
        error: { code: "FORBIDDEN", message: "Invalid admin token" },
      });
    }
  };
}
