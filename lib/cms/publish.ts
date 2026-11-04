// After a CMS save: which cached pages to refresh (cache tags, lib/content/tags.ts), and whether the change needs a
// rebuild (pages that exist or image hosts are fixed per build: new or removed sites and people, renamed slugs, page
// switches, new image hosts). Rebuilds go through a Vercel Deploy Hook (VERCEL_DEPLOY_HOOK_URL).
import { siteTag, TAG_LEGAL, TAG_REGISTRY, TAG_SITES } from '../content/tags.ts';

/** Cache tags covering the saved files. */
export function tagsFor(paths: string[]): string[] {
  const tags = new Set<string>();
  for (const path of paths) {
    const site = /^src\/sites\/([a-z0-9-]+)\/[a-z]+\.json$/.exec(path);
    if (site) {
      tags.add(siteTag(site[1]));
      tags.add(TAG_SITES);
    } else if (path === 'src/sites/registry.json') {
      tags.add(TAG_REGISTRY);
      tags.add(TAG_SITES);
    } else if (path.startsWith('src/copy/legal/')) tags.add(TAG_LEGAL);
  }
  return [...tags];
}

/** Starts a production rebuild when a Deploy Hook is configured; returns whether one was started. */
export async function triggerRebuild(reason: string): Promise<boolean> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) return false;
  try {
    const response = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    console.log(JSON.stringify({ service: 'appearances', event: 'cms.rebuild', reason, status: response.status }));
    return response.ok;
  } catch (error) {
    console.error(JSON.stringify({ service: 'appearances', event: 'cms.rebuild_failed', reason, message: (error as Error).message }));
    return false;
  }
}
