// Proxy logic (lib/proxy): gate matrix, redirects, fail-closed production, headers, CSP, indexing and caching.
// Pure functions, no Next.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrigin, publicOrigin } from '../../lib/origin.ts';
import { buildCsp } from '../../lib/proxy/csp.ts';
import {
  cacheControl,
  type Decision,
  decide,
  NOT_FOUND_REWRITE,
  type ProxyConfig,
  publicPath,
  renamedCard,
} from '../../lib/proxy/decide.ts';
import { basicPassword, hasAccess, matches, passwordsFromEnv, passwordVar } from '../../lib/proxy/gate.ts';

// A root site takes `/`, so the landing page is at /all (the landing-page-as-home cases use `home` below).
const manifest = {
  rootSite: 'spurs' as string | null,
  redirects: { rovers: 'eastvale' },
  slugs: ['spurs', 'northbridge', 'eastvale', 'man-utd'],
  imageHosts: ['https://media.gettyimages.com', 'https://upload.wikimedia.org'],
  pages: ['/all', '/terms', '/privacy', '/spurs', '/spurs/legends', '/spurs/legends/sandro', '/spurs/site-wide', '/northbridge'],
  indexable: [] as string[],
  hubIndexable: false,
  domains: {} as ProxyConfig['manifest']['domains'],
  hubHost: 'appearances.getapeptalk.com',
  tracking: [] as string[],
};
const config = (overrides: Partial<ProxyConfig> = {}): ProxyConfig => ({
  manifest,
  passwords: { master: '', sites: {} },
  production: false,
  previewPublic: false,
  dev: false,
  ...overrides,
});
const gated = config({ passwords: { master: 'master pw', sites: { spurs: 'spurs pw', northbridge: 'northbridge pw' } } });
const basic = (password: string) => `Basic ${Buffer.from(`anyone:${password}`).toString('base64')}`;
const run = (path: string, cfg = config(), { method = 'GET', password }: { method?: string; password?: string } = {}) =>
  decide({ method, url: `http://localhost${path}`, authorization: password === undefined ? null : basic(password) }, cfg);
const status = (decision: Decision) => (decision.action === 'respond' ? decision.status : 200);

test('per-site password variables: hyphens become underscores; unknown variables are ignored', () => {
  assert.equal(passwordVar('spurs'), 'PREVIEW_PASSWORD_SPURS');
  assert.equal(passwordVar('man-utd'), 'PREVIEW_PASSWORD_MAN_UTD');
  assert.deepEqual(
    passwordsFromEnv(
      { PREVIEW_PASSWORD: 'm', PREVIEW_PASSWORD_MAN_UTD: 'u', PREVIEW_PASSWORD_NOPE: 'x', PREVIEW_PASSWORD_SPURS: '' },
      manifest.slugs,
    ),
    { master: 'm', sites: { 'man-utd': 'u' } },
  );
});

test('password comparison and Basic parsing', async () => {
  assert.equal(await matches('a', 'a'), true);
  assert.equal(await matches('a', 'b'), false);
  assert.equal(await matches('', ''), false, 'an unset secret never matches');
  assert.equal(basicPassword(basic('pa:ss wörd')), 'pa:ss wörd');
  assert.equal(basicPassword('Bearer x'), null);
  assert.equal(basicPassword('Basic !!!'), null);
  assert.equal(basicPassword(null), null);
});

test('no passwords configured: the gate is open', async () => {
  assert.equal(await hasAccess(null, '/all', { master: '', sites: {} }), true);
  assert.equal(status(await run('/spurs')), 200);
});

test('gate matrix: master opens everything; a site password opens only its site and shared assets', async () => {
  const cases: [string, string | undefined, number][] = [
    ['/spurs', undefined, 401],
    ['/spurs', 'wrong', 401],
    ['/spurs', 'master pw', 200],
    ['/all', 'master pw', 200],
    ['/landing.css', 'master pw', 200],
    ['/northbridge/legends/jo-marsh', 'master pw', 200],
    ['/spurs', 'spurs pw', 200],
    ['/spurs/legends/sandro', 'spurs pw', 200],
    ['/spurs/site.css', 'spurs pw', 200],
    ['/northbridge', 'spurs pw', 401],
    ['/northbridge/site.css', 'spurs pw', 401],
    ['/eastvale', 'spurs pw', 401],
    ['/all', 'spurs pw', 302],
    ['/landing.css', 'spurs pw', 401],
    ['/styles.css', 'spurs pw', 200],
    ['/llms.txt', 'northbridge pw', 200],
    ['/fonts/outfit-latin.woff2', 'spurs pw', 200],
    ['/peptalk/logo.png', 'spurs pw', 200],
    ['/terms', 'spurs pw', 200],
    ['/privacy', 'northbridge pw', 200],
    ['/spurs/terms', 'northbridge pw', 401],
    ['/styles.css', undefined, 401],
    ['/og/spurs.jpg', undefined, 200],
    ['/health', undefined, 200],
    ['/nope', 'spurs pw', 401],
    ['/all', 'wrong', 401],
    ['/all', undefined, 401],
    ['/_next/image', 'spurs pw', 200],
    ['/_next/image', undefined, 401],
    ['/sitemap.xml', 'northbridge pw', 200],
  ];
  for (const [path, password, expected] of cases)
    assert.equal(status(await run(path, gated, { password })), expected, `${path} with ${password}`);
  const denied = await run('/spurs', gated);
  assert.equal(denied.action === 'respond' && denied.headers['WWW-Authenticate']?.startsWith('Basic '), true);
});

