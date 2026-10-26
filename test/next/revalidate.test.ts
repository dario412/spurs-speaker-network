// POST /api/revalidate (lib/revalidate/handler.ts) and the tagged content layer (lib/content/cached.ts): auth, body
// validation, which tags are revalidated, rate limiting, logging without the secret, which tags each read carries, and
// that a site's domain copy (`<slug>--domain`, lib/pages/mount.ts) carries the same tags as its hub folder copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { type CacheFn, MAX_TAGS_PER_ENTRY, peopleFromPages, withCacheTags } from '../../lib/content/cached.ts';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { createMemoryProvider } from '../../lib/content/memory-provider.ts';
import { isContentTag } from '../../lib/content/tags.ts';
import { mountedSite } from '../../lib/pages/mount.ts';
import {
  createRateLimiter,
  handleRevalidate,
  MAX_BODY_BYTES,
  parseBody,
  type RevalidateDeps,
  type RevalidateMode,
} from '../../lib/revalidate/handler.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';

const SECRET = 'webhook secret value 0123456789';

function setup(overrides: Partial<RevalidateDeps> = {}) {
  const revalidated: [string, RevalidateMode][] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: RevalidateDeps = {
    secret: SECRET,
    revalidate: (tag, mode) => void revalidated.push([tag, mode]),
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    log: entry => void logs.push(entry),
    now: () => 1_000,
    ...overrides,
  };
  const call = async (body: unknown, headers: Record<string, string> = { 'x-revalidate-secret': SECRET }) => {
    const response = await handleRevalidate(
      new Request('https://appearances.example/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      deps,
    );
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { call, revalidated, logs };
}

test('auth: no secret configured fails closed; a wrong or missing secret is 401 and revalidates nothing', async () => {
  const unset = setup({ secret: undefined });
  assert.equal((await unset.call({ site: 'spurs' })).status, 503);
  const { call, revalidated } = setup();
  assert.equal((await call({ site: 'spurs' }, {})).status, 401);
  assert.equal((await call({ site: 'spurs' }, { 'x-revalidate-secret': 'wrong' })).status, 401);
  assert.equal((await call({ site: 'spurs' }, { 'x-revalidate-secret': `${SECRET}x` })).status, 401);
  assert.equal((await call({ site: 'spurs' }, { authorization: `Basic ${btoa(`x:${SECRET}`)}` })).status, 401);
  assert.deepEqual(revalidated, []);
  assert.equal((await call({ site: 'spurs' }, { authorization: `Bearer ${SECRET}` })).status, 200, 'Bearer works too');
});

test('tags: { site }, { site, person } and { tags } map to the right cache tags; immediate expires at once', async () => {
  const { call, revalidated } = setup();
  const site = await call({ site: 'spurs' });
  assert.equal(site.status, 200);
  assert.deepEqual(site.body.tags, ['site:spurs']);
  assert.equal(site.body.mode, 'max');
  await call({ site: 'spurs', person: 'dele-alli' });
  await call({ tags: ['all', 'site:eastvale', 'site:eastvale', 'legal:terms', 'person:northbridge:some-one'], immediate: true });
  assert.deepEqual(revalidated, [
    ['site:spurs', 'max'],
    ['person:spurs:dele-alli', 'max'],
    ['all', 'expire'],
    ['site:eastvale', 'expire'],
    ['legal:terms', 'expire'],
    ['person:northbridge:some-one', 'expire'],
  ]);
});

test('body validation: malformed or unknown input is a 400 that revalidates nothing', async () => {
  const { call, revalidated } = setup();
  for (const [body, message] of [
    ['not json', /JSON/],
    [[], /JSON object/],
    [{}, /"site" must be a site slug/],
    [{ site: '../x' }, /"site" must be a site slug/],
    [{ site: 'spurs', person: 'Dele Alli' }, /"person" must be a person slug/],
    [{ tags: [] }, /non-empty array/],
    [{ tags: ['site:Spurs'] }, /unknown tag/],
    [{ tags: ['everything'] }, /unknown tag/],
    [{ tags: ['all'], site: 'spurs' }, /not both/],
    [{ site: 'spurs', path: '/spurs' }, /unknown field/],
    [{ site: 'spurs', immediate: 'yes' }, /"immediate" must be true or false/],
    [{ tags: Array.from({ length: 51 }, (_, i) => `site:s${i}`) }, /at most 50/],
  ] as [unknown, RegExp][]) {
    const response = await call(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(response.body.message, message, JSON.stringify(body));
  }
  assert.equal((await call(`{"tags":["all"],"pad":"${'x'.repeat(MAX_BODY_BYTES)}"}`)).status, 413);
  assert.deepEqual(revalidated, []);
});

test('rate limit: light, per client, checked before the secret', async () => {
  const { call } = setup({ limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) });
  const from = (ip: string) => ({ 'x-revalidate-secret': SECRET, 'x-forwarded-for': `${ip}, 10.0.0.1` });
  assert.equal((await call({ site: 'spurs' }, from('203.0.113.1'))).status, 200);
  assert.equal((await call({ site: 'spurs' }, { 'x-forwarded-for': '203.0.113.1' })).status, 401);
  const limited = await call({ site: 'spurs' }, from('203.0.113.1'));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await call({ site: 'spurs' }, from('203.0.113.2'))).status, 200, 'another client is unaffected');
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
  assert.ok(limiter.take('a', 0));
  assert.ok(!limiter.take('a', 500));
  assert.ok(limiter.take('a', 1000), 'a new window');
});

