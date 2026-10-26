// Content entry point for the Next.js app: the selected providers (select.ts), read through the tagged cache layer
// (cached.ts) so POST /api/revalidate can refresh pages without a redeploy. Imports next/cache, so only app code may
// import this file; scripts, next.config.ts and plain Node tests use select.ts.
import { unstable_cache } from 'next/cache';
import { manifest } from '../manifest.ts';
import { type CacheFn, passThrough, peopleFromPages, withCacheTags } from './cached.ts';
import type { ContentProvider } from './provider.ts';
import { selectProvider } from './select.ts';

export type { ContentProvider, PeopleProvider, PeopleResult } from './provider.ts';
export * from './publish.ts';
export { selectProvider, withPeople } from './select.ts';
export type * from './types.ts';

// unstable_cache is Next 16's cache for non-fetch data without Cache Components (docs: "Caching (Previous Model)").
// Entries survive deployments, so every key is scoped to this build (APPEARANCES_CACHE_SCOPE, set in next.config.ts):
// a deploy never serves the previous deploy's content. Switching to Cache Components later means replacing this one
// function with a 'use cache' + cacheTag() wrapper.
const scope = process.env.APPEARANCES_CACHE_SCOPE ?? 'local';
const nextCache: CacheFn = (load, key, tags) => unstable_cache(load, [scope, ...key], { tags })();

let provider: ContentProvider | undefined;
/** The process-wide, tagged content provider. `next dev` reads through uncached, so edits show on reload. */
export const content = (): ContentProvider => {
  provider ??=
    process.env.NODE_ENV === 'development'
      ? withCacheTags(selectProvider(), passThrough)
      : withCacheTags(selectProvider(), nextCache, { peopleOf: peopleFromPages(manifest().pages) });
  return provider;
};