test('rotating the master password revokes the old one at once', async () => {
  const rotated = config({ passwords: { master: 'new master', sites: {} } });
  assert.equal(status(await run('/spurs', rotated, { password: 'master pw' })), 401);
  assert.equal(status(await run('/spurs', rotated, { password: 'new master' })), 200);
});

test('production without a master password fails closed with 503, unless PREVIEW_PUBLIC', async () => {
  const prod = config({ production: true, passwords: { master: '', sites: { spurs: 'x' } } });
  const page = await run('/spurs', prod);
  assert.equal(status(page), 503);
  assert.match(page.action === 'respond' ? (page.body ?? '') : '', /PREVIEW_PASSWORD/);
  const health = await run('/health', prod);
  assert.equal(status(health), 503);
  assert.equal(status(await run('/og/spurs.jpg', prod)), 503);
  assert.equal(status(await run('/spurs', config({ production: true, previewPublic: true }))), 200);
  assert.equal(status(await run('/spurs', config({ production: true, passwords: { master: 'm', sites: {} } }), { password: 'm' })), 200);
});

test('only GET and HEAD are allowed', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const decision = await run('/spurs/check-availability', config(), { method });
    assert.equal(status(decision), 405, method);
    assert.equal(decision.action === 'respond' && decision.headers.Allow, 'GET, HEAD');
  }
  assert.equal(status(await run('/spurs', config(), { method: 'HEAD' })), 200);
});

test('/api/revalidate: POST only, outside the password gate (the route checks REVALIDATE_SECRET), never cached or indexed', async () => {
  for (const cfg of [config(), gated]) {
    const decision = await run('/api/revalidate', cfg, { method: 'POST' });
    assert.equal(decision.action, 'next', 'no 401 and no 404 rewrite: the route authenticates and answers itself');
    assert.ok(decision.action === 'next' && !decision.rewrite);
    assert.equal(decision.headers['Cache-Control'], 'no-store');
    assert.equal(decision.headers['X-Robots-Tag'], 'noindex, nofollow');
  }
  for (const method of ['GET', 'HEAD', 'PUT']) {
    const decision = await run('/api/revalidate', gated, { method });
    assert.equal(status(decision), 405, method);
    assert.equal(decision.action === 'respond' && decision.headers.Allow, 'POST');
  }
  assert.equal(status(await run('/api/revalidate/extra', gated, { method: 'POST' })), 405, 'only the exact path accepts POST');
  assert.equal(status(await run('/api/revalidate', config({ production: true }), { method: 'POST' })), 503, 'still fails closed');
});

test('redirects: / to the root site and old slugs, keeping the query string, before the gate', async () => {
  const location = (decision: Decision) => (decision.action === 'respond' ? decision.headers.Location : undefined);
  const root = await run('/?utm_source=partner', gated);
  assert.deepEqual([status(root), location(root)], [302, '/spurs?utm_source=partner']);
  const old = await run('/rovers/legends?role=squad', gated);
  assert.deepEqual([status(old), location(old)], [301, '/eastvale/legends?role=squad']);
  assert.equal(location(await run('/rovers')), '/eastvale');
  assert.equal(location(await run('/og/rovers-legends.jpg')), '/og/eastvale-legends.jpg');
  assert.equal(status(await run('/constructor')), 200, 'prototype keys are not redirects (the page then 404s)');
});

test('renamed cards: longest prefix wins, live sites are never captured', () => {
  const redirects = { rovers: 'eastvale', 'man-u': 'man-utd', man: 'mcfc' };
  const live = ['eastvale', 'man-utd', 'mcfc', 'man-city'];
  assert.equal(renamedCard('/og/rovers.jpg', redirects, live), '/og/eastvale.jpg');
  assert.equal(renamedCard('/og/rovers-legends.jpg', redirects, live), '/og/eastvale-legends.jpg');
  assert.equal(renamedCard('/og/man-u-legends.jpg', redirects, live), '/og/man-utd-legends.jpg');
  assert.equal(renamedCard('/og/man-city.jpg', redirects, live), null, 'a live site wins over a shorter redirect');
  assert.equal(renamedCard('/og/eastvale.jpg', redirects, live), null);
  assert.equal(renamedCard('/og/../rovers.jpg', redirects, live), null);
});

