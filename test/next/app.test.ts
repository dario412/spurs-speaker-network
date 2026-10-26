// Integration: builds the Next.js app into .next-test, starts it three ways (open, gated, misconfigured production)
// and checks every page of every site: status, prerendering, security headers and CSP, branding, links, legal pages,
// demo pages, review notes, the landing page, the gate matrix, redirects and fail-closed production; and the SEO surface: one h1 and a clean heading
// outline, alt text, structured data, unique titles and descriptions, canonical, robots, lang, sitemaps and llms.txt.
// The main build runs on the real sites (src/sites) plus the fictional partner sites (test/fixtures/sites.mjs:
// northbridge, eastvale), with no root site and an old slug that redirects, so the partner-privacy checks always
// have another site to keep out.
// A second build (.next-test-fixture) runs on fixture content: an indexable site (eastvale), a shell site with one
// person, an indexable hub, and per-site domains (northbridge launched on a live domain with tags behind consent,
// spurs on a domain that isn't live yet), requested with real Host headers. Set NEXT_TEST_SKIP_BUILD=1 to reuse
// existing builds.
import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import type { Site } from '../../lib/content/types.ts';
import { allPaths, landingPath } from '../../lib/render/routes.ts';
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from '../../lib/seo/copy.ts';
import { validateSite } from '../../scripts/validate-content.mjs';
import { shellSite } from '../../src/sites/scaffold.mjs';
import { eastvale, northbridge, writeSitesDir } from '../fixtures/sites.mjs';
import { checkStructuredData, nodes } from './schema.ts';

const DIST = '.next-test';
/** The fixture's look-only demo profile (spurs). */
const DEMO_PROFILE = 'sandro';
const FIXTURE_DIST = '.next-test-fixture';
const ORIGIN = 'https://appearances.example';
const NEXT = 'node_modules/next/dist/bin/next';
/** The main build's content: the real sites plus the fictional ones, no root site (the landing page at /). */
const hubDir = writeSitesDir();
const hubEnv = { APPEARANCES_SITES_DIR: hubDir };
const hub = createJsonProvider({ sitesDir: hubDir, cache: false });
const sites: Site[] = await hub.listSites();
const servers: ChildProcess[] = [];
const base = { open: '', gated: '', broken: '', fixture: '', fixtureGated: '' };
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith('PREVIEW_') && !['PUBLIC_ORIGIN', 'NODE_ENV', 'VERCEL_ENV', 'SEARCH_INDEXING', 'APPEARANCES_SITES_DIR'].includes(key),
  ),
);

// next build/start set NODE_ENV themselves; the cast only satisfies Next's ProcessEnv typing.
const envFor = (extra: Record<string, string>, dist = DIST) =>
  ({ ...cleanEnv, NEXT_DIST_DIR: dist, PUBLIC_ORIGIN: ORIGIN, ...extra }) as unknown as NodeJS.ProcessEnv;

/** The fixture's domains: northbridge launched on a live domain (plus a www alias), spurs on a domain that isn't live yet. */
const DOMAINS = {
  northbridge: { primary: 'northbridgelegends.example', aliases: ['www.northbridgelegends.example'], live: true },
  spurs: { primary: 'spurslegends.example', aliases: [], live: false },
};
/** The fixture's hub host: PUBLIC_ORIGIN's host (lib/domains.ts → hubHost). */
const HUB_HOST = new URL(ORIGIN).hostname;
const GTM = 'GTM-TEST123';

/**
 * Fixture content: eastvale launched (indexable), spurs as it is (gated, demo home) on a domain that isn't live,
 * northbridge launched on a live domain with Tag Manager behind the consent banner, a one-person shell site, an
 * indexable hub with spurs as the root site.
 */
function writeFixture(): string {
  const shell = shellSite({
    slug: 'shellco',
    name: 'Shell County FC',
    short: 'Shell County',
    brand: '#123456',
    ink: '#111111',
    dark: '#222222',
    bar: '#333333',
  });
  // One person who offers no hospitality: no "more people" section on the profile, no hosts on the hospitality page.
  const [person] = shell.people;
  const shellco = { ...shell, featured: [person.slug], people: [{ ...person, formats: ['keynote', 'virtual'] }] };
  const dir = writeSitesDir({
    sites: [
      { ...eastvale(), indexable: true },
      { ...northbridge(), indexable: true, tracking: { gtmId: GTM }, consent: { required: true } },
      shellco,
    ],
    registry: { rootSite: 'spurs', redirects: {}, indexable: true, domains: DOMAINS },
  });
  // Live content has no demo pages any more; the fixture keeps the look-only demo mode covered on spurs.
  const spurs = JSON.parse(readFileSync(join(dir, 'spurs', 'site.json'), 'utf8'));
  writeFileSync(join(dir, 'spurs', 'site.json'), JSON.stringify({ ...spurs, demoHome: true, demoProfiles: [DEMO_PROFILE] }, null, 2));
  return dir;
}
const fixtureDir = writeFixture();

async function start(port: number, env: Record<string, string>, dist = DIST): Promise<string> {
  const child = spawn(process.execPath, [NEXT, 'start', '-p', String(port)], {
    env: envFor(env, dist),
    stdio: 'ignore',
  });
  servers.push(child);
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i += 1) {
    try {
      await fetch(`${origin}/health`);
      return origin;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`next start on ${port} did not come up`);
}

function build(dist: string, extra: Record<string, string> = {}) {
  if (process.env.NEXT_TEST_SKIP_BUILD && existsSync(`${dist}/BUILD_ID`)) return;
  const built = spawnSync(process.execPath, [NEXT, 'build'], { env: envFor(extra, dist), encoding: 'utf8' });
  assert.equal(built.status, 0, `next build (${dist}) failed:\n${built.stdout}\n${built.stderr}`);
}

before(async () => {
  build(DIST, hubEnv);
  build(FIXTURE_DIST, { APPEARANCES_SITES_DIR: fixtureDir });
  const port = 4100 + Math.floor(Math.random() * 1000);
  const fixtureEnv = { APPEARANCES_SITES_DIR: fixtureDir };
  [base.open, base.gated, base.broken, base.fixture, base.fixtureGated] = await Promise.all([
    start(port, { ...hubEnv, PREVIEW_PUBLIC: 'true' }),
    start(port + 1, {
      ...hubEnv,
      PREVIEW_PASSWORD: 'master pw',
      PREVIEW_PASSWORD_SPURS: 'spurs pw',
      PREVIEW_PASSWORD_NORTHBRIDGE: 'northbridge pw',
      REVALIDATE_SECRET: 'revalidate secret',
    }),
    start(port + 2, hubEnv),
    start(port + 3, { ...fixtureEnv, PREVIEW_PUBLIC: 'true', REVALIDATE_SECRET: 'revalidate secret' }, FIXTURE_DIST),
    start(
      port + 4,
      { ...fixtureEnv, PREVIEW_PASSWORD: 'master pw', PREVIEW_PASSWORD_SPURS: 'spurs pw', PREVIEW_PASSWORD_SHELLCO: 'shell pw' },
      FIXTURE_DIST,
    ),
  ]);
});
after(() => {
  for (const child of servers) child.kill('SIGTERM');
});

/** The main build's registry has no root site, so the landing page is the hub's home at `/` (the fixture keeps one: /all). */
const hubRegistry = await hub.getRegistry();
const pages = allPaths(sites, landingPath(hubRegistry.rootSite));
/** A path's absolute URL as Next.js writes it in canonical and og:url: the root URL without its trailing slash. */
const pageUrl = (path: string) => (path === '/' ? ORIGIN : `${ORIGIN}${path}`);
const cache = new Map<string, Promise<{ status: number; headers: Headers; html: string }>>();
const get = (path: string) => {
  if (!cache.has(path))
    cache.set(
      path,
      fetch(base.open + path).then(async res => ({ status: res.status, headers: res.headers, html: await res.text() })),
    );
  return cache.get(path) as Promise<{ status: number; headers: Headers; html: string }>;
};
const body = (html: string) => html.slice(html.indexOf('<body'));
const isDemo = (path: string) =>
  sites.some(
    site => (site.demoHome && path === `/${site.slug}`) || site.demoProfiles?.some(slug => path === `/${site.slug}/legends/${slug}`),
  );

test('every page is prerendered at build time (static), not rendered per request', () => {
  const manifest = JSON.parse(readFileSync(`${DIST}/prerender-manifest.json`, 'utf8')) as { routes: Record<string, unknown> };
  for (const path of pages) assert.ok(Object.hasOwn(manifest.routes, path), `${path} is not prerendered`);
});

