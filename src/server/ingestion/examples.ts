import crypto from "node:crypto";
import type { Repositories } from "../db/init.js";

interface ExampleSkill {
  slug: string;
  name: string;
  description: string;
  content: string;
}

const EXAMPLE_SKILLS: ExampleSkill[] = [
  {
    slug: "git-conventional-commit",
    name: "Git Conventional Commit",
    description: "Writes a conventional commit message following the Conventional Commits specification.",
    content: `---
name: Git Conventional Commit
description: Writes a conventional commit message following the Conventional Commits specification.
allowed-tools:
  - Bash
---

## Git Conventional Commit

Analyse the staged diff and write a well-formed [Conventional Commit](https://www.conventionalcommits.org/) message.

### Format

\`\`\`
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
\`\`\`

**Types:** \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`perf\`, \`test\`, \`chore\`, \`ci\`, \`build\`, \`revert\`

### Instructions

1. Run \`git diff --staged\` to inspect the changes.
2. Choose the correct type based on what changed.
3. Keep the summary under 72 characters, imperative mood, no period.
4. Add a body if the change needs context that the diff alone cannot convey.
5. Add a \`BREAKING CHANGE:\` footer if the change breaks any public API.
`,
  },
  {
    slug: "code-review-checklist",
    name: "Code Review Checklist",
    description: "Reviews a code change against a standard checklist of common issues.",
    content: `---
name: Code Review Checklist
description: Reviews a code change against a standard checklist of common issues.
allowed-tools:
  - Read
  - Bash
---

## Code Review Checklist

Review the provided code or diff against the following checklist and report findings.

### Checklist

**Correctness**
- [ ] Logic is correct and handles edge cases
- [ ] Error paths are handled (exceptions, nulls, empty collections)
- [ ] No off-by-one errors

**Security**
- [ ] No secrets or credentials in code
- [ ] Inputs are validated and sanitised
- [ ] No SQL injection or command injection vectors

**Maintainability**
- [ ] Functions/methods are focused and small
- [ ] Names are descriptive and consistent
- [ ] Dead code has been removed

**Tests**
- [ ] New behaviour is covered by tests
- [ ] Existing tests still pass

### Output

For each finding, report: **severity** (critical / major / minor / nit), **location** (file + line), and **recommendation**.
`,
  },
  {
    slug: "explain-code",
    name: "Explain Code",
    description: "Explains what a code block or file does in plain language.",
    content: `---
name: Explain Code
description: Explains what a code block or file does in plain language.
allowed-tools:
  - Read
---

## Explain Code

Read the target code and explain it clearly for the intended audience.

### Steps

1. Identify the language and any key frameworks/libraries in use.
2. Summarise the **purpose** of the code in one sentence.
3. Walk through the **main logic flow** step by step.
4. Call out any **non-obvious design decisions** or trade-offs.
5. List **side effects** (I/O, mutations, external calls) if present.
6. Flag any **potential bugs or issues** you notice while reading.

### Output format

- Start with a one-sentence TL;DR.
- Use numbered steps for the logic walk-through.
- Use a short bullet list for side effects and issues.
- Avoid jargon unless the user's context makes it appropriate.
`,
  },
];

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

export async function loadExamplesIfEmpty(repos: Repositories): Promise<void> {
  if (repos.skills.count() !== 0 || repos.sources.findAll().length !== 0) {
    return;
  }

  const source = repos.sources.create({ slug: "examples", url: "built-in" });

  repos.skills.upsertMany(
    EXAMPLE_SKILLS.map((skill) => ({
      sourceId: source.id,
      sourceSlug: "examples",
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      artifactType: "skill-md" as const,
      digest: sha256(skill.content),
      content: skill.content,
      supportingFiles: [],
    }))
  );
}