test('security headers and CSP on every decision; no nonce (pages are static)', async () => {
  for (const decision of [await run('/spurs'), await run('/spurs', gated), await run('/', config())]) {
    const headers = decision.headers;
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow');
    assert.match(headers['Strict-Transport-Security'], /max-age=\d+/);
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  }
  const page = await run('/spurs/legends');
  assert.equal(page.action, 'next');
  assert.equal('requestHeaders' in page, false, 'nothing from the request reaches the (prerendered) page');
  const csp = buildCsp({ imageHosts: manifest.imageHosts });
  assert.match(csp, /script-src 'self' 'unsafe-inline';/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /img-src 'self' https:\/\/media\.gettyimages\.com https:\/\/upload\.wikimedia\.org;/);
  assert.match(csp, /require-trusted-types-for 'script'; trusted-types 'none'$/);
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "connect-src 'self'"])
    assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-eval|nonce-|strict-dynamic|\*/);
  const dev = buildCsp({ imageHosts: [], dev: true });
  assert.match(dev, /'unsafe-eval'/);
  assert.doesNotMatch(dev, /trusted-types/, 'next dev tooling needs eval');
});

test('origin: PUBLIC_ORIGIN, then the Vercel production domain, then the hub; never the request', () => {
  assert.equal(publicOrigin({ PUBLIC_ORIGIN: 'https://x.test/' }), 'https://x.test');
  assert.equal(publicOrigin({ PUBLIC_ORIGIN: 'http://localhost:3000' }), 'http://localhost:3000');
  assert.equal(publicOrigin({}), 'https://appearances.getapeptalk.com');
  assert.equal(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'app.vercel.app' }), 'https://app.vercel.app');
  assert.equal(
    publicOrigin({ VERCEL_URL: 'preview-abc.vercel.app' }),
    'https://appearances.getapeptalk.com',
    'previews canonicalise to production',
  );
});

test('bug: a malformed PUBLIC_ORIGIN falls back instead of breaking every page', () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (line: string) => errors.push(line);
  try {
    for (const bad of ['appearances.example.com', 'javascript:alert(1)', '/spurs', 'ftp://x.test', 'https://'])
      assert.equal(publicOrigin({ PUBLIC_ORIGIN: bad, VERCEL_PROJECT_PRODUCTION_URL: 'app.vercel.app' }), 'https://app.vercel.app', bad);
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 5);
  assert.match(errors[0], /origin\.invalid/);
  assert.equal(parseOrigin('https://x.test/path?q=1'), 'https://x.test');
});

const launched = config({
  manifest: { ...manifest, indexable: ['spurs'] },
  passwords: { master: 'master pw', sites: { spurs: 'spurs pw', northbridge: 'northbridge pw' } },
});

test('indexable sites are public and indexable; every other site stays gated and noindex', async () => {
  const robots = (decision: Decision) => decision.headers['X-Robots-Tag'];
  for (const path of ['/spurs', '/spurs/legends/sandro', '/spurs/site.css', '/spurs/sitemap.xml', '/spurs/llms.txt']) {
    const decision = await run(path, launched);
    assert.equal(status(decision), 200, path);
    assert.equal(robots(decision), undefined, `${path} has no noindex header`);
  }
  for (const path of [
    '/styles.css',
    '/fonts/outfit-latin.woff2',
    '/_next/image',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/peptalk/logo.png',
  ])
    assert.equal(status(await run(path, launched)), 200, `${path}: the launched site renders with it`);
  for (const path of ['/northbridge', '/northbridge/site.css', '/all', '/landing.css', '/terms'])
    assert.equal(status(await run(path, launched)), 401, `${path} stays behind the gate`);
  assert.equal(robots(await run('/northbridge', launched, { password: 'northbridge pw' })), 'noindex, nofollow');
  assert.equal(robots(await run('/nope', launched)), 'noindex, nofollow', 'the 404 rewrite is never indexable');
  assert.equal(robots(await run('/spurs/nope', launched)), 'noindex, nofollow');
  // Nothing indexable: shared assets need a password again, and everything is noindex.
  assert.equal(status(await run('/styles.css', gated)), 401);
  assert.equal(robots(await run('/spurs', config())), 'noindex, nofollow');
  const hub = config({ manifest: { ...manifest, hubIndexable: true }, passwords: gated.passwords });
  for (const path of ['/all', '/all/sitemap.xml', '/terms', '/privacy', '/landing.css'])
    assert.equal(status(await run(path, hub)), 200, path);
  assert.equal(status(await run('/spurs', hub)), 401);
  assert.equal(publicPath('/spurs-old', { ...manifest, indexable: ['spurs'] }), false, 'a slug prefix is not the site');
});