test('every page answers 200 with security headers, the static CSP, no inline styles and noindex', async () => {
  for (const path of pages) {
    const { status, headers, html } = await get(path);
    assert.equal(status, 200, path);
    assert.equal(headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin"\/>/, path);
    assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow', path);
    assert.match(headers.get('strict-transport-security') ?? '', /max-age=/, path);
    assert.equal(headers.get('cache-control'), 'public, max-age=0, must-revalidate', path);
    const csp = headers.get('content-security-policy') ?? '';
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.match(csp, /script-src 'self' 'unsafe-inline'; style-src 'self';/, path);
    assert.match(csp, /require-trusted-types-for 'script'; trusted-types 'none'/, path);
    assert.match(csp, /img-src 'self' https:\/\/media\.gettyimages\.com/, path);
    assert.doesNotMatch(html, /\snonce="/, `${path}: static pages carry no nonce`);
    for (const [, src] of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g))
      assert.match(src, /^\/_next\/static\//, `${path}: script ${src}`);
    assert.doesNotMatch(html, /\sstyle="/, `${path} has an inline style`);
    assert.doesNotMatch(html, /<style[\s>]/, `${path} has an inline <style>`);
    assert.doesNotMatch(html, /googletagmanager|GTM-|tracking\.js/, `${path}: no tracking unless configured`);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/, path);
    assert.ok(html.includes(`<link rel="canonical" href="${pageUrl(path)}"/>`), `${path}: canonical`);
  }
});

test('each site carries only its own theme, branding and stylesheet', async () => {
  const label = (site: Site) => (site.vocab?.officialLabel ?? `Official ${site.orgName} platform`).replaceAll('&amp;', '&amp;');
  for (const site of sites) {
    const { html } = await get(`/${site.slug}`);
    assert.match(html, new RegExp(`<body class="site-${site.slug}" data-org-name="`), site.slug);
    assert.match(html, new RegExp(`href="/${site.slug}/site\\.css\\?v=[0-9a-f]{12}"`), site.slug);
    for (const other of sites.filter(candidate => candidate !== site)) {
      assert.ok(!html.includes(label(other)), `${site.slug} shows ${other.slug} branding`);
      assert.ok(!html.includes(`/${other.slug}/site.css`), `${site.slug} loads ${other.slug}'s stylesheet`);
    }
    const css = await (await fetch(`${base.open}/${site.slug}/site.css`)).text();
    assert.ok(css.startsWith(`.site-${site.slug}{--brand:${site.theme.brand}`), site.slug);
    for (const other of sites.filter(candidate => candidate !== site)) assert.ok(!css.includes(`site-${other.slug}`));
  }
});

test('internal links resolve, and site pages never link another site', async () => {
  const seen = new Set<string>();
  for (const path of pages) {
    const { html } = await get(path);
    assert.doesNotMatch(body(html), /href="[^"]*\/stories[/"#?]/, `${path} links a stories page (removed)`);
    for (const [, href] of body(html).matchAll(/href="(\/[^"#?]*)/g)) {
      seen.add(href);
      const own = path.split('/')[1];
      const target = href.split('/')[1];
      if (sites.some(site => site.slug === own) && sites.some(site => site.slug === target))
        assert.equal(target, own, `${path} links ${href}`);
    }
  }
  for (const href of seen) assert.equal((await fetch(base.open + href)).status, 200, `broken link ${href}`);
});

test('internal review notes and empty values never render', async () => {
  for (const path of pages)
    assert.doesNotMatch(
      withoutScripts((await get(path)).html),
      /\(verify|>null<|>undefined</i,
      `${path} leaks a review note or empty value`,
    );
});

test('profiles leave out the "beyond" panel; regular homepages link the wider PepTalk roster', async () => {
  for (const site of sites) {
    const person = site.people.find(candidate => !site.demoProfiles?.includes(candidate.slug));
    if (person) assert.doesNotMatch((await get(`/${site.slug}/legends/${person.slug}`)).html, /class="beyond"/, site.slug);
    if (!site.demoHome)
      assert.match((await get(`/${site.slug}`)).html, /<div class="beyond">[\s\S]*?href="https:\/\/getapeptalk\.com\//, site.slug);
  }
  assert.match((await get('/northbridge')).html, /<div class="beyond">[\s\S]*?href="https:\/\/getapeptalk\.com\/type\/football-speakers"/);
});

test('the PepTalk landing page links every platform, and its talent types link the rosters filtered by role', async () => {
  const html = (await get('/')).html;
  assert.match(html, /<body class="landing"/);
  assert.match(html, /\/peptalk\/logo\.png/);
  for (const site of sites) {
    assert.ok(html.includes(`href="/${site.slug}"`), `landing misses ${site.slug}`);
    if (site.people.some(person => person.role === 'squad'))
      assert.ok(html.includes(`href="/${site.slug}/legends?role=squad"`), `landing misses ${site.slug} current players`);
  }
});

test('legal pages exist for every site and the hub, and every footer links them', async () => {
  for (const site of sites) {
    for (const kind of ['terms', 'privacy']) {
      const { html } = await get(`/${site.slug}/${kind}`);
      assert.match(html, new RegExp(`<body class="site-${site.slug}"`));
      assert.match(html, /<span class="eyebrow">Legal<\/span>/);
    }
  }
  assert.match((await get('/spurs/privacy')).html, /<h1 class="disp">Privacy Policy<\/h1><p class="lead">Last updated: 03 June 2025<\/p>/);
  assert.match((await get('/spurs/terms')).html, /<h1 class="disp">Terms of Service<\/h1>/);
  assert.match((await get('/privacy')).html, /<table>[\s\S]*<br\/>/, 'table cells keep their line breaks');
  assert.doesNotMatch((await get('/privacy')).html, /&lt;br&gt;|status: placeholder/);
  for (const path of pages.filter(p => p.split('/').length >= 2 && sites.some(site => p.startsWith(`/${site.slug}`)) && !isDemo(p))) {
    const slug = path.split('/')[1];
    const { html } = await get(path);
    assert.ok(html.includes(`href="/${slug}/terms"`) && html.includes(`href="/${slug}/privacy"`), `${path} footer lacks legal links`);
  }
  const landing = (await get('/')).html;
  assert.ok(landing.includes('href="/terms"') && landing.includes('href="/privacy"'));
  for (const path of ['/terms', '/privacy']) assert.match((await get(path)).html, /<body class="landing"/);
});

test('the enquiry form shows the consent line with links to that site’s legal pages', async () => {
  for (const site of sites) {
    const { html } = await get(`/${site.slug}/check-availability`);
    const form = /<form class="enquiry"[^>]*>/.exec(html)?.[0] ?? '';
    assert.match(form, /action="\/api\/enquiry"/);
    assert.match(form, /method="post"/);
    assert.doesNotMatch(form, /novalidate|data-send/i, 'browser validation without JavaScript; nothing sent without a webhook');
    assert.ok(html.includes(`<input type="hidden" name="site" value="${site.slug}"/>`), `${site.slug}: site field`);
    assert.match(
      html,
      /<div class="hp" aria-hidden="true"><label for="f-website">[^<]+<\/label><input id="f-website" type="text" tabindex="-1"[^>]*name="website"/,
    );
    assert.match(html, /id="enquiry-sent"[\s\S]*This concept preview does not send or store your details\./);
    assert.match(
      html,
      new RegExp(
        `<p class="note consent">By sending this enquiry you agree to our <a href="/${site.slug}/terms">Terms</a> and <a href="/${site.slug}/privacy">Privacy Policy</a>\\.</p>`,
      ),
    );
  }
});

test('demo pages have no working links, forms, toggles or controls; inner pages keep theirs', async () => {
  assert.deepEqual(pages.filter(isDemo), [], 'live content has no demo pages');
  for (const path of ['/spurs', `/spurs/legends/${DEMO_PROFILE}`]) {
    const res = await fetch(base.fixture + path);
    assert.equal(res.status, 200, path);
    const main = body(await res.text());
    // Next.js may put an empty hidden <div> first; the page content is wrapped in div.demo.
    assert.match(main, /^<body class="site-[a-z0-9-]+"[^>]*>(?:<div hidden="">[\s\S]*?<\/div>)?<div class="demo">/, path);
    assert.doesNotMatch(main, /<a\b[^>]*\shref=/, `${path} still has a link`);
    assert.doesNotMatch(main, /<form[^>]*\s(action|method)=/, path);
    assert.doesNotMatch(main, /<(details|summary)\b/, `${path} has a toggle`);
    assert.doesNotMatch(main, /<(button|input|select|textarea)\b(?![^>]*\bdisabled\b)/, `${path} has an enabled control`);
  }
  assert.match(await (await fetch(`${base.fixture}/spurs/legends`)).text(), /<a[^>]*href="\/spurs\/legends\//);
});

test('unknown paths, switched-off pages and mutations fail closed', async () => {
  for (const path of [
    '/nope',
    '/spurs/legends/unknown-person',
    '/legends',
    '/Spurs',
    '/spurs/stories',
    '/spurs/legends/x/y',
    '/404',
    '/constructor',
    '/src/sites/registry.json',
    '/src/sites/index.mjs',
    '/package.json',
    '/..%2fpackage.json',
    '/.env',
  ])
    assert.equal((await fetch(base.open + path)).status, 404, path);
  for (const path of ['/nope', '/spurs/legends/unknown-person', '/spurs/stories'])
    assert.match(
      await (await fetch(base.open + path)).text(),
      /<body class="landing">[\s\S]*<h1 class="disp">Page not found<\/h1>/,
      `${path}: the 404 page is server-rendered`,
    );
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal((await fetch(`${base.open}/spurs/check-availability`, { method })).status, 405, method);
});

test('redirects keep the query string; old slugs 301 for pages and cards', async () => {
  const location = async (path: string) => {
    const res = await fetch(base.open + path, { redirect: 'manual' });
    return [
      res.status,
      new URL(res.headers.get('location') ?? '', base.open).pathname + new URL(res.headers.get('location') ?? '', base.open).search,
    ];
  };
  const registry = hubRegistry;
  assert.equal(registry.rootSite, undefined, 'no root site: / is the landing page');
  assert.ok(Object.keys(registry.redirects).length > 0, 'an old slug to follow');
  assert.deepEqual(await location('/all?utm_source=partner'), [301, '/?utm_source=partner']);
  assert.equal((await fetch(`${base.open}/all/`)).url, `${base.open}/`, 'Next.js trims the slash (308), then /all moves to /');
  for (const [from, to] of Object.entries(registry.redirects)) {
    assert.deepEqual(await location(`/${from}/legends?role=squad`), [301, `/${to}/legends?role=squad`]);
    assert.deepEqual(await location(`/og/${from}-legends.jpg`), [301, `/og/${to}-legends.jpg`]);
  }
});

test('gate: master opens everything, a site password only its site and shared assets', async () => {
  const status = async (path: string, password?: string) =>
    (
      await fetch(base.gated + path, {
        redirect: 'manual',
        headers: password ? { authorization: `Basic ${Buffer.from(`anyone:${password}`).toString('base64')}` } : {},
      })
    ).status;
  assert.equal(await status('/spurs'), 401);
  assert.match((await fetch(`${base.gated}/spurs`)).headers.get('www-authenticate') ?? '', /^Basic /);
  assert.equal(await status('/spurs', 'wrong'), 401);
  assert.equal(await status('/spurs', 'master pw'), 200);
  assert.equal(await status('/', 'master pw'), 200);
  assert.equal(await status('/spurs', 'spurs pw'), 200);
  assert.equal(await status('/spurs/site.css', 'spurs pw'), 200);
  assert.equal(await status('/spurs/terms', 'spurs pw'), 200);
  assert.equal(await status('/northbridge', 'spurs pw'), 401);
  assert.equal(await status('/northbridge/site.css', 'spurs pw'), 401);
  assert.equal(await status('/spurs', 'northbridge pw'), 401);
  assert.equal(await status('/northbridge', 'northbridge pw'), 200);
  assert.equal(await status('/'), 401);
  assert.equal(await status('/', 'wrong'), 401);
  assert.equal(await status('/landing.css', 'spurs pw'), 401);
  assert.equal(await status('/styles.css', 'spurs pw'), 200);
  assert.equal(await status('/terms', 'northbridge pw'), 200);
  assert.equal(await status('/og/spurs.jpg'), 200);
  assert.equal(await status('/health'), 200);
  // A site-password holder's 404 page loads only shared CSS: nothing that names or styles another partner.
  assert.equal(await status('/spurs/nope', 'spurs pw'), 404);
  const notFound = await (
    await fetch(`${base.gated}/spurs/nope`, { headers: { authorization: `Basic ${Buffer.from('x:spurs pw').toString('base64')}` } })
  ).text();
  assert.doesNotMatch(notFound, /site\.css|landing\.css/);
  const html = await (
    await fetch(`${base.gated}/spurs`, { headers: { authorization: `Basic ${Buffer.from('x:spurs pw').toString('base64')}` } })
  ).text();
  for (const chunk of [...html.matchAll(/src="(\/_next\/static\/[^"]+)"/g)].map(match => match[1]))
    assert.equal(await status(chunk), 200, `framework asset ${chunk} must load for site-password holders`);
});

test('production without a master password answers 503 instead of serving', async () => {
  assert.equal((await fetch(`${base.broken}/spurs`)).status, 503);
  assert.match(await (await fetch(`${base.broken}/spurs`)).text(), /PREVIEW_PASSWORD/);
  const health = await fetch(`${base.broken}/health`);
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: 'misconfigured' });
});

test('health, robots, HEAD and forwarded hosts', async () => {
  const health = await fetch(`${base.open}/health`);
  assert.deepEqual(Object.keys(await health.json()).sort(), ['revision', 'status']);
  assert.equal((await (await fetch(`${base.open}/robots.txt`)).text()).trim(), 'User-Agent: *\nDisallow: /');
  const head = await fetch(`${base.open}/spurs`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 1000, 'HEAD reports the page length');
  assert.equal(await head.text(), '');
  const forwarded = await (await fetch(`${base.open}/spurs`, { headers: { 'x-forwarded-host': 'evil.example' } })).text();
  assert.doesNotMatch(forwarded, /evil\.example/);
});

// ---- SEO and AEO: outline, images, structured data, metadata, discovery files ----

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const withoutScripts = (html: string) => body(html).replace(/<script\b[\s\S]*?<\/script>/g, '');
const headings = (html: string) =>
  [...withoutScripts(html).matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(([, level, inner]) => ({
    level: Number(level),
    text: text(inner),
  }));
const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json));
const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:name|property)="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html)?.[1];
/** Headings that say nothing on their own (WCAG 2.4.6: headings describe topic or purpose). */
const GENERIC = /^(overview|faqs?|gallery|details|more|book|platform|info|click here|read more|home)$/i;

/** One h1, no skipped levels, every heading non-empty and descriptive. Returns the problems. */
function outlineProblems(html: string, path: string): string[] {
  const list = headings(html);
  const problems: string[] = [];
  if (list.filter(h => h.level === 1).length !== 1) problems.push(`${path}: ${list.filter(h => h.level === 1).length} h1 elements`);
  if (list[0]?.level !== 1) problems.push(`${path}: the first heading is h${list[0]?.level}, not the h1`);
  let previous = 0;
  for (const heading of list) {
    if (heading.level > previous + 1) problems.push(`${path}: h${previous} -> h${heading.level} ("${heading.text}") skips a level`);
    if (!heading.text) problems.push(`${path}: empty h${heading.level}`);
    if (GENERIC.test(heading.text)) problems.push(`${path}: h${heading.level} "${heading.text}" doesn't describe its section`);
    previous = heading.level;
  }
  return problems;
}

const hubPages = ['/', '/terms', '/privacy'];

test('heading outline: exactly one h1, no skipped levels, descriptive headings, on every page of every site', async () => {
  const problems: string[] = [];
  for (const path of [...pages, '/no-such-page']) problems.push(...outlineProblems((await get(path)).html, path));
  for (const path of [
    '/shellco',
    '/shellco/legends',
    '/shellco/legends/placeholder-1',
    '/shellco/hospitality',
    '/all',
    '/eastvale/legends/casey-holt',
  ]) {
    const res = await fetch(base.fixture + path);
    assert.equal(res.status, 200, `fixture ${path}`);
    problems.push(...outlineProblems(await res.text(), `fixture ${path}`));
  }
  assert.deepEqual(problems, []);
  // Spot-check the outline of a profile: h1 name, the "at a glance" summary first, FAQ questions as h3 under their h2.
  const sitesProfile = (await get('/spurs/legends/dele-alli')).html;
  const outline = headings(sitesProfile);
  assert.deepEqual(outline.slice(0, 2), [
    { level: 1, text: 'Dele Alli' },
    { level: 2, text: 'Dele Alli at a glance' },
  ]);
  assert.ok(outline.some(h => h.level === 3 && h.text === 'How far in advance should we book?'));
});

test('images: content photos are <img> with srcset and alt text; the LCP photo is eager and high priority', async () => {
  for (const path of pages) {
    const html = withoutScripts((await get(path)).html);
    assert.doesNotMatch(html, /aria-label="Photo"/, `${path}: meaningless "Photo" label`);
    assert.doesNotMatch(html, /class="photo[^"]*\si\d+/, `${path}: CSS background photo`);
    for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(img, /\salt="[^"]*"/, `${path}: <img> without alt: ${img.slice(0, 120)}`);
      if (/class="ph"/.test(img)) {
        assert.match(img, /\ssrcSet="\/_next\/image\?url=[^"]+ \d+w/, `${path}: photo without a srcset`);
        assert.match(img, /\ssizes="[^"]+"/, path);
        assert.match(img, /\sloading="(lazy|eager)"/, path);
      }
    }
    const photos = [...html.matchAll(/<img class="ph"[^>]*>/g)].map(([img]) => img);
    const alts = photos.map(img => text(/alt="([^"]*)"/.exec(img)?.[1] ?? ''));
    if (/\/legends\/[a-z0-9-]+$/.test(path)) {
      const name = text(/<h1 class="disp">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
      assert.ok(alts[0].startsWith(`${name}, `), `${path}: the hero alt names ${name}: "${alts[0]}"`);
      assert.match(photos[0], /loading="eager" fetchPriority="high"/, `${path}: profile hero is the LCP image`);
      assert.equal(photos.filter(img => /fetchPriority="high"/.test(img)).length, 1, path);
    }
    if (sites.some(site => path === `/${site.slug}`))
      assert.match(photos[0], /fetchPriority="high"/, `${path}: home hero is the LCP image`);
    if (path.endsWith('/legends')) {
      const cards = photos.filter(img => /loading="lazy"/.test(img));
      assert.ok(cards.length > photos.length / 2, `${path}: most roster photos load lazily`);
      assert.ok(
        alts.every(alt => alt.length > 0),
        `${path}: every roster photo has alt text`,
      );
    }
  }
  const wordmark = /<img class="wordmark"[^>]*alt="([^"]+)"/.exec((await get('/spurs')).html)?.[1];
  assert.equal(wordmark, 'Tottenham Hotspur', 'the wordmark is named after the organisation');
});

