import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const UI_DIST = resolve(__dirname, "../../dist/ui");

function requireAdminToken(): string {
  const token = process.env["RHESS_ADMIN_TOKEN"];
  if (!token || token.trim() === "") {
    process.stderr.write(
      "[RHESS] FATAL: RHESS_ADMIN_TOKEN is not set or empty. " +
        "Set this environment variable before starting the server.\n"
    );
    process.exit(1);
  }
  return token;
}

function parseCorsOrigin(): string | string[] | boolean {
  const raw = process.env["ALLOWED_ORIGINS"];
  if (!raw || raw.trim() === "" || raw.trim() === "*") return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

// Paths that must never fall through to the SPA — return a real 404 JSON.
const NON_SPA_PREFIXES = ["/api/", "/.well-known/", "/healthz", "/readyz"];

function isApiPath(url: string): boolean {
  return NON_SPA_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

function isBrowserNavigation(req: { method: string; headers: Record<string, string | string[] | undefined> }): boolean {
  if (req.method !== "GET") return false;
  const accept = req.headers["accept"] ?? "";
  return Array.isArray(accept)
    ? accept.some((v) => v.includes("text/html"))
    : accept.includes("text/html");
}

export async function buildServer() {
  requireAdminToken();

  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: parseCorsOrigin() });

  app.get("/healthz", async () => ({ status: "ok" }));

  // Readiness probe: always JSON, reflects real DB health once wired in §2.
  app.get("/readyz", async () => ({ status: "ok" }));

  await app.register(fastifyStatic, {
    root: UI_DIST,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback: only for browser GET requests that aren't operational/API paths.
  app.setNotFoundHandler(async (req, reply) => {
    if (!isApiPath(req.url) && isBrowserNavigation(req)) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  return app;
}

const app = await buildServer();
await app.listen({ port: PORT, host: "0.0.0.0" });
