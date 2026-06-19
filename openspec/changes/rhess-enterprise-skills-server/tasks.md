<!-- After each completed task, commit the changes. -->

## 1. Project Scaffold

- [x] 1.1 Create `github.com/redhat-ai-dev/rhess` repository with Apache-2.0 license and initial README
- [x] 1.2 Initialise Node.js/TypeScript project: `package.json`, `tsconfig.json`, `eslint.config.js`, `.gitignore`
- [x] 1.3 Add production dependencies: `fastify`, `@fastify/static`, `@fastify/cors`, `better-sqlite3`, `simple-git`, `js-yaml`, `fuse.js`, `tar`
- [x] 1.4 Add dev dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `tsx`, `vitest`
- [x] 1.5 Set up `src/server/` and `src/ui/` directory structure per design decision 4
- [x] 1.6 Configure Vite to build React UI into `dist/ui/` served by Fastify

## 2. Database & Repository Interfaces

- [x] 2.1 Define `SkillRepository` and `SourceRepository` TypeScript interfaces in `src/server/db/types.ts`
- [x] 2.2 Define `SearchProvider` interface in `src/server/search/types.ts`
- [x] 2.3 Implement SQLite schema: `sources` and `skills` tables with migrations in `src/server/db/schema.ts`
- [x] 2.4 Implement `SqliteSkillRepository` and `SqliteSourceRepository` backed by `better-sqlite3`
- [x] 2.5 Implement database initialisation with fail-fast if `DATABASE_PATH` directory is not writable
- [x] 2.6 Write unit tests for repository CRUD operations

## 3. Authentication Middleware

- [ ] 3.1 Implement `adminAuth` Fastify plugin: reads `RHESS_ADMIN_TOKEN` env var at startup, exits with non-zero if missing or empty
- [ ] 3.2 Middleware returns 401 on missing `Authorization` header, 403 on invalid token — never logs token value
- [ ] 3.3 Apply `adminAuth` exclusively to write routes (`POST /api/v1/sources`, `DELETE /api/v1/sources/:id`, `POST /api/v1/sources/:id/sync`)
- [ ] 3.4 Write unit tests: missing token → 401, wrong token → 403, valid token → passes, GET routes → no auth required

## 4. Skill Ingestion Engine

- [x] 4.1 Implement `clone(url: string, dest: string): Promise<void>` using `simple-git` with `--depth 1`
- [x] 4.2 Implement `discoverSkills(repoPath: string): SkillCandidate[]` walking all Agent Skills spec discovery paths
- [x] 4.3 Implement YAML frontmatter parser: validates `name` and `description` are present; returns structured metadata
- [x] 4.4 Implement archive bundler: tar.gz multi-file skills, compute SHA256 digest; single-file skills served as-is with digest
- [x] 4.5 Implement `ingestSource(sourceId, url): SyncReport` — clone → discover → parse → classify → stage
- [x] 4.6 Implement atomic swap: single SQLite transaction deletes old source skills and inserts new ones
- [x] 4.7 Implement bundled example skills loader: seeds catalog on first boot if no sources registered
- [x] 4.8 Write integration tests: valid repo → skills indexed; malformed frontmatter → skipped + reported; re-sync → atomic replace

## 5. Skills Catalog REST API

- [x] 5.1 Implement `GET /api/v1/skills` with pagination (`page`, `per_page`, `sort`) — unauthenticated
- [x] 5.2 Implement `GET /api/v1/skills/:source/:slug` returning full file tree — unauthenticated
- [x] 5.3 Implement `GET /api/v1/skills/search?q=<query>` using `Fuse.js` via `SearchProvider` — unauthenticated
- [ ] 5.4 Implement `GET /.well-known/agent-skills/index.json` (v0.2.0 schema with `name`, `type`, `description`, `url`, `digest`) — unauthenticated
- [ ] 5.4 Implement artifact serving endpoints: raw SKILL.md and tar.gz archive downloads
- [x] 5.5 Implement `Fuse.js`-backed `SearchProvider`; wire index rebuild on every source sync
- [x] 5.6 Implement global Fastify error handler returning `{error: {code, message}}` for all 4xx/5xx
- [x] 5.7 Write API tests: pagination bounds, 404 on unknown skill, fuzzy search matches, `.well-known/` index shape

## 6. Source Management REST API

- [x] 6.1 Implement `POST /api/v1/sources`: validate slug (kebab-case, 1–64 chars), reject duplicate slug with 409, trigger initial ingestion
- [x] 6.2 Implement `DELETE /api/v1/sources/:id`: remove source record and all associated skills in one transaction
- [x] 6.3 Implement `POST /api/v1/sources/:id/sync`: reject concurrent sync with 409, run `ingestSource`, return sync report
- [x] 6.4 Write API tests: duplicate slug → 409, invalid slug → 400, clone failure → 422, concurrent sync → 409, unknown source → 404

## 7. Health & Readiness Probes

- [ ] 7.1 Implement `GET /healthz` returning `{status: "ok"}` — always 200 while process is running
- [ ] 7.2 Implement `GET /readyz` returning 200 when SQLite is reachable, 503 otherwise
- [ ] 7.3 Write tests: healthy → 200, SQLite unreachable → readyz 503 / healthz still 200

## 8. Web Directory UI

- [ ] 8.1 Scaffold PatternFly React app in `src/ui/`: install `@patternfly/react-core`, `react-markdown`, `react-router-dom`
- [ ] 8.2 Implement skill list page: PatternFly `Table` with name, description, source, copy-to-clipboard install command
- [ ] 8.3 Implement real-time search bar: debounced `GET /api/v1/skills/search` calls, results replace list
- [ ] 8.4 Implement skill detail page (`/:source/:slug`): fetch skill, render SKILL.md with `react-markdown`, display frontmatter metadata
- [ ] 8.5 Implement admin panel (add source form, sync button, delete button): prompts for admin token, stores in session, uses `Authorization: Bearer` header
- [ ] 8.6 Configure Fastify to serve built UI assets from `dist/ui/` and return `index.html` for all non-API routes (SPA fallback)

## 9. Container & Deployment

- [ ] 9.1 Write multi-stage `Dockerfile`: build stage on `ubi9/nodejs-24` compiles TS + Vite; runtime stage copies `dist/` and `node_modules` production only
- [ ] 9.2 Ensure `git` binary is available in runtime layer (`dnf install -y git` in Dockerfile)
- [ ] 9.3 Write Kubernetes `Deployment` manifest: env vars from Secret, PVC mount at `/data`, liveness/readiness probes
- [ ] 9.4 Write Kubernetes `Service`, `PersistentVolumeClaim`, and OpenShift `Route` manifests
- [ ] 9.5 Verify `podman run -e RHESS_ADMIN_TOKEN=test -p 3000:3000 <image>` starts and serves the UI
- [ ] 9.6 Add `npm run dev` script wiring `tsx watch` for server + `vite` for UI with concurrent runner

## 10. Documentation & Publication

- [ ] 10.1 Write `README.md`: quickstart (local + Kubernetes), environment variable reference, architecture overview, contribution guidelines
- [ ] 10.2 Document single-replica SQLite constraint in a `docs/developer-preview.md` release notes file
- [ ] 10.3 Add `LICENSE` file (Apache-2.0)
- [ ] 10.4 Promote capability specs from change workspace to `openspec/specs/`: `skills-catalog-api`, `skill-source-management`, `skill-ingestion`, `rbac-auth`, `web-directory`, `container-deployment`