test('structured data: one valid @graph per page, matching the visible page, never Review or rating markup', async () => {
  for (const path of new Set([...pages, ...hubPages])) {
    const html = (await get(path)).html;
    const blocks = jsonLd(html);
    assert.equal(blocks.length, 1, `${path}: ${blocks.length} JSON-LD blocks`);
    assert.deepEqual(checkStructuredData(blocks[0], path), []);
    const all = nodes(blocks[0]);
    assert.ok(!JSON.stringify(blocks[0]).match(/"(Review|AggregateRating|Rating)"/), `${path}: review markup`);
    assert.equal(all.find(node => node['@type'] === 'Organization')?.name, 'PepTalk', path);
    const crumbs = all.find(node => node['@type'] === 'BreadcrumbList');
    const visible = /<nav class="wrap crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/.exec(html)?.[1];
    const isHome = sites.some(site => path === `/${site.slug}`);
    if (isHome || path === '/') assert.equal(crumbs, undefined, `${path}: no breadcrumb on a home page`);
    else {
      assert.ok(crumbs && visible, `${path}: inner pages have breadcrumbs, visible and in structured data`);
      const names = (crumbs.itemListElement as { name: string }[]).map(item => item.name);
      assert.equal(text(visible ?? '').replace(/ \/ /g, '/'), names.join('/'), `${path}: visible crumbs match the schema`);
      assert.equal((crumbs.itemListElement as { item: string }[]).at(-1)?.item, `${ORIGIN}${path}`);
    }
    for (const faq of all.filter(node => node['@type'] === 'FAQPage'))
      for (const q of faq.mainEntity as { name: string }[])
        assert.ok(text(html).includes(q.name), `${path}: FAQ "${q.name}" is not visible`);
  }
  const profile = nodes(jsonLd((await get('/spurs/legends/dele-alli')).html)[0]);
  const person = profile.find(node => node['@type'] === 'Person');
  assert.equal(person?.name, 'Dele Alli');
  assert.equal(profile.find(node => node['@type'] === 'ProfilePage')?.mainEntity && true, true);
  assert.deepEqual(person?.affiliation, { '@id': `${ORIGIN}/spurs#rights-holder` });
  const site = sites.find(candidate => candidate.slug === 'spurs') as Site;
  const roster = nodes(jsonLd((await get('/spurs/legends')).html)[0]).find(node => node['@type'] === 'ItemList');
  assert.equal(roster?.numberOfItems, site.people.length, 'the roster ItemList lists every published person');
  const ways = nodes(jsonLd((await get('/spurs/ways-to-book')).html)[0]).filter(node => node['@type'] === 'Service');
  assert.equal(ways.length, 7);
  // The home page shows the booking FAQ, so it carries FAQPage markup (every question visible: checked above).
  assert.ok(
    nodes(jsonLd((await get('/spurs')).html)[0]).some(node => node['@type'] === 'FAQPage'),
    'FAQ markup where the FAQ renders',
  );
});