test('logging: one structured JSON entry per call, never the secret or the headers', async () => {
  const { call, logs } = setup();
  await call({ site: 'spurs' });
  await call({ site: 'spurs' }, { 'x-revalidate-secret': 'guess' });
  await call('nope');
  assert.deepEqual(
    logs.map(entry => [entry.event, entry.outcome, entry.status]),
    [
      ['revalidate', 'ok', 200],
      ['revalidate', 'unauthorized', 401],
      ['revalidate', 'invalid_body', 400],
    ],
  );
  assert.deepEqual(logs[0].tags, ['site:spurs']);
  const text = JSON.stringify(logs);
  assert.ok(!text.includes(SECRET) && !text.includes('guess'), 'a secret reached the log');
});

test('a revalidate failure is a 500, logged', async () => {
  const { call, logs } = setup({
    revalidate: () => {
      throw new Error('Invariant: static generation store missing');
    },
  });
  assert.equal((await call({ site: 'spurs' })).status, 500);
  assert.equal(logs[0].outcome, 'error');
});

test('parseBody only produces tags the content layer assigns', () => {
  for (const body of [{ site: 'spurs' }, { site: 'man-utd', person: 'a-b' }, { tags: ['registry', 'sites', 'legal', 'legal:privacy'] }]) {
    const parsed = parseBody(body);
    assert.ok(typeof parsed !== 'string', JSON.stringify(body));
    for (const tag of parsed.tags) assert.ok(isContentTag(tag), tag);
  }
});

test('cache layer: every read carries the tags the endpoint revalidates', async () => {
  const seen: { key: string[]; tags: string[] }[] = [];
  const record: CacheFn = (load, key, tags) => {
    seen.push({ key, tags });
    return load();
  };
  const json = createJsonProvider({ cache: false });
  const cached = withCacheTags(json, record, {
    peopleOf: peopleFromPages(['/spurs', '/spurs/legends/dele-alli', '/spurs/legends/sandro']),
  });
  await cached.getSite('spurs');
  await cached.getLegal('terms');
  await cached.getRegistry();
  assert.equal(await cached.getSite('../spurs'), null, 'malformed slugs never create cache entries');
  assert.deepEqual(seen, [
    { key: ['site', 'spurs'], tags: ['all', 'site:spurs', 'person:spurs:dele-alli', 'person:spurs:sandro'] },
    { key: ['legal', 'terms'], tags: ['all', 'legal', 'legal:terms'] },
    { key: ['registry'], tags: ['all', 'registry', 'sites'] },
  ]);
  assert.ok(seen.every(entry => entry.tags.every(isContentTag)));
});

test('cache layer: the site lists are composed from the per-site entries, so one site’s change is one source read', async () => {
  // Several sites (the real ones plus test/fixtures/sites.mjs), so "none for the others" means something.
  const json = createJsonProvider({ sitesDir: writeSitesDir(), cache: false });
  const reads: string[] = [];
  const counting = {
    ...json,
    getSite: (slug: string) => {
      reads.push(slug);
      return json.getSite(slug);
    },
    listSites: () => Promise.reject(new Error('listSites must not read the source')),
  };
  // A cache that remembers entries until a tag is revalidated, like Next's.
  const entries = new Map<string, { value: unknown; tags: string[] }>();
  const cache: CacheFn = async (load, key, tags) => {
    const id = key.join('|');
    if (!entries.has(id)) entries.set(id, { value: await load(), tags });
    return entries.get(id)?.value as never;
  };
  const revalidate = (tag: string) => {
    for (const [id, entry] of entries) if (entry.tags.includes(tag)) entries.delete(id);
  };
  const cached = withCacheTags(counting, cache, { peopleOf: () => ['dele-alli'] });
  const sites = await cached.listSites();
  assert.deepEqual(sites, await json.listSites());
  assert.ok(sites.length > 1);
  assert.equal(reads.length, sites.length);
  reads.length = 0;
  revalidate('site:spurs');
  await cached.listSites();
  await cached.getSite('spurs');
  assert.deepEqual(reads, ['spurs'], 'one read for the revalidated site, none for the others');
  reads.length = 0;
  revalidate('person:spurs:dele-alli');
  await cached.getSite('spurs');
  assert.deepEqual(reads, ['spurs']);
  // Concurrent misses (pages regenerating together after a revalidation) share one in-flight read.
  reads.length = 0;
  const uncached = withCacheTags(counting, (load: () => Promise<unknown>) => load() as never);
  await Promise.all([uncached.getSite('spurs'), uncached.getSite('spurs'), uncached.getSite('spurs')]);
  assert.deepEqual(reads, ['spurs']);
  await uncached.getSite('spurs');
  assert.deepEqual(reads, ['spurs', 'spurs'], 'a later read goes to the source again');
});

