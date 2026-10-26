// Picks the storage adapter from the environment. Every adapter has the same shape:
//   { name, describe() → { label, detail, link? }, save(files, message) → { message, link? }, read?(path) }
// `files` maps repo-relative paths (src/sites/…) to canonical file contents; `read` overlays unsaved-locally files.
import { fsStorage } from './fs.mjs';
import { githubStorage } from './github.mjs';

export { fsStorage, githubStorage };

/** GitHub mode needs both GITHUB_TOKEN and GITHUB_REPO; setting only one is treated as a mistake, not a fallback. */
export function storageFromEnv(env, { dir }) {
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo, GITHUB_BASE: base } = env;
  if (token && repo) return githubStorage({ token, repo, base: base || 'main' });
  if (token || repo) throw new Error('Set both GITHUB_TOKEN and GITHUB_REPO for GitHub storage, or neither for local files');
  return fsStorage({ dir });
}
