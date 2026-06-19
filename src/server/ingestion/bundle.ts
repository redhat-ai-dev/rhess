import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { create } from "tar";
import type { SkillCandidate } from "./discover.js";

export interface BundleResult {
  artifactType: "skill-md" | "archive";
  /** SHA-256 hex digest of the artifact (content for skill-md, tar.gz bytes for archive) */
  digest: string;
  /** For skill-md: raw SKILL.md content. For archive: base64-encoded tar.gz */
  artifact: string;
}

export async function bundleSkill(candidate: SkillCandidate): Promise<BundleResult> {
  if (candidate.supportingFiles.length === 0) {
    return bundleSkillMd(candidate);
  }
  return bundleArchive(candidate);
}

async function bundleSkillMd(candidate: SkillCandidate): Promise<BundleResult> {
  const rawContent = fs.readFileSync(candidate.skillMdPath, "utf-8");
  const digest = crypto.createHash("sha256").update(rawContent, "utf-8").digest("hex");
  return {
    artifactType: "skill-md",
    digest,
    artifact: rawContent,
  };
}

async function bundleArchive(candidate: SkillCandidate): Promise<BundleResult> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const pack = create(
      {
        gzip: true,
        cwd: candidate.skillDir,
        portable: true,
      },
      getAllRelativeFiles(candidate),
    );

    pack.on("data", (chunk: Buffer) => chunks.push(chunk));
    pack.on("end", resolve);
    pack.on("error", reject);
  });

  const buffer = Buffer.concat(chunks);
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    artifactType: "archive",
    digest,
    artifact: buffer.toString("base64"),
  };
}

function getAllRelativeFiles(candidate: SkillCandidate): string[] {
  // Include SKILL.md itself plus all supporting files
  const skillMdRel = path.relative(candidate.skillDir, candidate.skillMdPath);
  return [skillMdRel, ...candidate.supportingFiles];
}
