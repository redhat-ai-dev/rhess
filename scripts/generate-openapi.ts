// Boots the Fastify app in-memory and dumps the OpenAPI spec to openapi.yaml.
// Usage: npm run openapi

process.env["RHESS_ADMIN_TOKEN"] ??= "dev-generate";
process.env["DATABASE_PATH"] ??= ":memory:";

import { buildServer } from "../src/server/index.js";
import { writeFileSync } from "node:fs";
import yaml from "js-yaml";

const { app } = await buildServer();
await app.ready();

const spec = app.swagger();
writeFileSync("openapi.yaml", yaml.dump(spec, { indent: 2, lineWidth: 120 }));

console.log("openapi.yaml written");
await app.close();