test('cache headers: immutable versioned assets, private when a password was needed, revalidated pages', async () => {
  const cache = async (path: string, cfg = config(), password?: string) => (await run(path, cfg, { password })).headers['Cache-Control'];
  assert.equal(await cache('/styles.css?v=abc'), 'public, max-age=31536000, immutable');
  assert.equal(await cache('/spurs/site.css?v=abc'), 'public, no-cache', 'generated from content, which revalidation can change');
  assert.equal(await cache('/landing.css?v=abc'), 'public, no-cache');
  assert.equal(await cache('/tracking.js?v=abc'), 'public, max-age=31536000, immutable', 'a static file, never revalidated');
  assert.equal(await cache('/styles.css'), 'public, no-cache', 'unversioned stylesheet URLs revalidate');
  assert.equal(await cache('/fonts/outfit-latin.woff2'), 'public, max-age=31536000, immutable');
  assert.equal(await cache('/spurs'), 'public, max-age=0, must-revalidate');
  assert.equal(await cache('/spurs', gated, 'master pw'), 'private, no-cache');
  assert.equal(await cache('/styles.css?v=1', gated, 'spurs pw'), 'private, max-age=31536000, immutable');
  assert.equal(await cache('/spurs', launched), 'public, max-age=0, must-revalidate', 'a launched site is public');
  assert.match((await cache('/og/spurs.jpg', gated)) ?? '', /^public, max-age=86400/);
  assert.equal(await cache('/robots.txt'), 'public, max-age=3600');
  assert.equal(cacheControl('/_next/image', '?url=x&w=640&q=75', false), null, 'the optimizer keeps its own header');
  assert.equal(await cache('/nope'), 'no-cache');
});

test('unknown page-shaped paths are rewritten to the server-rendered 404; files and known pages are not', async () => {
  const rewrite = async (path: string) => {
    const decision = await run(path);
    return decision.action === 'next' ? decision.rewrite : `respond ${decision.status}`;
  };
  for (const path of ['/nope', '/Spurs', '/spurs/stories', '/spurs/legends/nobody', '/spurs/legends/sandro/x', '/fonts/missing'])
    assert.equal(await rewrite(path), NOT_FOUND_REWRITE, path);
  for (const path of [
    '/spurs',
    '/spurs/',
    '/spurs/legends/sandro',
    '/terms',
    '/styles.css',
    '/spurs/site.css',
    '/robots.txt',
    '/og/x.jpg',
    '/health',
  ])
    assert.equal(await rewrite(path), undefined, path);
  assert.equal(await rewrite('/all'), '/', 'with a root site, /all is served from the landing route at /');
});

// ---- Per-site domains: host routing, the gate per host, POST to the enquiry endpoint, the tracking CSP ----

const domains = {
  spurs: { primary: 'spurslegends.com', aliases: ['www.spurslegends.com'], live: true },
  northbridge: { primary: 'northbridgelegends.example', aliases: [], live: false },
};
const routed = (overrides: Partial<ProxyConfig> = {}, manifestOverrides: Partial<ProxyConfig['manifest']> = {}) =>
  config({
    manifest: { ...manifest, domains, pages: [...manifest.pages, '/northbridge/legends'], ...manifestOverrides },
    ...overrides,
  });
const HUB_HOST = 'appearances.getapeptalk.com';
const at = (host: string, path: string, cfg = routed(), { method = 'GET', password }: { method?: string; password?: string } = {}) =>
  decide({ method, url: `https://${host}${path}`, host, authorization: password === undefined ? null : basic(password) }, cfg);
const outcome = (decision: Decision) =>
  decision.action === 'respond' ? `${decision.status} ${decision.headers.Location ?? ''}`.trim() : (decision.rewrite ?? 'next');

test('a site’s host serves that site at the root, rewritten to its domain mount; shared assets pass as they are', async () => {
  const cases: [string, string][] = [
    ['/', '/spurs--domain'],
    ['/legends', '/spurs--domain/legends'],
    ['/legends/sandro', '/spurs--domain/legends/sandro'],
    ['/legends/sandro/', '/spurs--domain/legends/sandro'],
    ['/site.css?v=abc', '/spurs--domain/site.css'],
    ['/robots.txt', '/spurs--domain/robots.txt'],
    ['/sitemap.xml', '/spurs--domain/sitemap.xml'],
    ['/llms.txt', '/spurs--domain/llms.txt'],
    ['/styles.css?v=1', 'next'],
    ['/_next/image?url=x', 'next'],
    ['/fonts/outfit-latin.woff2', 'next'],
    ['/peptalk/logo.png', 'next'],
    ['/og/spurs.jpg', 'next'],
    ['/og/spurs-legends.jpg', 'next'],
    ['/og/appearances.jpg', 'next'],
    ['/health', 'next'],
  ];
  for (const [path, expected] of cases) assert.equal(outcome(await at('spurslegends.com', path)), expected, path);
  assert.equal(outcome(await at('SpursLegends.COM:443', '/legends')), '/spurs--domain/legends', 'host case and port are ignored');
});

