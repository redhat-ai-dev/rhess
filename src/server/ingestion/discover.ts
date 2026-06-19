import fs from "node:fs";
import path from "node:path";

export interface SkillCandidate {
  slug: string;
  skillMdPath: string;
  skillDir: string;
  discoveryPath: string;
  supportingFiles: string[];
}

const DISCOVERY_DIRS = [
  "skills",
  ".claude/skills",
  ".cursor/skills",
  ".github/copilot/skills",
  ".windsurf/skills",
  ".gemini/skills",
];

function isSkillMd(name: string): boolean {
  return name.toLowerCase() === "skill.md";
}

/**
 * Recursively walk a directory, collecting all SKILL.md files.
 * Returns absolute paths to each SKILL.md found.
 */
function walkForSkillMd(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkForSkillMd(fullPath));
    } else if (entry.isFile() && isSkillMd(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function discoverSkills(repoPath: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];

  for (const discoveryRelPath of DISCOVERY_DIRS) {
    const discoveryAbsPath = path.join(repoPath, discoveryRelPath);

    if (!fs.existsSync(discoveryAbsPath)) {
      continue;
    }

    const skillMdPaths = walkForSkillMd(discoveryAbsPath);

    for (const skillMdPath of skillMdPaths) {
      const skillDir = path.dirname(skillMdPath);

      // Determine slug: if SKILL.md is directly in the discovery dir, use the
      // discovery dir's basename; otherwise use the immediate parent dir name.
      const slug =
        skillDir === discoveryAbsPath
          ? path.basename(discoveryAbsPath)
          : path.basename(skillDir);

      // Collect supporting files (all other files in skillDir, relative paths)
      const supportingFiles: string[] = [];
      try {
        const entries = fs.readdirSync(skillDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && !isSkillMd(entry.name)) {
            supportingFiles.push(entry.name);
          } else if (entry.isDirectory()) {
            // Include files in subdirectories too
            const sub = walkAllFiles(path.join(skillDir, entry.name));
            for (const f of sub) {
              supportingFiles.push(path.relative(skillDir, f));
            }
          }
        }
      } catch {
        // ignore read errors for supporting files
      }

      candidates.push({
        slug,
        skillMdPath,
        skillDir,
        discoveryPath: discoveryRelPath,
        supportingFiles,
      });
    }
  }

  return candidates;
}

function walkAllFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkAllFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
