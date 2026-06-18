import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const UI_DIST = resolve(__dirname, "../../dist/ui");

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: true });

  app.get("/healthz", async () => ({ status: "ok" }));

  await app.register(fastifyStatic, {
    root: UI_DIST,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile("index.html");
  });

  return app;
}

const app = await buildServer();
await app.listen({ port: PORT, host: "0.0.0.0" });