test('a partner domain never exposes /all, another site, the hub’s files or a mount', async () => {
  for (const path of [
    '/all',
    '/northbridge',
    '/northbridge/legends',
    '/spurs',
    '/spurs/legends',
    '/legends/nobody',
    '/spurs--domain',
    '/terms/x',
  ])
    assert.equal(outcome(await at('spurslegends.com', path)), NOT_FOUND_REWRITE, path);
  // Files that aren't the site's own are looked up inside its mount, where they don't exist (404).
  for (const path of ['/og/northbridge.jpg', '/og/northbridge-legends.jpg', '/landing.css'])
    assert.ok(outcome(await at('spurslegends.com', path)).startsWith('/spurs--domain/'), path);
});

test('aliases answer 301 to the primary, keeping path and query', async () => {
  assert.equal(outcome(await at('www.spurslegends.com', '/legends?role=squad')), '301 https://spurslegends.com/legends?role=squad');
  assert.equal(outcome(await at('www.spurslegends.com', '/')), '301 https://spurslegends.com/');
});

test('the hub host: a live site’s folder 301s to its domain; sites not live and /all stay; mounts 404', async () => {
  assert.equal(outcome(await at(HUB_HOST, '/spurs/legends?role=player')), '301 https://spurslegends.com/legends?role=player');
  assert.equal(outcome(await at(HUB_HOST, '/spurs')), '301 https://spurslegends.com/');
  assert.equal(outcome(await at(HUB_HOST, '/spurs/site.css?v=1')), '301 https://spurslegends.com/site.css?v=1');
  assert.equal(outcome(await at(HUB_HOST, '/')), '302 https://spurslegends.com/', 'the root site is live');
  assert.equal(outcome(await at(HUB_HOST, '/rovers/legends')), '301 /eastvale/legends');
  assert.equal(outcome(await at(HUB_HOST, '/northbridge/legends')), 'next', 'not live: the folder stays');
  assert.equal(outcome(await at(HUB_HOST, '/all')), '/', 'the landing page, served from its route at /');
  for (const path of ['/spurs--domain', '/spurs--domain/legends', '/northbridge--domain/site.css', '/spurs--domain/robots.txt'])
    assert.equal(outcome(await at(HUB_HOST, path)), NOT_FOUND_REWRITE, path);
  const renamed = routed({}, { redirects: { lilywhites: 'spurs' } });
  assert.equal(outcome(await at(HUB_HOST, '/lilywhites/legends', renamed)), '301 https://spurslegends.com/legends', 'one hop');
});

test('unknown hosts (Vercel preview and deployment URLs, localhost) behave as the hub, without moving live sites', async () => {
  for (const host of ['peptalk-appearances-abc123.vercel.app', 'localhost', '127.0.0.1']) {
    assert.equal(outcome(await at(host, '/spurs/legends')), 'next', host);
    assert.equal(outcome(await at(host, '/')), '302 /spurs', host);
    assert.equal(outcome(await at(host, '/spurs--domain/legends')), NOT_FOUND_REWRITE, host);
  }
  const hubFromEnv = routed({}, { hubHost: 'hub.example' });
  assert.equal(outcome(await at('hub.example', '/spurs')), 'next', 'only the configured hub host moves folders');
  assert.equal(outcome(await at('hub.example', '/spurs', hubFromEnv)), '301 https://spurslegends.com/');
});

test('the gate per host: the master or that site’s password opens its domain; no other password does', async () => {
  const cfg = routed({ passwords: gated.passwords });
  const cases: [string, string, string | undefined, number][] = [
    ['spurslegends.com', '/legends', undefined, 401],
    ['spurslegends.com', '/legends', 'wrong', 401],
    ['spurslegends.com', '/legends', 'spurs pw', 200],
    ['spurslegends.com', '/legends', 'master pw', 200],
    ['spurslegends.com', '/legends', 'northbridge pw', 401],
    ['spurslegends.com', '/styles.css', 'northbridge pw', 401],
    ['spurslegends.com', '/site.css', 'spurs pw', 200],
    ['spurslegends.com', '/og/spurs.jpg', undefined, 200],
    ['northbridgelegends.example', '/', 'spurs pw', 401],
    ['northbridgelegends.example', '/', 'northbridge pw', 200],
    // The alias redirect leaks nothing, so it comes before the gate.
    ['www.spurslegends.com', '/legends', undefined, 301],
  ];
  for (const [host, path, password, expected] of cases)
    assert.equal(status(await at(host, path, cfg, { password })), expected, `${host}${path} with ${password}`);
  const cache = (await at('spurslegends.com', '/legends', cfg, { password: 'spurs pw' })).headers['Cache-Control'];
  assert.equal(cache, 'private, no-cache', 'a gated domain page is never cached publicly');
});

