import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clone, discoverSkills, parseFrontmatter, bundleSkill } from "./index.js";
import type { Repositories } from "../db/init.js";
import type { UpsertSkillInput } from "../db/types.js";

export interface SkillIndexEntry {
  slug: string;
  name: string;
  description: string;
  allowedTools: string[];
  artifactType: "skill-md" | "archive";
  digest: string;
  content: string;
  supportingFiles: string[];
}

export interface SkillFailure {
  path: string;
  reason: string;
}

export interface SyncReport {
  discovered: number;
  indexed: number;
  failed: number;
  failures: SkillFailure[];
}

/**
 * Inner pipeline: discover → parse → bundle → atomic swap.
 * Exported so integration tests can call it directly without a real clone.
 */
export async function ingestFromClonedPath(
  sourceId: number,
  sourceSlug: string,
  repoPath: string,
  repos: Repositories
): Promise<SyncReport> {
  const candidates = discoverSkills(repoPath);
  const indexed: SkillIndexEntry[] = [];
  const failures: SkillFailure[] = [];

  for (const candidate of candidates) {
    const relativePath = path.relative(repoPath, candidate.skillMdPath);
    try {
      const bundleResult = await bundleSkill(candidate);

      // For skill-md, the artifact IS the raw SKILL.md content — reuse it to
      // avoid a second readFileSync. For archives the artifact is base64 tar.gz,
      // so we read the file directly.
      const skillMdContent =
        bundleResult.artifactType === "skill-md"
          ? bundleResult.artifact
          : fs.readFileSync(candidate.skillMdPath, "utf-8");

      const fmResult = parseFrontmatter(skillMdContent);
      if (!fmResult.ok) {
        failures.push({ path: relativePath, reason: fmResult.reason });
        continue;
      }
      indexed.push({
        slug: candidate.slug,
        name: fmResult.data.name,
        description: fmResult.data.description,
        allowedTools: fmResult.data.allowedTools,
        artifactType: bundleResult.artifactType,
        digest: bundleResult.digest,
        content: bundleResult.artifact,
        supportingFiles: candidate.supportingFiles,
      });
    } catch (err) {
      failures.push({
        path: relativePath,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  atomicSwap(sourceId, sourceSlug, indexed, repos);

  return {
    discovered: candidates.length,
    indexed: indexed.length,
    failed: failures.length,
    failures,
  };
}

/**
 * Atomically replaces all skills for a source in a single SQLite transaction:
 * deletes the old set and inserts the new set in one commit.
 */
export function atomicSwap(
  sourceId: number,
  sourceSlug: string,
  skills: SkillIndexEntry[],
  repos: Repositories
): void {
  const inputs: UpsertSkillInput[] = skills.map((s) => ({
    sourceId,
    sourceSlug,
    slug: s.slug,
    name: s.name,
    description: s.description,
    artifactType: s.artifactType,
    digest: s.digest,
    content: s.content,
    supportingFiles: s.supportingFiles,
  }));

  repos.skills.transactionSync(() => {
    repos.skills.deleteBySource(sourceId);
    repos.skills.upsertMany(inputs);
  });
}

/**
 * Full ingestion pipeline: clone → discover → parse → bundle → atomic swap.
 * Clone failures propagate up without being caught.
 */
export async function ingestSource(
  sourceId: number,
  sourceSlug: string,
  url: string,
  repos: Repositories
): Promise<SyncReport> {
  const tmpDir = path.join(os.tmpdir(), `rhess-sync-${sourceId}-${Date.now()}`);
  try {
    await clone(url, tmpDir);
    return await ingestFromClonedPath(sourceId, sourceSlug, tmpDir, repos);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
