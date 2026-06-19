import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { discoverSkills } from "../../../src/server/ingestion/discover.js";
import { parseFrontmatter } from "../../../src/server/ingestion/frontmatter.js";
import { bundleSkill } from "../../../src/server/ingestion/bundle.js";
import { clone } from "../../../src/server/ingestion/clone.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rhess-test-"));
}

function writeSkillMd(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

const VALID_FRONTMATTER = `---
name: My Skill
description: Does something useful
---
Body content here.
`;

// ---------------------------------------------------------------------------
// discoverSkills
// ---------------------------------------------------------------------------

describe("discoverSkills", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it("finds SKILL.md under each of the 6 spec discovery paths", () => {
    const paths = [
      "skills/my-skill",
      ".claude/skills/my-skill",
      ".cursor/skills/my-skill",
      ".github/copilot/skills/my-skill",
      ".windsurf/skills/my-skill",
      ".gemini/skills/my-skill",
    ];
    for (const p of paths) {
      writeSkillMd(path.join(repoDir, p), VALID_FRONTMATTER);
    }

    const candidates = discoverSkills(repoDir);
    expect(candidates).toHaveLength(6);
    const discoveryPaths = candidates.map((c) => c.discoveryPath);
    expect(discoveryPaths).toContain("skills");
    expect(discoveryPaths).toContain(".claude/skills");
    expect(discoveryPaths).toContain(".cursor/skills");
    expect(discoveryPaths).toContain(".github/copilot/skills");
    expect(discoveryPaths).toContain(".windsurf/skills");
    expect(discoveryPaths).toContain(".gemini/skills");
  });

  it("does NOT index a SKILL.md at the repo root", () => {
    fs.writeFileSync(path.join(repoDir, "SKILL.md"), VALID_FRONTMATTER);
    const candidates = discoverSkills(repoDir);
    expect(candidates).toHaveLength(0);
  });

  it("does NOT index a SKILL.md outside discovery paths", () => {
    writeSkillMd(path.join(repoDir, "docs/my-skill"), VALID_FRONTMATTER);
    const candidates = discoverSkills(repoDir);
    expect(candidates).toHaveLength(0);
  });

  it("matches SKILL.md case-insensitively", () => {
    const skillDir = path.join(repoDir, "skills/my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "skill.md"), VALID_FRONTMATTER);
    const candidates = discoverSkills(repoDir);
    expect(candidates).toHaveLength(1);
  });

  it("sets slug to the skill directory name", () => {
    writeSkillMd(path.join(repoDir, "skills/react-best-practices"), VALID_FRONTMATTER);
    const candidates = discoverSkills(repoDir);
    expect(candidates[0]?.slug).toBe("react-best-practices");
  });

  it("collects supporting files relative to the skill dir", () => {
    const skillDir = path.join(repoDir, "skills/my-skill");
    writeSkillMd(skillDir, VALID_FRONTMATTER);
    fs.writeFileSync(path.join(skillDir, "helper.sh"), "#!/bin/sh");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "scripts", "util.py"), "");

    const candidates = discoverSkills(repoDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.supportingFiles).toContain("helper.sh");
    expect(candidates[0]?.supportingFiles).toContain("scripts/util.py");
  });

  // --- Qodo bug 1 fix ---
  it("does not include a nested SKILL.md as a supporting file", () => {
    const parentDir = path.join(repoDir, "skills/parent-skill");
    writeSkillMd(parentDir, VALID_FRONTMATTER);

    // Nested skill — should be its own candidate, not a supporting file
    const nestedDir = path.join(parentDir, "nested-skill");
    writeSkillMd(nestedDir, VALID_FRONTMATTER);

    const candidates = discoverSkills(repoDir);
    // Both are discovered as separate candidates
    expect(candidates).toHaveLength(2);
    const parentCandidate = candidates.find((c) => c.slug === "parent-skill");
    expect(parentCandidate).toBeDefined();
    // The nested skill dir must not appear in parent's supportingFiles
    const supportingPaths = parentCandidate?.supportingFiles ?? [];
    for (const f of supportingPaths) {
      expect(f.toLowerCase()).not.toContain("skill.md");
    }
    expect(supportingPaths.some((f) => f.startsWith("nested-skill"))).toBe(false);
  });

  it("does not include any SKILL.md files in supportingFiles even in deeper subdirs", () => {
    const skillDir = path.join(repoDir, "skills/my-skill");
    writeSkillMd(skillDir, VALID_FRONTMATTER);
    // Subdirectory without its own SKILL.md — files here are supporting files
    const subDir = path.join(skillDir, "assets");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "readme.txt"), "notes");
    // Paranoia: manually place a SKILL.md deep — should be filtered out
    fs.writeFileSync(path.join(subDir, "SKILL.md"), VALID_FRONTMATTER);

    const candidates = discoverSkills(repoDir);
    const candidate = candidates.find((c) => c.slug === "my-skill");
    const supportingPaths = candidate?.supportingFiles ?? [];
    for (const f of supportingPaths) {
      expect(f.toLowerCase()).not.toContain("skill.md");
    }
  });
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns ok:true for valid frontmatter", () => {
    const result = parseFrontmatter(VALID_FRONTMATTER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("My Skill");
      expect(result.data.description).toBe("Does something useful");
      expect(result.data.rawContent).toBe(VALID_FRONTMATTER);
    }
  });

  it("returns ok:false when no frontmatter delimiters", () => {
    const result = parseFrontmatter("Just some plain text\nwith no frontmatter");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false for malformed YAML", () => {
    const result = parseFrontmatter("---\nname: [unclosed\n---\nBody");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when name is missing", () => {
    const result = parseFrontmatter("---\ndescription: Something\n---\nBody");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/name/i);
  });

  it("returns ok:false when description is missing", () => {
    const result = parseFrontmatter("---\nname: My Skill\n---\nBody");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/description/i);
  });

  it("returns ok:false when name is empty string", () => {
    const result = parseFrontmatter("---\nname: ''\ndescription: Something\n---\nBody");
    expect(result.ok).toBe(false);
  });

  it("extracts allowed-tools as array", () => {
    const content = "---\nname: Tool\ndescription: Uses tools\nallowed-tools:\n  - Bash\n  - Read\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.allowedTools).toEqual(["Bash", "Read"]);
    }
  });

  it("treats non-array allowed-tools as empty without failing", () => {
    const content = "---\nname: Tool\ndescription: Desc\nallowed-tools: Bash\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.allowedTools).toEqual([]);
    }
  });

  it("never throws — always returns a result object", () => {
    const inputs = ["", "---", "---\n---", "---\n!!invalid\n---"];
    for (const input of inputs) {
      expect(() => parseFrontmatter(input)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// bundleSkill
// ---------------------------------------------------------------------------

describe("bundleSkill", () => {
  let skillDir: string;

  beforeEach(() => {
    skillDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true });
  });

  it("returns skill-md type for a single-file skill", async () => {
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_FRONTMATTER);
    const candidate = {
      slug: "my-skill",
      skillMdPath: path.join(skillDir, "SKILL.md"),
      skillDir,
      discoveryPath: "skills",
      supportingFiles: [],
    };
    const result = await bundleSkill(candidate);
    expect(result.artifactType).toBe("skill-md");
    expect(result.artifact).toBe(VALID_FRONTMATTER);
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("digest is the SHA-256 of the raw content for skill-md", async () => {
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_FRONTMATTER);
    const candidate = {
      slug: "my-skill",
      skillMdPath: path.join(skillDir, "SKILL.md"),
      skillDir,
      discoveryPath: "skills",
      supportingFiles: [],
    };
    const result = await bundleSkill(candidate);
    const expected = crypto.createHash("sha256").update(VALID_FRONTMATTER, "utf-8").digest("hex");
    expect(result.digest).toBe(expected);
  });

  it("returns archive type for a multi-file skill", async () => {
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_FRONTMATTER);
    fs.writeFileSync(path.join(skillDir, "helper.sh"), "#!/bin/sh");
    const candidate = {
      slug: "my-skill",
      skillMdPath: path.join(skillDir, "SKILL.md"),
      skillDir,
      discoveryPath: "skills",
      supportingFiles: ["helper.sh"],
    };
    const result = await bundleSkill(candidate);
    expect(result.artifactType).toBe("archive");
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
    // artifact is base64
    expect(() => Buffer.from(result.artifact, "base64")).not.toThrow();
  });

  // --- Qodo bug 3 fix ---
  it("produces a deterministic digest regardless of supportingFiles order", async () => {
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_FRONTMATTER);
    fs.writeFileSync(path.join(skillDir, "a.sh"), "a");
    fs.writeFileSync(path.join(skillDir, "b.sh"), "b");
    fs.writeFileSync(path.join(skillDir, "c.sh"), "c");

    const makeCandidate = (order: string[]) => ({
      slug: "my-skill",
      skillMdPath: path.join(skillDir, "SKILL.md"),
      skillDir,
      discoveryPath: "skills",
      supportingFiles: order,
    });

    const r1 = await bundleSkill(makeCandidate(["a.sh", "b.sh", "c.sh"]));
    const r2 = await bundleSkill(makeCandidate(["c.sh", "a.sh", "b.sh"]));
    const r3 = await bundleSkill(makeCandidate(["b.sh", "c.sh", "a.sh"]));

    expect(r1.digest).toBe(r2.digest);
    expect(r2.digest).toBe(r3.digest);
  });
});