test('indexing per host: only a launched site on its live domain is indexable; launched sites are public there', async () => {
  const cfg = routed({ passwords: gated.passwords }, { indexable: ['spurs', 'northbridge'] });
  const live = await at('spurslegends.com', '/legends', cfg);
  assert.equal(status(live), 200, 'public');
  assert.equal(live.headers['X-Robots-Tag'], undefined);
  assert.equal(live.headers['Cache-Control'], 'public, max-age=0, must-revalidate');
  const notLive = await at('northbridgelegends.example', '/legends', cfg);
  assert.equal(status(notLive), 200);
  assert.equal(notLive.headers['X-Robots-Tag'], 'noindex, nofollow', 'before go-live the hub folder is canonical');
  assert.equal((await at('spurslegends.com', '/nope', cfg)).headers['X-Robots-Tag'], 'noindex, nofollow');
});

test('POST only to the enquiry endpoint; the proxy names the domain’s site and strips any client-sent value', async () => {
  assert.equal(status(await run('/spurs/check-availability', config(), { method: 'POST' })), 405);
  const get = await run('/api/enquiry');
  assert.equal(status(get), 405);
  assert.equal(get.action === 'respond' && get.headers.Allow, 'POST');
  const hub = await run('/api/enquiry', config(), { method: 'POST' });
  assert.deepEqual(hub.action === 'next' && hub.requestHeaders, { 'x-appearances-site': '' });
  const domain = await at('spurslegends.com', '/api/enquiry', routed(), { method: 'POST' });
  assert.deepEqual(domain.action === 'next' && domain.requestHeaders, { 'x-appearances-site': 'spurs' });
  assert.equal(domain.action === 'next' && domain.rewrite, undefined, 'never rewritten into the mount');
  // Gated: any valid password reaches the endpoint on the hub (it checks the form's site itself); a domain's own gate.
  assert.equal(status(await run('/api/enquiry', gated, { method: 'POST' })), 401);
  assert.equal(status(await run('/api/enquiry', gated, { method: 'POST', password: 'northbridge pw' })), 200);
  const cfg = routed({ passwords: gated.passwords });
  assert.equal(status(await at('spurslegends.com', '/api/enquiry', cfg, { method: 'POST', password: 'northbridge pw' })), 401);
  assert.equal(status(await run('/api/enquiry', launched, { method: 'POST' })), 200, 'public once a site is launched');
});

test('both POST routes on every host: the webhook outside any gate, the enquiry endpoint behind its host’s gate', async () => {
  const cfg = routed({ passwords: gated.passwords });
  // The revalidation webhook: same decision on the hub, a preview URL, a site's domain and an alias (no 301, which would
  // turn the POST into a GET), with no password; never rewritten into a domain mount, never cached.
  for (const host of [HUB_HOST, 'appearances-git-x.vercel.app', 'spurslegends.com', 'www.spurslegends.com', 'northbridgelegends.example']) {
    const decision = await at(host, '/api/revalidate', cfg, { method: 'POST' });
    assert.equal(outcome(decision), 'next', host);
    assert.equal(decision.headers['Cache-Control'], 'no-store', host);
    assert.equal(decision.action === 'next' && decision.requestHeaders, undefined, `${host}: no site header for the webhook`);
    assert.equal(status(await at(host, '/api/revalidate', cfg)), 405, `${host}: GET`);
  }
  // The enquiry endpoint keeps the platform's rules next to it: the domain's own gate, the hub's master or any site gate.
  assert.equal(status(await at('spurslegends.com', '/api/enquiry', cfg, { method: 'POST' })), 401);
  const spurs = await at('spurslegends.com', '/api/enquiry', cfg, { method: 'POST', password: 'spurs pw' });
  assert.deepEqual(spurs.action === 'next' && spurs.requestHeaders, { 'x-appearances-site': 'spurs' });
  assert.equal(status(await at(HUB_HOST, '/api/enquiry', cfg, { method: 'POST' })), 401);
  assert.equal(status(await at(HUB_HOST, '/api/enquiry', cfg, { method: 'POST', password: 'northbridge pw' })), 200);
  assert.equal(status(await at('www.spurslegends.com', '/api/enquiry', cfg, { method: 'POST' })), 301, 'an alias still redirects');
  for (const path of ['/api/enquiry', '/api/revalidate'])
    assert.equal(status(await at('spurslegends.com', path, cfg, { method: 'PUT' })), 405, `${path}: POST only`);
});

test('tracking widens the CSP only for a site with tags, on its folder and its domain', async () => {
  const cfg = routed({}, { tracking: ['spurs'] });
  const spursCsp = (await at('localhost', '/spurs/legends', cfg)).headers['Content-Security-Policy'];
  assert.match(spursCsp, /googletagmanager/);
  assert.match(spursCsp, /trusted-types default$/);
  assert.match((await at('spurslegends.com', '/legends', cfg)).headers['Content-Security-Policy'], /googletagmanager/);
  const northbridgeCsp = (await at(HUB_HOST, '/northbridge/legends', cfg)).headers['Content-Security-Policy'];
  assert.doesNotMatch(northbridgeCsp, /googletagmanager/);
  assert.match(northbridgeCsp, /trusted-types 'none'$/);
  assert.doesNotMatch((await at(HUB_HOST, '/all', cfg)).headers['Content-Security-Policy'], /googletagmanager/);
});

