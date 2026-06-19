import { simpleGit } from "simple-git";

// Accepted forms: https://, http://, ssh://, or SCP-style git@host:path
const VALID_GIT_URL = /^(https?:\/\/|ssh:\/\/|git@)/;

export async function clone(url: string, dest: string): Promise<void> {
  if (!VALID_GIT_URL.test(url)) {
    throw new Error(
      `CLONE_FAILED: invalid URL — only HTTPS and SSH Git URLs are accepted (got: ${url})`
    );
  }

  const git = simpleGit();
  try {
    await git.clone(url, dest, ["--depth", "1"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`CLONE_FAILED: ${message}`);
  }
}
