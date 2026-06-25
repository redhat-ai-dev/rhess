/** Mock repository URLs for the GitLab Pages static demo. Bundled in JS so links always render. */
export const STATIC_DEMO_SOURCE_URLS: Record<string, string> = {
  'mock-skills': 'https://github.com/redhat-ux/agent-skills',
  'cursor-skills-cursor': 'https://github.com/getcursor/skills',
  'cursor-skills': 'https://github.com/ttobias/my-skills',
};

export function getStaticDemoSourceUrl(sourceId: string | undefined): string | null {
  if (!sourceId) return null;
  return STATIC_DEMO_SOURCE_URLS[sourceId] ?? null;
}