test('metadata: unique titles and descriptions within budget, canonical, robots, complete Open Graph with a resolvable card, and <html lang>', async () => {
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const cards = new Set<string>();
  for (const path of new Set([...pages, ...hubPages])) {
    const html = (await get(path)).html;
    const title = text(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
    const description = text(meta(html, 'description') ?? '');
    assert.ok(title.length >= 15 && title.length <= 75, `${path}: title "${title}" (${title.length})`);
    assert.ok(
      description.length >= DESCRIPTION_MIN && description.length <= DESCRIPTION_MAX,
      `${path}: description (${description.length}) "${description}"`,
    );
    assert.ok(!titles.has(title), `${path}: title "${title}" repeats ${titles.get(title)}`);
    assert.ok(!descriptions.has(description), `${path}: description repeats ${descriptions.get(description)}`);
    titles.set(title, path);
    descriptions.set(description, path);
    assert.equal(meta(html, 'og:url'), pageUrl(path), path);
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image', path);
    for (const tag of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:image:alt'])
      assert.ok(meta(html, tag), `${path}: missing ${tag}`);
    const image = meta(html, 'og:image') ?? '';
    assert.match(image, /^https?:\/\//, `${path}: og:image must be absolute`);
    if (image.startsWith(ORIGIN)) cards.add(new URL(image).pathname);
    const site = sites.find(candidate => path.split('/')[1] === candidate.slug);
    const lang = site?.lang ?? 'en-GB';
    assert.match(html, new RegExp(`^<!DOCTYPE html><html lang="${lang}">`), `${path}: lang`);
    assert.equal(meta(html, 'og:locale'), lang.replace('-', '_'), path);
  }
  assert.ok(cards.size > sites.length, 'pages use their own Open Graph cards');
  for (const card of cards) assert.equal((await fetch(base.open + card)).status, 200, `missing card ${card}`);
  assert.match((await get('/eastvale')).html, /<html lang="en-US">/);
  const notFound = await (await fetch(`${base.open}/no-such-page`)).text();
  assert.doesNotMatch(notFound, /rel="canonical"/, 'bug: the 404 page declared a canonical URL');
});

test('discovery files while nothing is indexable: empty sitemaps, no llms.txt, concept banner on', async () => {
  assert.equal(
    await (await fetch(`${base.open}/sitemap.xml`)).text(),
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>\n',
  );
  assert.doesNotMatch(await (await fetch(`${base.open}/spurs/sitemap.xml`)).text(), /<url>/);
  assert.equal((await fetch(`${base.open}/llms.txt`)).status, 404);
  assert.equal((await fetch(`${base.open}/spurs/llms.txt`)).status, 404);
  assert.match((await get('/spurs/legends')).html, /class="concept"/);
});

test('fixture: an indexable site is public, indexable and listed; others stay gated, noindex and unlisted', async () => {
  const launched = await fetch(`${base.fixtureGated}/eastvale/legends/casey-holt`);
  assert.equal(launched.status, 200, 'an indexable site needs no password');
  assert.equal(launched.headers.get('x-robots-tag'), null);
  const html = await launched.text();
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"\/>/);
  assert.doesNotMatch(html, /class="concept"/, 'no concept banner on a launched site');
  assert.equal((await fetch(`${base.fixtureGated}/spurs`)).status, 401, 'a site that is not indexable keeps its gate');
  for (const path of ['/styles.css', '/robots.txt', '/sitemap.xml', '/eastvale/sitemap.xml', '/all', '/terms'])
    assert.equal((await fetch(base.fixtureGated + path)).status, 200, `${path} is public once something is launched`);
  const spurs = await fetch(`${base.fixture}/spurs/legends`);
  assert.equal(spurs.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await spurs.text(), /<meta name="robots" content="noindex, nofollow"\/>/);
  const robots = await (await fetch(`${base.fixture}/robots.txt`)).text();
  assert.match(robots, /^Allow: \/eastvale\/$/m);
  assert.match(robots, /^Allow: \/all\$$/m);
  assert.doesNotMatch(robots, /spurs|shellco/);
  assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
  const index = await (await fetch(`${base.fixture}/sitemap.xml`)).text();
  assert.ok(index.includes(`<loc>${ORIGIN}/eastvale/sitemap.xml</loc>`) && index.includes(`<loc>${ORIGIN}/all/sitemap.xml</loc>`));
  assert.doesNotMatch(index, /spurs|shellco/);
  const launchedMap = await (await fetch(`${base.fixture}/eastvale/sitemap.xml`)).text();
  // Page URLs only: image entries are photo URLs (Getty, or media.example.com for the fictional sites).
  const listed = [...launchedMap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc).filter(loc => loc.startsWith(ORIGIN));
  const launchedSite = (await createJsonProvider({ sitesDir: fixtureDir, cache: false }).getSite('eastvale')) as Site;
  for (const loc of listed) assert.equal((await fetch(base.fixture + new URL(loc).pathname)).status, 200, `${loc} is a built page`);
  assert.equal(listed.filter(loc => loc.includes('/legends/')).length, launchedSite.people.length);
  assert.ok(!listed.some(loc => /terms|privacy/.test(loc)), 'placeholder legal pages are not listed');
  assert.doesNotMatch(await (await fetch(`${base.fixture}/spurs/sitemap.xml`)).text(), /<url>/);
  assert.match(await (await fetch(`${base.fixture}/eastvale/llms.txt`)).text(), /^# Eastvale Rovers Legends/);
  assert.equal((await fetch(`${base.fixture}/spurs/llms.txt`)).status, 404);
  assert.match(await (await fetch(`${base.fixture}/llms.txt`)).text(), /\[Eastvale Rovers Legends\]/);
});

test('fixture: shell sites and a one-person site render without broken images or empty sections', async () => {
  const shell = (await createJsonProvider({ sitesDir: fixtureDir, cache: false }).getRawSite('shellco')) as Parameters<
    typeof validateSite
  >[0];
  assert.deepEqual(
    validateSite(shell).filter(problem => !/licen|verif/i.test(problem)),
    [],
    'the fixture is valid content',
  );
  const profile = await (await fetch(`${base.fixture}/shellco/legends/placeholder-1`)).text();
  assert.match(profile, /Photo to come/);
  assert.doesNotMatch(profile, /class="sim"/, 'bug: a one-person site showed an empty "more people" section');
  const hospitality = await (await fetch(`${base.fixture}/shellco/hospitality`)).text();
  assert.doesNotMatch(hospitality, /Popular hosts/, 'bug: an empty "popular hosts" grid was shown');
  const landing = await (await fetch(`${base.fixture}/all`)).text();
  assert.doesNotMatch(landing, /\binull\b|Getty null/, 'bug: shell sites showed "Getty null" tiles on /all');
  assert.match(landing, /Photo to come/);
  const roster = await (await fetch(`${base.fixture}/shellco/legends`)).text();
  assert.match(roster, /<p class="empty" hidden="">/, 'the empty message stays hidden while there are people');
});

test('about page: the heading names the platform (or the site’s own override), and title and breadcrumb follow it', async () => {
  for (const site of sites.filter(candidate => candidate.pages?.about !== false)) {
    const html = (await get(`/${site.slug}/about`)).html;
    const h1 = text(/<h1 class="disp">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
    const expected = text(site.vocab?.aboutTitle ?? `About ${site.platform}`);
    assert.equal(h1, expected, site.slug);
    assert.doesNotMatch(h1, /Operated by PepTalk/, `${site.slug}: the old default heading`);
    assert.ok(text(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '').startsWith(h1), `${site.slug}: title starts with the heading`);
    const crumbs = nodes(jsonLd(html)[0]).find(node => node['@type'] === 'BreadcrumbList')?.itemListElement as { name: string }[];
    assert.equal(crumbs.at(-1)?.name, h1, `${site.slug}: breadcrumb`);
  }
  assert.equal(
    text(/<h1 class="disp">([\s\S]*?)<\/h1>/.exec((await get('/eastvale/about')).html)?.[1] ?? ''),
    'About Eastvale Rovers Legends',
  );
  assert.equal(
    text(/<h1 class="disp">([\s\S]*?)<\/h1>/.exec((await get('/spurs/about')).html)?.[1] ?? ''),
    'About the Spurs Speaker Network',
  );
});

// ---- Per-site domains, the enquiry endpoint and the tracking slot (fixture build; real Host headers) ----

/** A request with a chosen Host header (fetch can't set one). */
function hostFetch(
  origin: string,
  host: string,
  path: string,
  { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${origin}${path}`, { method, headers: { ...headers, host } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const auth = (password: string) => ({ authorization: `Basic ${Buffer.from(`x:${password}`).toString('base64')}` });
const canonical = (html: string) => /<link rel="canonical" href="([^"]+)"\/>/.exec(html)?.[1];
const NORTHBRIDGE = DOMAINS.northbridge.primary;
const SPURS = DOMAINS.spurs.primary;

test('domains: each domain mount is prerendered; a site’s host serves that site at the root with links without the slug', async () => {
  const manifest = JSON.parse(readFileSync(`${FIXTURE_DIST}/prerender-manifest.json`, 'utf8')) as { routes: Record<string, unknown> };
  const northbridge = (await createJsonProvider({ sitesDir: fixtureDir, cache: false }).getSite('northbridge')) as Site;
  for (const path of ['', '/legends', '/about', '/check-availability', '/terms', `/legends/${northbridge.people[0].slug}`])
    assert.ok(Object.hasOwn(manifest.routes, `/northbridge--domain${path}`), `/northbridge--domain${path} is not prerendered`);
  assert.ok(Object.hasOwn(manifest.routes, '/spurs--domain'), 'a domain that is not live yet is built too, for checks before go-live');
  assert.ok(!Object.hasOwn(manifest.routes, '/eastvale--domain'), 'no domain, no mount');

  const home = await hostFetch(base.fixture, NORTHBRIDGE, '/');
  assert.equal(home.status, 200);
  assert.match(home.body, /<body class="site-northbridge"/);
  assert.match(home.body, /href="\/site\.css\?v=[0-9a-f]{12}"/);
  assert.match(home.body, /<a href="\/" class="brand"/);
  assert.match(home.body, /href="\/legends"/);
  assert.doesNotMatch(body(home.body), /href="\/northbridge[/"]/, 'links on the domain have no slug prefix');
  const css = await hostFetch(base.fixture, NORTHBRIDGE, '/site.css');
  assert.equal(css.status, 200);
  assert.ok(css.body.startsWith('.site-northbridge{'));
  for (const path of ['/legends', `/legends/${northbridge.people[0].slug}`, '/about', '/check-availability', '/privacy'])
    assert.equal((await hostFetch(base.fixture, NORTHBRIDGE, path)).status, 200, path);
  // Every internal link on a domain page resolves on that domain.
  const roster = await hostFetch(base.fixture, NORTHBRIDGE, '/legends');
  for (const [, href] of new Set(body(roster.body).matchAll(/href="(\/[^"#?]*)/g)))
    assert.equal((await hostFetch(base.fixture, NORTHBRIDGE, href)).status, 200, `broken link ${href} on ${NORTHBRIDGE}`);
  assert.match(
    (await hostFetch(base.fixture, NORTHBRIDGE, '/check-availability')).body,
    /<form class="enquiry"[^>]*action="\/api\/enquiry"/,
  );
  // Host header case and port don't matter.
  assert.equal((await hostFetch(base.fixture, 'NorthbridgeLegends.example:443', '/legends')).status, 200);
});

test('domains: a partner domain never exposes /all, another site or a domain mount', async () => {
  for (const path of [
    '/all',
    '/spurs',
    '/spurs/legends',
    '/eastvale',
    '/northbridge',
    '/northbridge/legends',
    '/landing.css',
    '/northbridge--domain',
    '/spurs--domain/legends',
    '/og/spurs.jpg',
    '/og/spurs-legends.jpg',
    '/legends/nobody',
  ])
    assert.equal((await hostFetch(base.fixture, NORTHBRIDGE, path)).status, 404, `${NORTHBRIDGE}${path}`);
  // The generic card is served on the domain. (The fictional site has no cards of its own in public/og/; that its own
  // card names pass the proxy on its domain is checked in proxy.test.ts.)
  for (const path of ['/og/appearances.jpg', '/styles.css', '/peptalk/logo.png', '/health'])
    assert.equal((await hostFetch(base.fixture, NORTHBRIDGE, path)).status, 200, `${NORTHBRIDGE}${path}`);
  // Mounts never answer on the hub or any other host.
  for (const host of [HUB_HOST, '127.0.0.1'])
    for (const path of [
      '/northbridge--domain',
      '/northbridge--domain/legends',
      '/spurs--domain/site.css',
      '/northbridge--domain/robots.txt',
    ])
      assert.equal((await hostFetch(base.fixture, host, path)).status, 404, `${host}${path}`);
});

test('domains: aliases 301 to the primary; the hub host 301s a live site’s folder; other hosts keep serving it', async () => {
  const alias = await hostFetch(base.fixture, 'www.northbridgelegends.example', '/legends?role=squad');
  assert.equal(alias.status, 301);
  assert.equal(alias.headers.location, `https://${NORTHBRIDGE}/legends?role=squad`);
  const folder = await hostFetch(base.fixture, HUB_HOST, '/northbridge/legends?role=player');
  assert.equal(folder.status, 301);
  assert.equal(folder.headers.location, `https://${NORTHBRIDGE}/legends?role=player`);
  assert.equal((await hostFetch(base.fixture, HUB_HOST, '/northbridge')).headers.location, `https://${NORTHBRIDGE}/`);
  assert.equal(
    (await hostFetch(base.fixture, HUB_HOST, '/northbridge/sitemap.xml')).headers.location,
    `https://${NORTHBRIDGE}/sitemap.xml`,
  );
  assert.equal(
    (await hostFetch(base.fixture, HUB_HOST, '/spurs/legends')).status,
    200,
    'a domain that is not live leaves the folder alone',
  );
  assert.equal((await hostFetch(base.fixture, HUB_HOST, '/all')).status, 200, 'the hub keeps /all');
  // Preview and deployment URLs (any other host) behave as the hub without the move, so a live site stays reviewable.
  assert.equal((await hostFetch(base.fixture, 'peptalk-appearances-git-x.vercel.app', '/northbridge/legends')).status, 200);
});

test('domains: canonical, Open Graph and structured data use the live domain on every copy; only the canonical copy is indexable', async () => {
  const onDomain = (await hostFetch(base.fixture, NORTHBRIDGE, '/legends')).body;
  assert.equal(canonical(onDomain), `https://${NORTHBRIDGE}/legends`);
  assert.match(onDomain, new RegExp(`<meta property="og:url" content="https://${NORTHBRIDGE.replace('.', '\\.')}/legends"/>`));
  assert.match(
    onDomain,
    // The fictional site has no rendered cards, so its pages use the generic one: still on the domain.
    new RegExp(`<meta property="og:image" content="https://${NORTHBRIDGE.replace('.', '\\.')}/og/appearances\\.jpg"/>`),
  );
  assert.match(onDomain, /<meta name="robots" content="index, follow, max-image-preview:large"\/>/);
  for (const node of nodes(jsonLd(onDomain)[0]).filter(n => typeof n.url === 'string' && n['@type'] !== 'Organization'))
    assert.ok(String(node.url).startsWith(`https://${NORTHBRIDGE}/`), `${node['@type']} ${node.url}`);
  // Next.js writes the root URL without its trailing slash; both name the same URL.
  assert.equal(canonical((await hostFetch(base.fixture, NORTHBRIDGE, '/')).body), `https://${NORTHBRIDGE}`);
  const folderCopy = (await hostFetch(base.fixture, '127.0.0.1', '/northbridge/legends')).body;
  assert.equal(canonical(folderCopy), `https://${NORTHBRIDGE}/legends`, 'the folder copy points at the domain');
  assert.match(folderCopy, /<meta name="robots" content="noindex, nofollow"\/>/, 'the folder copy of a live site is not indexed');
  assert.doesNotMatch(folderCopy, /class="concept"/, 'no concept banner on a launched site, whichever copy');
  // Not live yet: the hub folder stays canonical, and the domain copy is noindex.
  const spursDomain = await hostFetch(base.fixture, SPURS, '/legends');
  assert.equal(canonical(spursDomain.body), `${ORIGIN}/spurs/legends`);
  assert.match(spursDomain.body, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.equal(spursDomain.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal((await hostFetch(base.fixture, NORTHBRIDGE, '/legends')).headers['x-robots-tag'], undefined);
});

test('domains: robots.txt, sitemaps and llms.txt per host', async () => {
  assert.equal(
    (await hostFetch(base.fixture, NORTHBRIDGE, '/robots.txt')).body,
    `User-Agent: *\nAllow: /\n\nSitemap: https://${NORTHBRIDGE}/sitemap.xml\n`,
  );
  assert.equal((await hostFetch(base.fixture, SPURS, '/robots.txt')).body, 'User-Agent: *\nDisallow: /\n');
  const map = (await hostFetch(base.fixture, NORTHBRIDGE, '/sitemap.xml')).body;
  // Page URLs only: image entries are photo URLs on their own hosts.
  const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, loc]) => loc)
    .filter(loc => !loc.includes('gettyimages') && !loc.includes('media.example.com'));
  assert.ok(locs.length > 5 && locs.every(loc => loc.startsWith(`https://${NORTHBRIDGE}/`)), 'every URL is on the domain');
  assert.ok(locs.includes(`https://${NORTHBRIDGE}/`) && locs.includes(`https://${NORTHBRIDGE}/legends`));
  assert.doesNotMatch(
    (await hostFetch(base.fixture, '127.0.0.1', '/northbridge/sitemap.xml')).body,
    /<url>/,
    'the folder copy lists nothing',
  );
  assert.match(
    (await hostFetch(base.fixture, NORTHBRIDGE, '/llms.txt')).body,
    new RegExp(`\\(https://${NORTHBRIDGE.replace('.', '\\.')}/legends\\)`),
  );
  const index = (await hostFetch(base.fixture, HUB_HOST, '/sitemap.xml')).body;
  assert.ok(index.includes(`<loc>${ORIGIN}/eastvale/sitemap.xml</loc>`));
  assert.doesNotMatch(index, /northbridge/, 'a live domain’s sitemap is on its own host');
  assert.match(
    (await hostFetch(base.fixture, HUB_HOST, '/llms.txt')).body,
    new RegExp(`\\(https://${NORTHBRIDGE.replace('.', '\\.')}/\\)`),
  );
});

test('domains: the gate works per host; a site’s domain opens only with the master or that site’s password', async () => {
  const status = async (host: string, path: string, password?: string) =>
    (await hostFetch(base.fixtureGated, host, path, { headers: password ? auth(password) : {} })).status;
  assert.equal(await status(SPURS, '/legends'), 401);
  assert.equal(await status(SPURS, '/legends', 'spurs pw'), 200);
  assert.equal(await status(SPURS, '/legends', 'master pw'), 200);
  assert.equal(await status(SPURS, '/legends', 'shell pw'), 401, 'another site’s password');
  assert.equal(await status(SPURS, '/styles.css', 'shell pw'), 401, 'shared assets too: everything on the host is that site’s');
  assert.equal(await status(SPURS, '/site.css', 'spurs pw'), 200);
  assert.equal(await status(SPURS, '/og/spurs.jpg'), 200, 'the site’s own link-preview cards stay public');
  assert.equal(await status(NORTHBRIDGE, '/legends'), 200, 'a launched site needs no password on its domain');
  assert.equal(await status(HUB_HOST, '/shellco', 'spurs pw'), 401);
});

test('enquiry endpoint: POST/redirect/GET without JavaScript, JSON with it, validation, honeypot, same-origin, per-site gate', async () => {
  const people = sites.find(site => site.slug === 'spurs')?.people ?? [];
  const valid = new URLSearchParams({
    site: 'spurs',
    t: '',
    website: '',
    name: 'Test Person',
    email: 'test@example.com',
    company: 'Example Ltd',
    date: '',
    who: 'Legend',
    where: 'UK',
    format: 'Keynote',
    size: '250–500',
    legend: people[0]?.slug ?? '',
    brief: '',
  });
  const spurs = (await hub.getSite('spurs')) as Site;
  const ctx = (await import('../../lib/render/context.ts')).siteContext(spurs);
  valid.set('who', ctx.v.whoOptions[0]);
  valid.set('where', ctx.v.whereOptions[0]);
  valid.set('format', Object.values(ctx.FORMATS)[0].title);
  const post = (origin: string, host: string, form: URLSearchParams, headers: Record<string, string> = {}) =>
    hostFetch(origin, host, '/api/enquiry', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: form.toString(),
    });
  const host = new URL(base.open).host;
  const sent = await post(base.open, host, valid);
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.location, '/spurs/check-availability#enquiry-sent');
  const json = await post(base.open, host, valid, { accept: 'application/json' });
  assert.equal(json.status, 200);
  assert.deepEqual(JSON.parse(json.body), { ok: true, forwarded: false }, 'no webhook: checked, then discarded');
  const invalid = new URLSearchParams(valid);
  invalid.set('email', 'not-an-email');
  const rejected = await post(base.open, host, invalid, { accept: 'application/json' });
  assert.equal(rejected.status, 400);
  assert.deepEqual(JSON.parse(rejected.body).fields, ['email']);
  assert.equal((await post(base.open, host, invalid)).headers.location, '/spurs/check-availability#enquiry-error');
  const bot = new URLSearchParams(valid);
  bot.set('website', 'https://spam.example');
  assert.deepEqual(JSON.parse((await post(base.open, host, bot, { accept: 'application/json' })).body), { ok: true, forwarded: false });
  assert.equal((await post(base.open, host, valid, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await hostFetch(base.open, host, '/api/enquiry')).status, 405);
  // On a site's domain: back to the domain's form, and only that site's form.
  const partner = new URLSearchParams(valid);
  partner.set('site', 'northbridge');
  const partnerSite = (await createJsonProvider({ sitesDir: fixtureDir, cache: false }).getSite('northbridge')) as Site;
  partner.set('legend', partnerSite.people[0].slug);
  const partnerCtx = (await import('../../lib/render/context.ts')).siteContext(partnerSite);
  partner.set('who', partnerCtx.v.whoOptions[0]);
  partner.set('where', partnerCtx.v.whereOptions[0]);
  partner.set('format', Object.values(partnerCtx.FORMATS)[0].title);
  assert.equal((await post(base.fixture, NORTHBRIDGE, partner)).headers.location, '/check-availability#enquiry-sent');
  const spoofed = await post(base.fixture, NORTHBRIDGE, valid, { 'x-appearances-site': 'spurs' });
  assert.equal(spoofed.status, 400, 'a client-sent site header is replaced by the proxy');
  // Gated: the proxy needs a valid password, then the endpoint needs one for the site in the form.
  assert.equal((await post(base.fixtureGated, HUB_HOST, valid)).status, 401);
  assert.equal((await post(base.fixtureGated, HUB_HOST, valid, auth('shell pw'))).status, 401, 'another site’s password');
  const fixtureValid = new URLSearchParams(valid);
  assert.equal((await post(base.fixtureGated, HUB_HOST, fixtureValid, auth('spurs pw'))).status, 303);
});

test('tracking: only a site with tags gets them, behind consent, with Google’s hosts added to its CSP only', async () => {
  const tagged = await hostFetch(base.fixture, NORTHBRIDGE, '/legends');
  const csp = String(tagged.headers['content-security-policy']);
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/www\.googletagmanager\.com;/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.googletagmanager\.com /);
  assert.match(csp, /trusted-types default$/);
  const slot = /<script src="(\/tracking\.js\?v=[0-9a-f]{12})" defer=""([^>]*)><\/script>/.exec(tagged.body);
  assert.ok(slot, 'one external tracking script in the page');
  assert.match(slot[2], new RegExp(`data-gtm-id="${GTM}"`));
  assert.match(slot[2], /data-consent="required"/);
  assert.doesNotMatch(tagged.body, /<script[^>]+googletagmanager/, 'no tag script in the HTML: it loads after consent');
  const loader = await hostFetch(base.fixture, NORTHBRIDGE, slot[1]);
  assert.equal(loader.status, 200, 'the loader is a shared asset on the domain');
  assert.equal(loader.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.doesNotMatch(tagged.body, /\sstyle="/);
  const untagged = await fetch(`${base.fixture}/eastvale/legends`);
  assert.match(untagged.headers.get('content-security-policy') ?? '', /trusted-types 'none'$/);
  assert.doesNotMatch(untagged.headers.get('content-security-policy') ?? '', /googletagmanager/);
  assert.doesNotMatch(await untagged.text(), /GTM-|googletagmanager|tracking\.js/);
});

test('POST /api/revalidate: secret-authenticated (not the preview password), revalidates tags, pages keep serving', async () => {
  const post = (origin: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const notConfigured = await post(base.open, { site: 'spurs' }, { 'x-revalidate-secret': 'anything' });
  assert.equal(notConfigured.status, 503, 'no REVALIDATE_SECRET: fails closed');
  const denied = await post(base.gated, { site: 'spurs' }, { authorization: `Basic ${btoa('x:master pw')}` });
  assert.equal(denied.status, 401, 'the preview password is not the webhook secret');
  assert.equal(denied.headers.get('www-authenticate'), null);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal((await post(base.gated, { tags: ['nope'] }, { 'x-revalidate-secret': 'revalidate secret' })).status, 400);
  const ok = await post(
    base.gated,
    { tags: ['site:spurs', 'person:spurs:dele-alli', 'all'] },
    { 'x-revalidate-secret': 'revalidate secret' },
  );
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).tags, ['site:spurs', 'person:spurs:dele-alli', 'all']);
  assert.equal((await fetch(`${base.gated}/api/revalidate`, { headers: { authorization: `Basic ${btoa('x:master pw')}` } })).status, 405);
  // The revalidated pages regenerate on the next visits and keep serving the same content.
  for (const path of ['/spurs', '/spurs/legends/dele-alli', '/']) {
    const page = await fetch(base.gated + path, { headers: { authorization: `Basic ${btoa('x:master pw')}` } });
    assert.equal(page.status, 200, path);
    assert.match(await page.text(), /<h1/, path);
  }
  // On a site's own domain (fixture build): the webhook answers there too, and the domain copy, which carries the same
  // site:<slug> tag as the hub folder (test/next/revalidate.test.ts), regenerates and keeps serving.
  const secret = { 'content-type': 'application/json', 'x-revalidate-secret': 'revalidate secret' };
  const onDomain = await hostFetch(base.fixture, NORTHBRIDGE, '/api/revalidate', {
    method: 'POST',
    headers: secret,
    body: JSON.stringify({ site: 'northbridge' }),
  });
  assert.equal(onDomain.status, 200, onDomain.body);
  assert.deepEqual(JSON.parse(onDomain.body).tags, ['site:northbridge']);
  assert.equal(onDomain.headers['cache-control'], 'no-store');
  const alias = await hostFetch(base.fixture, 'www.northbridgelegends.example', '/api/revalidate', {
    method: 'POST',
    headers: secret,
    body: JSON.stringify({ site: 'northbridge' }),
  });
  assert.equal(alias.status, 200, 'an alias host answers too (a 301 would turn the POST into a GET)');
  for (const path of ['/', '/legends']) {
    const page = await hostFetch(base.fixture, NORTHBRIDGE, path);
    assert.equal(page.status, 200, `${NORTHBRIDGE}${path}`);
    assert.match(page.body, /<h1/, `${NORTHBRIDGE}${path}`);
  }
});

// ---- The component gallery (lib/gallery.ts): prerendered, master password only, never indexed, never on a domain ----

test('component gallery: prerendered, master password only, noindex, no tracking, a 404 without a master password or on a domain', async () => {
  const manifest = JSON.parse(readFileSync(`${DIST}/prerender-manifest.json`, 'utf8')) as { routes: Record<string, unknown> };
  assert.ok(Object.hasOwn(manifest.routes, '/gallery--internal'), 'the switcher is prerendered');
  for (const site of sites)
    assert.ok(Object.hasOwn(manifest.routes, `/gallery--internal/${site.slug}`), `${site.slug}'s gallery is prerendered`);
  const gallery = async (origin: string, path: string, password?: string) => {
    const res = await fetch(origin + path, { headers: password ? auth(password) : {} });
    return { status: res.status, headers: res.headers, html: await res.text() };
  };
  for (const path of ['/_gallery', '/_gallery/spurs']) {
    assert.equal((await gallery(base.gated, path)).status, 401, path);
    assert.equal((await gallery(base.gated, path, 'spurs pw')).status, 401, `${path}: a site password never opens it`);
    const { status, headers, html } = await gallery(base.gated, path, 'master pw');
    assert.equal(status, 200, path);
    assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow', path);
    assert.equal(headers.get('cache-control'), 'private, no-cache', path);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/, path);
    assert.doesNotMatch(html, /rel="canonical"/, `${path}: no canonical URL`);
    assert.doesNotMatch(html, /\sstyle="|<style[\s>]/, `${path}: no inline styles`);
    assert.doesNotMatch(html, /<script[^>]*tracking\.js|googletagmanager\.com\/gtm/, `${path}: no tracking`);
  }
  const spurs = (await gallery(base.gated, '/_gallery/spurs', 'master pw')).html;
  assert.match(spurs, /<body class="site-spurs gallery-page"/);
  assert.match(spurs, /href="\/spurs\/site\.css\?v=[0-9a-f]{12}"/, 'the site’s own theme');
  assert.match(spurs, /href="\/gallery\.css\?v=[0-9a-f]{12}"/);
  assert.equal((await gallery(base.gated, '/gallery.css', 'master pw')).status, 200);
  assert.equal((await gallery(base.gated, '/gallery.css', 'spurs pw')).status, 401);
  assert.equal((await gallery(base.gated, '/_gallery/nope', 'master pw')).status, 404);
  assert.equal((await gallery(base.gated, '/gallery--internal/spurs', 'master pw')).status, 404, 'only through /_gallery');
  assert.equal((await gallery(base.open, '/_gallery/spurs')).status, 404, 'PREVIEW_PUBLIC without a master password: no gallery');
  // A launched site doesn't open its gallery; a site's own domain never serves one.
  assert.equal((await gallery(base.fixtureGated, '/_gallery/eastvale')).status, 401);
  assert.equal((await gallery(base.fixtureGated, '/_gallery/eastvale', 'master pw')).headers.get('x-robots-tag'), 'noindex, nofollow');
  for (const path of ['/_gallery', '/_gallery/northbridge'])
    assert.equal(
      (await hostFetch(base.fixtureGated, NORTHBRIDGE, path, { headers: auth('master pw') })).status,
      404,
      `${NORTHBRIDGE}${path}`,
    );
  // Nothing public links to it.
  for (const path of pages) assert.doesNotMatch((await get(path)).html, /_gallery/, `${path} links the gallery`);
});

// ---- The landing page as the hub's home (main build: no root site) and with a root site (fixture, like src/sites) ----

test('landing page at /: prerendered once, canonical /, every platform and talent type linked, /all answers 301', async () => {
  const manifest = JSON.parse(readFileSync(`${DIST}/prerender-manifest.json`, 'utf8')) as { routes: Record<string, unknown> };
  assert.ok(Object.hasOwn(manifest.routes, '/'), '/ is prerendered (static)');
  assert.ok(!Object.hasOwn(manifest.routes, '/all'), 'no second copy at /all');
  const { status, headers, html } = await get('/');
  assert.equal(status, 200);
  assert.equal(headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(canonical(html), ORIGIN, 'canonical / (Next.js writes the root URL without its slash)');
  assert.equal(meta(html, 'og:url'), ORIGIN);
  assert.match(html, /<a\b[^>]*href="\/"[^>]*aria-label="PepTalk Appearances home">/);
  assert.doesNotMatch(body(html), /href="\/all["/?#]/, 'nothing links /all');
  const graph = nodes(jsonLd(html)[0]);
  assert.equal(graph.find(node => node['@type'] === 'WebSite')?.url, `${ORIGIN}/`);
  assert.equal(graph.find(node => node['@type'] === 'CollectionPage')?.url, `${ORIGIN}/`);
  assert.equal(graph.find(node => node['@type'] === 'ItemList')?.numberOfItems, sites.length, 'every active site');
  for (const site of sites) {
    assert.ok(html.includes(`href="/${site.slug}"`), `landing misses ${site.slug}`);
    for (const role of new Set(site.people.map(person => person.role)))
      assert.ok(html.includes(`href="/${site.slug}/legends?role=${role}"`), `landing misses ${site.slug}'s ${role} roster`);
  }
  assert.ok(html.includes('href="/terms"') && html.includes('href="/privacy"'), 'Terms and Privacy in the footer');
  // The hub legal pages: breadcrumbs start at / (visible and in structured data).
  for (const path of ['/terms', '/privacy']) {
    const legal = (await get(path)).html;
    assert.match(legal, /<nav class="wrap crumbs" aria-label="Breadcrumb">[\s\S]*?href="\/"/, path);
    const crumbs = nodes(jsonLd(legal)[0]).find(node => node['@type'] === 'BreadcrumbList')?.itemListElement as { item: string }[];
    assert.equal(crumbs[0].item, `${ORIGIN}/`, path);
    assert.equal(nodes(jsonLd(legal)[0]).find(node => node['@type'] === 'WebSite')?.url, `${ORIGIN}/`, path);
  }
  const moved = await fetch(`${base.open}/all?utm_source=partner`, { redirect: 'manual' });
  assert.equal(moved.status, 301);
  assert.equal(new URL(moved.headers.get('location') ?? '', base.open).href, `${base.open}/?utm_source=partner`);
  assert.equal((await fetch(`${base.open}/all`)).url, `${base.open}/`, 'followed, /all ends on /');
});

test('landing page at /: master password only; a site password is sent to its own site; /all moves before the gate', async () => {
  const at = (path: string, password?: string) => fetch(base.gated + path, { redirect: 'manual', headers: password ? auth(password) : {} });
  const denied = await at('/');
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate') ?? '', /^Basic /);
  assert.equal((await at('/', 'wrong')).status, 401);
  const master = await at('/', 'master pw');
  assert.equal(master.status, 200);
  assert.equal(master.headers.get('cache-control'), 'private, no-cache');
  assert.match(await master.text(), /<body class="landing"/);
  for (const [password, slug] of [
    ['spurs pw', 'spurs'],
    ['northbridge pw', 'northbridge'],
  ]) {
    const sent = await at('/?utm_source=partner', password);
    assert.equal(sent.status, 302, password);
    assert.equal(new URL(sent.headers.get('location') ?? '', base.gated).pathname, `/${slug}`, password);
    assert.equal(new URL(sent.headers.get('location') ?? '', base.gated).search, '?utm_source=partner');
    assert.equal(sent.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await sent.text(), /landing|platform/i, 'the redirect names no partner');
  }
  assert.equal((await at('/all')).status, 301, 'the move leaks nothing, so it comes before the gate');
  assert.equal((await at('/landing.css', 'spurs pw')).status, 401);
  assert.equal((await at('/terms', 'spurs pw')).status, 200);
});

test('fixture with a root site: / redirects to it, the landing page stays at /all (canonical /all), a partner domain keeps /', async () => {
  const root = await fetch(`${base.fixture}/?utm_source=partner`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(
    new URL(root.headers.get('location') ?? '', base.fixture).pathname + new URL(root.headers.get('location') ?? '', base.fixture).search,
    '/spurs?utm_source=partner',
  );
  const landing = await fetch(`${base.fixture}/all`, { redirect: 'manual' });
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert.match(html, /<body class="landing"/);
  assert.equal(canonical(html), `${ORIGIN}/all`);
  assert.match(html, /<a\b[^>]*href="\/all"[^>]*aria-label="PepTalk Appearances home"/);
  assert.equal(nodes(jsonLd(html)[0]).find(node => node['@type'] === 'WebSite')?.url, `${ORIGIN}/all`);
  assert.equal(nodes(jsonLd(html)[0]).find(node => node['@type'] === 'CollectionPage')?.url, `${ORIGIN}/all`);
  // The hub is indexable in the fixture: its sitemap and llms.txt name /all, and robots.txt allows it.
  const hubMap = await (await fetch(`${base.fixture}/all/sitemap.xml`)).text();
  assert.ok(hubMap.includes(`<loc>${ORIGIN}/all</loc>`), hubMap);
  assert.match(
    await (await fetch(`${base.fixture}/llms.txt`)).text(),
    new RegExp(`\\[All platforms\\]\\(${ORIGIN.replace('.', '\\.')}/all\\)`),
  );
  // A site-password holder at /all is sent to their site, as at / without a root site.
  const sent = await fetch(`${base.fixtureGated}/all`, { redirect: 'manual', headers: auth('spurs pw') });
  assert.equal(sent.status, 200, 'the fixture hub is indexable: public, no redirect');
  // A partner's own domain: / is that site's home, never the landing page.
  for (const host of [NORTHBRIDGE, SPURS]) {
    const home = await hostFetch(base.fixture, host, '/');
    assert.equal(home.status, 200, host);
    assert.doesNotMatch(home.body, /<body class="landing"/, host);
    assert.equal((await hostFetch(base.fixture, host, '/all')).status, 404, host);
  }
});