// ---------------------------------------------------------------------------
// clone — URL validation (Qodo bug 2 fix)
// ---------------------------------------------------------------------------

describe("clone — URL validation", () => {
  it("throws CLONE_FAILED for a non-git URL scheme", async () => {
    await expect(clone("file:///some/path", "/tmp/dest")).rejects.toThrow("CLONE_FAILED");
  });

  it("throws CLONE_FAILED for a bare local path", async () => {
    await expect(clone("/usr/local/repo", "/tmp/dest")).rejects.toThrow("CLONE_FAILED");
  });

  it("throws CLONE_FAILED for an ftp:// URL", async () => {
    await expect(clone("ftp://example.com/repo.git", "/tmp/dest")).rejects.toThrow("CLONE_FAILED");
  });

  it("accepts https:// URLs (fails at network, not validation)", async () => {
    // Will fail because the URL is unreachable, but the error must NOT be a
    // validation rejection — it should be a git clone failure.
    await expect(
      clone("https://invalid.example.internal/repo.git", "/tmp/rhess-clone-test")
    ).rejects.toThrow("CLONE_FAILED");
    // Verify it's a git error, not our validation message
    try {
      await clone("https://invalid.example.internal/repo.git", "/tmp/rhess-clone-test");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("invalid URL");
    }
  });

  it("accepts ssh:// URLs (fails at network, not validation)", async () => {
    await expect(
      clone("ssh://git@invalid.example.internal/repo.git", "/tmp/rhess-clone-test")
    ).rejects.toThrow("CLONE_FAILED");
    try {
      await clone("ssh://git@invalid.example.internal/repo.git", "/tmp/rhess-clone-test");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("invalid URL");
    }
  });

  it("accepts git@ SCP-style URLs (fails at network, not validation)", async () => {
    await expect(
      clone("git@github.com:invalid-org/invalid-repo.git", "/tmp/rhess-clone-test")
    ).rejects.toThrow("CLONE_FAILED");
    try {
      await clone("git@github.com:invalid-org/invalid-repo.git", "/tmp/rhess-clone-test");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("invalid URL");
    }
  });
});