test('the tracking loader is a shared, versioned asset: on the hub, on a site’s domain, cached for a year', async () => {
  assert.equal(outcome(await at('spurslegends.com', '/tracking.js?v=1')), 'next');
  assert.equal(status(await run('/tracking.js', gated, { password: 'northbridge pw' })), 200);
  assert.equal((await run('/tracking.js?v=1')).headers['Cache-Control'], 'public, max-age=31536000, immutable');
});

// ---- The component gallery (lib/gallery.ts): master password only, never public, never on a partner domain ----

test('the component gallery: master password only, rewritten to its internal route, private and noindex', async () => {
  const cfg = routed(
    { passwords: gated.passwords },
    { pages: [...manifest.pages, '/_gallery', '/_gallery/spurs', '/_gallery/northbridge'], indexable: ['spurs'] },
  );
  const via = (path: string, password?: string) => at('localhost', path, cfg, { password });
  for (const path of ['/_gallery', '/_gallery/spurs']) {
    assert.equal(status(await via(path)), 401, `${path}: no password`);
    assert.equal(status(await via(path, 'spurs pw')), 401, `${path}: a site password never opens it`);
    assert.equal(status(await via(path, 'wrong')), 401, path);
    const open = await via(path, 'master pw');
    assert.equal(outcome(open), `/gallery--internal${path.slice('/_gallery'.length)}`, path);
    assert.equal(open.headers['X-Robots-Tag'], 'noindex, nofollow', `${path}: never indexed, even for a launched site`);
    assert.equal(open.headers['Cache-Control'], 'private, no-cache', path);
  }
  assert.equal(outcome(await via('/_gallery/spurs/', 'master pw')), '/gallery--internal/spurs', 'trailing slash');
  assert.equal(outcome(await via('/_gallery/nope', 'master pw')), NOT_FOUND_REWRITE, 'unknown or unpublished site');
  assert.equal(
    outcome(await via('/gallery--internal/spurs', 'master pw')),
    NOT_FOUND_REWRITE,
    'the internal route is never served directly',
  );
  assert.equal(status(await via('/gallery--internal/spurs', 'spurs pw')), 401);
  // A site's own domain never shows the gallery, whoever asks.
  for (const path of ['/_gallery', '/_gallery/spurs', '/gallery--internal/spurs'])
    assert.equal(outcome(await at('spurslegends.com', path, cfg, { password: 'master pw' })), NOT_FOUND_REWRITE, path);
  // Local development without passwords: open (noindex all the same).
  const local = await at('localhost', '/_gallery/spurs', routed({}, { pages: [...manifest.pages, '/_gallery/spurs'] }));
  assert.equal(outcome(local), '/gallery--internal/spurs');
  assert.equal(local.headers['X-Robots-Tag'], 'noindex, nofollow');
});

