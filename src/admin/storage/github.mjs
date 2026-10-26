// GitHub storage: each save becomes a commit on a per-process branch, and the first save opens a pull request.
// Uses the Git data API (blobs → tree → commit → ref) so nothing touches the local checkout or a local git.
// Reads stay local: files saved this session are kept in memory and overlaid on the checkout (see docs/admin.md).

const API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const BRANCH = /^(?!.*\.\.)[A-Za-z0-9._/-]+$/;

/** `content/admin-20261019-180500` (UTC), unique per admin process. */
export const branchName = (date = new Date()) =>
  `content/admin-${date
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-')}`;

/**
 * @param {{ token: string, repo: string, base?: string, fetch?: typeof fetch, now?: () => Date }} options
 */
export function githubStorage({ token, repo, base = 'main', fetch: request = globalThis.fetch, now = () => new Date() }) {
  if (!token) throw new Error('GITHUB_TOKEN is required for GitHub storage');
  if (!REPO.test(repo ?? '')) throw new Error('GITHUB_REPO must look like owner/name');
  if (!BRANCH.test(base)) throw new Error('GITHUB_BASE is not a valid branch name');

  const overlay = new Map();
  let branch = null;
  let head = null;
  let pull = null;
  let queue = Promise.resolve();

  // Error text can come from GitHub or from fetch itself; never let the token through either way.
  const redact = text => String(text).replaceAll(token, '[redacted]');

  async function call(method, path, body) {
    let response;
    try {
      response = await request(`${API}/repos/${repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'peptalk-appearances-admin',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new Error(redact(`GitHub ${method} ${path} failed: ${error.message}`));
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.message ? `: ${data.message}` : '';
      throw new Error(redact(`GitHub ${method} ${path} failed with ${response.status}${detail}`));
    }
    return data;
  }

  async function persist(files, message) {
    const parent = head ?? (await call('GET', `/git/ref/heads/${base}`)).object.sha;
    const { tree: baseTree } = await call('GET', `/git/commits/${parent}`);
    const tree = [];
    for (const [path, content] of Object.entries(files)) {
      // Binary files (og cards from site packs) go up base64-encoded; text stays readable in the request.
      const body = Buffer.isBuffer(content) ? { content: content.toString('base64'), encoding: 'base64' } : { content, encoding: 'utf-8' };
      const blob = await call('POST', '/git/blobs', body);
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await call('POST', '/git/trees', { base_tree: baseTree.sha, tree });
    const commit = await call('POST', '/git/commits', { message, tree: newTree.sha, parents: [parent] });
    // The branch is created at the first commit rather than up front, so a failed first save leaves nothing behind.
    const name = branch ?? branchName(now());
    if (branch) await call('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
    else await call('POST', '/git/refs', { ref: `refs/heads/${name}`, sha: commit.sha });
    branch = name;
    head = commit.sha;
    for (const [path, content] of Object.entries(files)) overlay.set(path, content);
    // Retried on every save until it succeeds, so a transient failure here never strands the branch without a PR.
    if (!pull) {
      try {
        const opened = await call('POST', '/pulls', {
          title: `Content: admin edits (${name.replace('content/', '')})`,
          head: name,
          base,
          body: 'Content edits saved from the local admin (`npm run admin`). CI runs `npm run check`; review the pages before merging.',
        });
        pull = { url: opened.html_url, number: opened.number };
      } catch (error) {
        throw new Error(`Committed to ${name}, but opening the pull request failed (the next save retries). ${error.message}`);
      }
    }
    return {
      message: `Committed ${Object.keys(files).length} file(s) to ${branch}. Review and merge PR #${pull.number} to publish.`,
      link: { href: pull.url, label: `PR #${pull.number}` },
    };
  }

  return {
    name: 'github',
    describe: () => ({
      label: `GitHub ${repo}`,
      detail: branch
        ? `Saves commit to ${branch}. Reads come from this checkout plus files saved in this session.`
        : `The first save creates a content/admin-… branch from ${base} and opens a PR. Reads come from this checkout.`,
      link: pull ? { href: pull.url, label: `PR #${pull.number}` } : undefined,
    }),
    read: path => overlay.get(path),
    save(files, message) {
      const run = queue.then(() => persist(files, message));
      queue = run.catch(() => {});
      return run;
    },
  };
}
