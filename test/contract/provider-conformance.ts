// Provider conformance suite: what any ContentProvider must do for the site to render correctly. Register it from a
// test file with `providerConformance('my provider', { provider: () => createMyProvider() })` and run it with node's
// test runner. A CMS integration is done when this is green (docs/content-contract.md → Conformance).
//
// It checks, against the provider's real output:
// 1. shapes: registry, raw and published sites, people and legal documents match schema/*.schema.json
// 2. the content rules (scripts/validate-content.mjs) hold for the registry and every stored site
// 3. publishing switches: inactive sites unpublished, hidden people removed, page switches valid, no bookkeeping leaks
// 4. slugs: unique, URL-safe, unknown or malformed slugs resolve to null
// 5. image references resolve: every referenced id is in `images`, every URL is a usable https URL
// 6. legal content is present (terms and privacy)
// 7. deterministic ordering: repeated reads and fresh instances return identical data, in registry order
// 8. per-site domains (registry.domains) pass through unchanged: the proxy routes hosts by them (lib/domains.ts)
// 9. errors are typed: a broken source raises ContentError, never a raw exception or a silently empty result
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { schemaFor } from '../../lib/content/contract/emit.ts';
import { PAGE_KEYS } from '../../lib/content/contract/schemas.ts';
import { formatErrors, validateSchema } from '../../lib/content/contract/validate.ts';
import { isContentError } from '../../lib/content/errors.ts';
import type { ContentProvider } from '../../lib/content/provider.ts';
import { isActive, personImageIds, siteImageIds } from '../../lib/content/publish.ts';
import type { LegalKind, PageKey, RawSite, Registry } from '../../lib/content/types.ts';
import { validateRegistry, validateSite } from '../../scripts/validate-content.mjs';

