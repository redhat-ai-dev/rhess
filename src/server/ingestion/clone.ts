import { simpleGit } from "simple-git";

export async function clone(url: string, dest: string): Promise<void> {
  const git = simpleGit();
  try {
    await git.clone(url, dest, ["--depth", "1"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`CLONE_FAILED: ${message}`);
  }
}
