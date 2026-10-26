// Who may be indexed. A site is indexable only when its site.json says `indexable: true` (the launch switch, default
// false); the hub pages only when registry.json says so. Two guards override the content, so a launch can never leak
// from the wrong deployment and can be undone in one step:
// - a Vercel preview deployment (VERCEL_ENV=preview) never indexes
// - SEARCH_INDEXING=off switches indexing off everywhere (the kill switch; redeploy to apply)
// Everything that depends on indexing (robots meta, X-Robots-Tag, robots.txt, sitemaps, llms.txt, the gate's public
// paths, the concept banner) reads these helpers or the manifest built from them, never the raw flag.
import type { Registry, Site, SiteLang } from '../content/types.ts';

type Env = Record<string, string | undefined>;

export const indexingAllowed = (env: Env = process.env): boolean =>
  env.VERCEL_ENV !== 'preview' && env.SEARCH_INDEXING?.toLowerCase() !== 'off';

export const isSiteIndexable = (site: Pick<Site, 'indexable'>, env: Env = process.env): boolean =>
  site.indexable === true && indexingAllowed(env);

export const isHubIndexable = (registry: Pick<Registry, 'indexable'>, env: Env = process.env): boolean =>
  registry.indexable === true && indexingAllowed(env);

export const indexableSlugs = (sites: Site[], env: Env = process.env): string[] =>
  sites.filter(site => isSiteIndexable(site, env)).map(site => site.slug);

/** The site's content language (BCP 47). */
export const langFor = (site: Pick<Site, 'lang'> | null | undefined): SiteLang => site?.lang ?? 'en-GB';

/** `en-GB` -> `en_GB` for og:locale. */
export const ogLocale = (lang: string): string => lang.replace('-', '_');