export interface ConformanceOptions {
  /** Builds the provider under test. Called more than once (fresh instances must agree). */
  provider: () => ContentProvider | Promise<ContentProvider>;
  /**
   * Builds the same provider pointed at a broken source (unreachable host, bad credentials, malformed data). Every read
   * must then either reject with a ContentError or still return real data; none may resolve empty. Construction may
   * throw a ContentError instead. Omit to skip that check (and say why in your test).
   */
  failing?: () => ContentProvider | Promise<ContentProvider>;
  /** Switch states the content is known to contain, asserted concretely (the generic checks hold either way). */
  expect?: {
    inactiveSites?: string[];
    hiddenPeople?: [site: string, person: string][];
    pagesOff?: [site: string, page: PageKey][];
    /** registry.domains as stored (`{}` or undefined for none); getRegistry() must return it unchanged. */
    domains?: Registry['domains'];
  };
  /**
   * Fetch each image URL once (HEAD, expecting 2xx and an image content type). Off by default: tests never touch the
   * network. Turn it on for a one-off check of a real CMS (`CONTRACT_FETCH_IMAGES=1`).
   */
  fetchImages?: typeof fetch;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Airtable attachment URLs expire 2 hours after the API returns them, so they can never be a page's image.
const EXPIRING_HOSTS = /(^|\.)airtableusercontent\.com$/;
const LEGAL_KINDS: LegalKind[] = ['terms', 'privacy'];
const MALFORMED = ['', 'Spurs', '../registry', 'a/b', 'a b', '-a', 'a-', 'site%2F..'];

const shape = (file: Parameters<typeof schemaFor>[0], value: unknown, what: string) => {
  const errors = formatErrors(validateSchema(schemaFor(file), value));
  assert.deepEqual(errors, [], `${what} does not match schema/${file}.schema.json:\n  ${errors.slice(0, 20).join('\n  ')}`);
};

export function providerConformance(name: string, options: ConformanceOptions): void {
  const load = async () => {
    const provider = await options.provider();
    const [registry, raws, sites] = await Promise.all([provider.getRegistry(), provider.listRawSites(), provider.listSites()]);
    return { provider, registry, raws, sites };
  };

  describe(`provider conformance: ${name}`, () => {
    test('shapes match the JSON Schema (registry, raw and published sites, people, legal)', async () => {
      const { provider, registry, raws, sites } = await load();
      shape('registry', registry, 'getRegistry()');
      for (const raw of raws) shape('raw-site', raw, `listRawSites() → ${raw.slug}`);
      for (const site of sites) {
        shape('site', site, `listSites() → ${site.slug}`);
        shape('site', await provider.getSite(site.slug), `getSite("${site.slug}")`);
        for (const person of site.people) shape('person', person, `${site.slug} → ${person.slug}`);
      }
      for (const kind of LEGAL_KINDS) shape('legal', await provider.getLegal(kind), `getLegal("${kind}")`);
    });

    test('content rules hold (scripts/validate-content.mjs)', async () => {
      const { registry, raws } = await load();
      const problems = [...validateRegistry(registry, raws), ...raws.flatMap(raw => validateSite(raw))];
      assert.deepEqual(problems, [], problems.slice(0, 20).join('\n'));
    });

    test('publishing switches: inactive sites, hidden people and page switches', async () => {
      const { provider, registry, raws, sites } = await load();
      const bySlug = new Map(raws.map(raw => [raw.slug, raw]));
      assert.ok(sites.length > 0, 'no published site: an empty site list must be an error, not a result');
      assert.deepEqual(
        sites.map(site => site.slug),
        registry.order.filter(slug => bySlug.has(slug) && isActive(bySlug.get(slug) as RawSite)),
        'listSites() must be the active sites in registry order',
      );
      if (registry.rootSite !== undefined)
        assert.ok(isActive(bySlug.get(registry.rootSite) ?? { active: false }), 'rootSite, when set, must be published');
      for (const raw of raws.filter(raw => !isActive(raw))) {
        assert.equal(await provider.getSite(raw.slug), null, `inactive site ${raw.slug} must not be published`);
        assert.ok(await provider.getRawSite(raw.slug), `inactive site ${raw.slug} stays readable as stored`);
      }
      for (const site of sites) {
        const raw = bySlug.get(site.slug) as RawSite;
        assert.deepEqual(site.people, raw.people.filter(isActive), `${site.slug}: published people = stored people minus hidden ones`);
        assert.ok(!('licences' in site) && !('verification' in site), `${site.slug}: bookkeeping must never reach the renderer`);
        for (const key of Object.keys(site.pages ?? {}))
          assert.ok((PAGE_KEYS as readonly string[]).includes(key), `${site.slug}: page "${key}"`);
        const live = new Set(site.people.map(person => person.slug));
        for (const slug of site.featured) assert.ok(live.has(slug), `${site.slug}: featured "${slug}" is not published`);
      }
      for (const slug of options.expect?.inactiveSites ?? []) {
        assert.ok(bySlug.has(slug), `expected inactive site ${slug} is not stored`);
        assert.equal(await provider.getSite(slug), null, `${slug} should be inactive`);
      }
      for (const [slug, person] of options.expect?.hiddenPeople ?? []) {
        assert.ok(
          bySlug.get(slug)?.people.some(entry => entry.slug === person),
          `${slug}/${person} should be stored`,
        );
        assert.ok(!(await provider.getSite(slug))?.people.some(entry => entry.slug === person), `${slug}/${person} should be hidden`);
      }
      for (const [slug, page] of options.expect?.pagesOff ?? [])
        assert.equal((await provider.getSite(slug))?.pages?.[page], false, `${slug}: ${page} should be switched off`);
    });

    test('slugs are unique and URL-safe; unknown or malformed slugs resolve to null', async () => {
      const { provider, registry, raws } = await load();
      assert.equal(new Set(registry.order).size, registry.order.length, 'registry.order lists a site twice');
      for (const slug of registry.order) assert.match(slug, SLUG);
      for (const raw of raws) {
        const people = raw.people.map(person => person.slug);
        assert.equal(new Set(people).size, people.length, `${raw.slug}: a person slug is used twice`);
        for (const slug of people) assert.match(slug, SLUG, `${raw.slug}: person slug "${slug}"`);
      }
      for (const from of Object.keys(registry.redirects)) assert.ok(!registry.order.includes(from), `redirect "${from}" shadows a site`);
      for (const slug of ['no-such-site-anywhere', ...MALFORMED]) {
        assert.equal(await provider.getSite(slug), null, `getSite(${JSON.stringify(slug)})`);
        assert.equal(await provider.getRawSite(slug), null, `getRawSite(${JSON.stringify(slug)})`);
      }
    });

    test('image references resolve to usable https URLs', async () => {
      const { raws } = await load();
      const urls = new Set<string>();
      for (const raw of raws) {
        const shell = raw.status === 'shell';
        const ids = [...siteImageIds(raw), ...raw.people.flatMap(personImageIds)];
        for (const id of ids) {
          if (id === null) {
            assert.ok(shell, `${raw.slug}: null image outside a shell site`);
            continue;
          }
          assert.ok(Object.hasOwn(raw.images, id), `${raw.slug}: image "${id}" is referenced but not in images`);
        }
        for (const [id, url] of Object.entries(raw.images)) {
          assert.ok(URL.canParse(url), `${raw.slug}: images.${id} is not a URL`);
          const parsed = new URL(url);
          assert.equal(parsed.protocol, 'https:', `${raw.slug}: images.${id} must be https`);
          assert.ok(
            !EXPIRING_HOSTS.test(parsed.hostname),
            `${raw.slug}: images.${id} is an expiring Airtable attachment URL; mirror it to R2`,
          );
          urls.add(url);
        }
      }
      if (!options.fetchImages) return;
      for (const url of urls) {
        const response = await options.fetchImages(url, { method: 'HEAD' });
        assert.ok(response.ok, `${url} answered ${response.status}`);
        assert.match(response.headers.get('content-type') ?? '', /^image\//, `${url} is not an image`);
      }
    });

    test('legal content is present (terms and privacy)', async () => {
      const { provider } = await load();
      for (const kind of LEGAL_KINDS) {
        const doc = await provider.getLegal(kind);
        assert.equal(doc.kind, kind);
        assert.ok(doc.title.trim(), `${kind}: empty title`);
        assert.ok(doc.body.trim().length >= 20, `${kind}: the body is empty or a stub`);
      }
    });

    test('ordering is deterministic (repeated reads and fresh instances agree)', async () => {
      const first = await load();
      const again = await load();
      for (const key of ['registry', 'raws', 'sites'] as const)
        assert.equal(JSON.stringify(again[key]), JSON.stringify(first[key]), `${key} differs between two provider instances`);
      assert.equal(JSON.stringify(await first.provider.listSites()), JSON.stringify(first.sites), 'listSites() differs between calls');
      assert.deepEqual(
        first.raws.map(raw => raw.slug),
        first.registry.order.filter(slug => first.raws.some(raw => raw.slug === slug)),
        'listRawSites() must follow registry order',
      );
      for (const site of first.sites)
        assert.equal(
          JSON.stringify(await first.provider.getSite(site.slug)),
          JSON.stringify(site),
          `getSite("${site.slug}") ≠ its listSites() entry`,
        );
    });

    test('per-site domains pass through: registry.domains is returned as stored, for sites in the registry', async () => {
      const { registry } = await load();
      for (const slug of Object.keys(registry.domains ?? {}))
        assert.ok(registry.order.includes(slug), `registry.domains.${slug} is not a site in registry.order`);
      if (options.expect?.domains === undefined) return;
      assert.deepEqual(registry.domains ?? {}, options.expect.domains, 'getRegistry() must return registry.domains unchanged');
      const fresh = await (await options.provider()).getRegistry();
      assert.deepEqual(fresh.domains ?? {}, options.expect.domains, 'a fresh instance returns the same domains');
    });

    test('errors are typed ContentErrors, never silent', { skip: options.failing ? false : 'no failing source given' }, async () => {
      const healthy = await load();
      let broken: ContentProvider;
      try {
        broken = await (options.failing as NonNullable<ConformanceOptions['failing']>)();
      } catch (error) {
        assert.ok(isContentError(error), `constructing a broken provider threw ${String(error)} instead of a ContentError`);
        return;
      }
      const known = healthy.sites[0].slug;
      const reads: [string, () => Promise<unknown>][] = [
        ['getRegistry()', () => broken.getRegistry()],
        ['listSites()', () => broken.listSites()],
        ['listRawSites()', () => broken.listRawSites()],
        [`getSite("${known}")`, () => broken.getSite(known)],
        [`getRawSite("${known}")`, () => broken.getRawSite(known)],
        ...LEGAL_KINDS.map(kind => [`getLegal("${kind}")`, () => broken.getLegal(kind)] as [string, () => Promise<unknown>]),
      ];
      let rejected = 0;
      for (const [label, read] of reads) {
        try {
          const value = await read();
          assert.ok(
            value !== null && !(Array.isArray(value) && value.length === 0),
            `${label} resolved empty on a broken source (silent failure)`,
          );
        } catch (error) {
          rejected += 1;
          assert.ok(
            isContentError(error),
            `${label} threw ${(error as Error)?.name}: ${(error as Error)?.message} instead of a ContentError`,
          );
          assert.ok((error as Error).message, `${label}: ContentError without a message`);
        }
      }
      assert.ok(rejected > 0, 'the broken source raised no error at all');
    });
  });
}
