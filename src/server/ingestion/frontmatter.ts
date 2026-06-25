import yaml from "js-yaml";

export interface ParsedFrontmatter {
  name: string;
  description: string;
  allowedTools: string[];
  /** Full frontmatter map with name/description omitted — for storage and API exposure */
  frontmatter: Record<string, unknown>;
  rawContent: string;
}

export type FrontmatterResult =
  | { ok: true; data: ParsedFrontmatter }
  | { ok: false; reason: string };

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { ok: false, reason: "No YAML frontmatter delimiters found" };
  }

  const yamlBlock = match[1] ?? "";

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlBlock);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Malformed YAML frontmatter: ${message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "Frontmatter must be a YAML mapping" };
  }

  const fm = parsed as Record<string, unknown>;

  if (typeof fm["name"] !== "string" || fm["name"].trim() === "") {
    return { ok: false, reason: "Missing or empty 'name' field in frontmatter" };
  }

  if (typeof fm["description"] !== "string" || fm["description"].trim() === "") {
    return { ok: false, reason: "Missing or empty 'description' field in frontmatter" };
  }

  const rawAllowedTools = fm["allowed-tools"];
  let allowedTools: string[] = [];
  if (Array.isArray(rawAllowedTools)) {
    allowedTools = rawAllowedTools.filter((t): t is string => typeof t === "string");
  }

  // Full frontmatter map for storage — exclude name/description (already top-level DB fields)
  const { name: _n, description: _d, ...rest } = fm;
  const frontmatter: Record<string, unknown> = rest;

  return {
    ok: true,
    data: {
      name: fm["name"],
      description: fm["description"],
      allowedTools,
      frontmatter,
      rawContent: content,
    },
  };
}
