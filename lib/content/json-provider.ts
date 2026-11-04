// Default provider: reads the JSON content in src/sites/ (the same files the admin, validator and site packs use)
// and the legal markdown in src/copy/legal/. Server-only (node:fs). The paths are dynamic, so the files are added to
// the deployment with outputFileTracingIncludes in next.config.ts (turbopackIgnore stops whole-project tracing).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentError } from './errors.ts';
import { parseLegal } from './legal.ts';
import type { ContentProvider } from './provider.ts';
import { isActive, publishable, publishedSites } from './publish.ts';
import type { LegalDoc, LegalKind, RawSite, Registry } from './types.ts';

export interface JsonProviderOptions {
  /** Directory holding registry.json and one folder per site (default `$APPEARANCES_SITES_DIR`, else `<cwd>/src/sites`). */
  sitesDir?: string;
  /** Directory holding terms.md and privacy.md (default `<cwd>/src/copy/legal`). */
  legalDir?: string;
  /** Keep parsed files in memory (default: on outside `next dev`, so content edits show without a restart). */
  cache?: boolean;
  /**
   * Saved edits that take precedence over the files, keyed by repo-relative path (`src/sites/spurs/site.json`,
   * `src/copy/legal/terms.md`): the CMS provider's database rows (lib/content/cms-provider.ts).
   */
  overlay?: ReadonlyMap<string, string>;
  /** Names the provider in errors (default `json`). */
  name?: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createJsonProvider(options: JsonProviderOptions = {}): ContentProvider {
  // APPEARANCES_SITES_DIR points a whole build at other content (the test suite's fixture sites); unset in deployments.
  const sitesDir = options.sitesDir ?? process.env.APPEARANCES_SITES_DIR ?? join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'sites');
  const legalDir = options.legalDir ?? join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'copy', 'legal');
  const cache = options.cache ?? process.env.NODE_ENV !== 'development';
  const overlay = options.overlay ?? new Map<string, string>();
  const provider = options.name ?? 'json';
  const memo = new Map<string, unknown>();
  const once = <T>(key: string, load: () => T): T => {
    if (!cache) return load();
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key) as T;
  };
  // Unreadable or malformed files are typed errors (never an empty site), naming the file but not the absolute path.
  const read = (path: string, name: string, key: string): string => {
    const saved = overlay.get(key);
    if (saved !== undefined) return saved;
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      throw new ContentError('unavailable', `Cannot read ${name}: ${(error as NodeJS.ErrnoException).code ?? 'error'}`, {
        provider,
        cause: error,
      });
    }
  };
  const siteKey = (parts: string[]) => `src/sites/${parts.join('/')}`;
  const readJson = <T>(...parts: string[]): T => {
    const name = parts.join('/');
    const text = read(join(/*turbopackIgnore: true*/ sitesDir, ...parts), name, siteKey(parts));
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new ContentError('invalid_content', `${name} is not valid JSON`, { provider, cause: error });
    }
  };
  const optionalJson = <T>(fallback: T, ...parts: string[]): T =>
    overlay.has(siteKey(parts)) || existsSync(join(/*turbopackIgnore: true*/ sitesDir, ...parts)) ? readJson<T>(...parts) : fallback;

  const registry = () => once('registry', () => readJson<Registry>('registry.json'));
  const raw = (slug: string): RawSite | null =>
    once(`raw:${slug}`, () => {
      // Only slugs the registry lists can be read, so a request path can never reach another directory.
      if (!SLUG.test(slug) || !registry().order.includes(slug)) return null;
      return {
        ...readJson<Omit<RawSite, 'people' | 'images' | 'licences' | 'verification'>>(slug, 'site.json'),
        people: readJson(slug, 'people.json'),
        images: readJson(slug, 'images.json'),
        licences: optionalJson({ images: {}, marks: {} }, slug, 'licences.json'),
        verification: optionalJson({ pages: {}, people: {} }, slug, 'verification.json'),
      } as RawSite;
    });
  const raws = () =>
    once('raws', () =>
      registry()
        .order.map(raw)
        .filter((site): site is RawSite => site !== null),
    );

  return {
    getRegistry: async () => registry(),
    listSites: async () => once('sites', () => publishedSites(registry(), raws())),
    getSite: async slug => {
      const site = raw(slug);
      return site && isActive(site) ? once(`site:${slug}`, () => publishable(site)) : null;
    },
    getRawSite: async slug => raw(slug),
    listRawSites: async () => raws(),
    getLegal: async (kind: LegalKind): Promise<LegalDoc> =>
      once(`legal:${kind}`, () =>
        parseLegal(kind, read(join(/*turbopackIgnore: true*/ legalDir, `${kind}.md`), `${kind}.md`, `src/copy/legal/${kind}.md`)),
      ),
  };
}