test('cache layer: person tags stay under Next’s 128-tag cap, and come from the manifest’s page list', () => {
  const seen: string[][] = [];
  const cached = withCacheTags(
    createJsonProvider({ cache: false }),
    (load, _key, tags) => {
      seen.push(tags);
      return load();
    },
    {
      peopleOf: () => Array.from({ length: 300 }, (_, i) => `p${i}`),
    },
  );
  return cached.getSite('spurs').then(() => {
    assert.equal(seen[0].length, MAX_TAGS_PER_ENTRY);
    assert.deepEqual(peopleFromPages(['/a/legends/x', '/a/legends', '/b/legends/y', '/a/legends/z'])('a'), ['x', 'z']);
  });
});

test('cache tags and domain mounts: both copies of a site read the same tagged entry, so site:<slug> refreshes both and no other site', async () => {
  const example = (name: string) => JSON.parse(readFileSync(join('schema', 'examples', name), 'utf8'));
  const registry = example('registry.json');
  const memory = createMemoryProvider({
    registry,
    sites: [example('site-populated.json'), example('site-shell.json')],
    legal: { terms: example('legal-terms.json'), privacy: example('legal-privacy.json') },
  });
  // The source: northbridge's tagline changes in the CMS between renders.
  let tagline = 'Before the edit';
  const reads: string[] = [];
  const source = {
    ...memory,
    getSite: async (slug: string) => {
      reads.push(slug);
      const site = await memory.getSite(slug);
      return site?.slug === 'northbridge' ? { ...site, tagline } : site;
    },
  };
  // A cache that remembers entries until a tag is revalidated, and, like Next during a prerender, gives each page the
  // tags of every entry it read.
  const entries = new Map<string, { value: unknown; tags: string[] }>();
  let pageTags: Set<string> | null = null;
  const cache: CacheFn = async (load, key, tags) => {
    for (const tag of tags) pageTags?.add(tag);
    const id = key.join('|');
    if (!entries.has(id)) entries.set(id, { value: await load(), tags });
    return entries.get(id)?.value as never;
  };
  const revalidate = (tag: string) => {
    for (const [id, entry] of entries) if (entry.tags.includes(tag)) entries.delete(id);
  };
  const cached = withCacheTags(source, cache, { peopleOf: () => ['jo-marsh'] });
  const render = async (segment: string) => {
    pageTags = new Set();
    const mounted = await mountedSite(cached, segment);
    const tags = [...pageTags].sort();
    pageTags = null;
    return { mounted, tags };
  };

  const folder = await render('northbridge');
  const domain = await render('northbridge--domain');
  assert.equal(folder.mounted?.onDomain, false);
  assert.equal(domain.mounted?.onDomain, true);
  assert.deepEqual(domain.mounted?.domain, registry.domains.northbridge);
  assert.deepEqual(domain.tags, folder.tags, 'the domain copy carries exactly the hub folder copy’s tags');
  for (const tag of ['site:northbridge', 'person:northbridge:jo-marsh', 'all'])
    assert.ok(domain.tags.includes(tag), `the domain copy is tagged ${tag}`);
  assert.ok(!domain.tags.includes('site:eastvale'), 'another site’s change never regenerates this site’s pages');
  assert.equal(await mountedSite(cached, 'eastvale--domain'), null, 'no domain, no mount');
  assert.deepEqual(reads, ['northbridge', 'eastvale'], 'one source read for both copies');

  tagline = 'After the edit';
  assert.equal((await render('northbridge--domain')).mounted?.site.tagline, 'Before the edit', 'cached until revalidated');
  revalidate('site:eastvale');
  assert.equal((await render('northbridge--domain')).mounted?.site.tagline, 'Before the edit', 'another site’s tag leaves it alone');
  reads.length = 0;
  revalidate('site:northbridge');
  assert.equal((await render('northbridge--domain')).mounted?.site.tagline, 'After the edit', 'the domain copy refreshes');
  assert.equal((await render('northbridge')).mounted?.site.tagline, 'After the edit', 'and so does the hub folder copy');
  assert.deepEqual(reads, ['northbridge'], 'from one shared source read');
  revalidate('person:northbridge:jo-marsh');
  tagline = 'Person edit';
  assert.equal((await render('northbridge--domain')).mounted?.site.tagline, 'Person edit', 'a person tag refreshes the domain copy too');
});