test('the component gallery is a 404 in production without a master password (PREVIEW_PUBLIC=true never publishes it)', async () => {
  const cfg = config({ production: true, previewPublic: true, manifest: { ...manifest, pages: [...manifest.pages, '/_gallery'] } });
  assert.equal(outcome(await run('/_gallery', cfg)), NOT_FOUND_REWRITE);
  assert.equal((await run('/_gallery', cfg)).headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(status(await run('/spurs', cfg)), 200, 'the sites themselves are public with PREVIEW_PUBLIC');
});

// ---- The landing page as the hub's home (registry.json without rootSite) ----

const home = (overrides: Partial<ProxyConfig> = {}, manifestOverrides: Partial<ProxyConfig['manifest']> = {}) =>
  config({
    manifest: { ...manifest, rootSite: null, pages: ['/', ...manifest.pages.filter(page => page !== '/all')], ...manifestOverrides },
    ...overrides,
  });
const homeGated = home({ passwords: gated.passwords });

test('no root site: / is the landing page (no rewrite, a page’s headers); /all answers 301 to /, query kept, before the gate', async () => {
  const page = await run('/', home());
  assert.equal(outcome(page), 'next');
  assert.equal(page.headers['Cache-Control'], 'public, max-age=0, must-revalidate');
  assert.equal(page.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.match(page.headers['Content-Security-Policy'], /script-src 'self' 'unsafe-inline'; style-src 'self';/);
  assert.doesNotMatch(page.headers['Content-Security-Policy'], /googletagmanager/);
  for (const cfg of [home(), homeGated]) {
    assert.equal(outcome(await run('/all', cfg)), '301 /');
    assert.equal(outcome(await run('/all/', cfg)), '301 /');
    assert.equal(outcome(await run('/all?utm_source=partner', cfg)), '301 /?utm_source=partner');
  }
  const moved = await run('/all', homeGated);
  assert.equal(moved.headers['Cache-Control'], 'public, max-age=3600');
  assert.equal(outcome(await run('/all/sitemap.xml', home())), 'next', 'the hub sitemap keeps its path');
  assert.equal(outcome(await run('/all/nope', home())), NOT_FOUND_REWRITE);
  assert.equal(outcome(await run('/spurs', home())), 'next', 'sites are unaffected');
});

test('no root site: the landing page opens with the master password only; a site password goes to its own site', async () => {
  const cases: [string, string | undefined, string][] = [
    ['/', undefined, '401'],
    ['/', 'wrong', '401'],
    ['/', 'master pw', 'next'],
    ['/', 'spurs pw', '302 /spurs'],
    ['/', 'northbridge pw', '302 /northbridge'],
    ['/?utm_source=partner', 'northbridge pw', '302 /northbridge?utm_source=partner'],
    ['/landing.css', 'spurs pw', '401'],
    ['/landing.css', 'master pw', 'next'],
    ['/terms', 'spurs pw', 'next'],
  ];
  for (const [path, password, expected] of cases)
    assert.equal(outcome(await run(path, homeGated, { password })), expected, `${path} with ${password}`);
  const denied = await run('/', homeGated, { password: 'wrong' });
  assert.equal(denied.action === 'respond' && denied.headers['WWW-Authenticate']?.startsWith('Basic '), true);
  const sent = await run('/', homeGated, { password: 'spurs pw' });
  assert.equal(sent.headers['Cache-Control'], 'no-store', 'the redirect depends on the password: never cached');
  assert.equal((await run('/', homeGated, { password: 'master pw' })).headers['Cache-Control'], 'private, no-cache');
  // Two sites sharing a password: the first in registry order.
  const shared = home({ passwords: { master: 'master pw', sites: { northbridge: 'same', spurs: 'same' } } });
  assert.equal(outcome(await run('/', shared, { password: 'same' })), '302 /spurs');
  // A password for a site that isn't published is never configured (passwordsFromEnv reads published slugs only).
  assert.equal(outcome(await run('/', home({ passwords: { master: 'm', sites: {} } }), { password: 'spurs pw' })), '401');
  // With a root site, the landing page at /all behaves the same way.
  assert.equal(outcome(await run('/all', gated, { password: 'northbridge pw' })), '302 /northbridge');
  assert.equal(outcome(await run('/all', gated, { password: 'master pw' })), '/');
});

test('no root site: on the hub host a site password goes to the site’s live domain; partner domains keep / as the site home', async () => {
  const cfg = home(
    { passwords: gated.passwords },
    { domains, pages: ['/', ...manifest.pages.filter(page => page !== '/all'), '/northbridge/legends'] },
  );
  assert.equal(outcome(await at(HUB_HOST, '/', cfg, { password: 'spurs pw' })), '302 https://spurslegends.com/');
  assert.equal(outcome(await at(HUB_HOST, '/', cfg, { password: 'northbridge pw' })), '302 /northbridge', 'not live: the folder');
  assert.equal(outcome(await at('preview-abc.vercel.app', '/', cfg, { password: 'spurs pw' })), '302 /spurs', 'previews keep folders');
  assert.equal(outcome(await at(HUB_HOST, '/', cfg, { password: 'master pw' })), 'next');
  // A partner's own domain: `/` is that site's home, and the landing page is never served there.
  assert.equal(outcome(await at('spurslegends.com', '/', cfg, { password: 'spurs pw' })), '/spurs--domain');
  assert.equal(outcome(await at('spurslegends.com', '/', cfg, { password: 'master pw' })), '/spurs--domain');
  assert.equal(outcome(await at('spurslegends.com', '/', cfg, { password: 'northbridge pw' })), '401');
  for (const path of ['/all', '/all/'])
    assert.equal(
      outcome(await at('spurslegends.com', path, cfg, { password: 'spurs pw' })),
      NOT_FOUND_REWRITE,
      `${path}: no 301, no landing`,
    );
  assert.equal(outcome(await at('spurslegends.com', '/landing.css', cfg, { password: 'spurs pw' })), '/spurs--domain/landing.css');
  assert.equal(outcome(await at('www.spurslegends.com', '/')), '301 https://spurslegends.com/');
});

test('no root site: an indexable hub makes / public and indexable; nothing else changes', async () => {
  const cfg = home({ passwords: gated.passwords }, { hubIndexable: true });
  const page = await run('/', cfg);
  assert.equal(outcome(page), 'next');
  assert.equal(page.headers['X-Robots-Tag'], undefined);
  assert.equal(page.headers['Cache-Control'], 'public, max-age=0, must-revalidate');
  assert.equal(outcome(await run('/', cfg, { password: 'spurs pw' })), 'next', 'public: no redirect for anyone');
  assert.equal(outcome(await run('/all', cfg)), '301 /');
  assert.equal(outcome(await run('/spurs', cfg)), '401');
  assert.equal(publicPath('/', { ...manifest, hubIndexable: true }), true);
  assert.equal(publicPath('/', manifest), false);
});
