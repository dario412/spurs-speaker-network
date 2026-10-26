// Render helpers: page switches, the theme CSS, the route table, entity decoding and the safe markdown renderer; and
// whole pages rendered with the app's components (through the admin's renderer, src/admin/next-render/): switched-off
// pages leave no link behind, and hostile content can't break out of an attribute.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { PAGE_DEFAULTS, publishable } from '../../lib/content/publish.ts';
import type { RawSite, Site } from '../../lib/content/types.ts';
import { siteContext } from '../../lib/render/context.ts';
import { parseInline, parseMarkdown, safeHref } from '../../lib/render/markdown.ts';
import { renderMarkdown } from '../../lib/render/markdown-view.ts';
import { allPaths, landingPath, resolvePage, sitePaths } from '../../lib/render/routes.ts';
import { decode, decodeDeep } from '../../lib/render/text.ts';
import { landingStylesheet, siteStylesheet, themeFor } from '../../lib/render/theme.ts';
import { renderPage } from '../../src/admin/next-render/index.mjs';
import { writeSitesDir } from '../fixtures/sites.mjs';

/** The real sites plus the fictional ones (test/fixtures/sites.mjs): several sites, so no theme or link leaks between them. */
const repo = createJsonProvider({ sitesDir: writeSitesDir(), cache: false });
const sites: Site[] = await repo.listSites();

test('optional pages default to on', () => {
  assert.deepEqual(PAGE_DEFAULTS, { waysToBook: true, hospitality: true, about: true });
});

test('per-site theme rules: own selector and brand colour first, no other site, no image map, small', () => {
  for (const site of sites) {
    const css = siteStylesheet(site);
    assert.ok(css.startsWith(`.site-${site.slug}{--brand:${site.theme.brand}`), site.slug);
    for (const other of sites.filter(candidate => candidate !== site)) assert.ok(!css.includes(`.site-${other.slug}{`), other.slug);
    assert.doesNotMatch(css, /--img:/, `${site.slug}: photos are <img> elements, not CSS backgrounds`);
    assert.ok(css.length < 2048, `${site.slug}/site.css stays small`);
  }
  assert.equal(landingStylesheet(sites), sites.map(siteStylesheet).join(''));
});

test('a text crest badge keeps only capitals, digits and spaces (it lands in a CSS string)', () => {
  const [site] = sites;
  assert.match(themeFor({ ...site, marks: {}, crestFallback: 'a"}x<y 1' } as Site), /content:"AXY 1"/);
});

test('the route table: hub pages, then every site’s pages as its switches allow, and no stories', () => {
  const expected = ['/', '/terms', '/privacy'];
  for (const site of sites) {
    const base = `/${site.slug}`;
    const pages = { ...PAGE_DEFAULTS, ...site.pages };
    expected.push(base, `${base}/legends`, ...site.people.map(person => `${base}/legends/${person.slug}`), `${base}/check-availability`);
    if (pages.waysToBook) expected.push(`${base}/ways-to-book`);
    if (pages.hospitality) expected.push(`${base}/hospitality`);
    if (pages.about) expected.push(`${base}/about`);
    expected.push(`${base}/terms`, `${base}/privacy`);
  }
  const current = allPaths(sites, landingPath(undefined));
  assert.equal(allPaths(sites, landingPath('spurs'))[0], '/all', 'with a root site, the landing page is at /all');
  assert.deepEqual([...current].sort(), [...expected].sort());
  assert.equal(new Set(current).size, current.length, 'no duplicate paths');
  assert.deepEqual(
    current.filter(path => path.includes('/stories')),
    [],
    'stories were removed',
  );
  for (const path of current) assert.ok(resolvePage(sites, path), path);
});

test('resolvePage: switched-off pages, hidden people and unknown paths resolve to nothing', () => {
  const [site] = sites;
  const hidden = site.people.find(person => !site.featured.includes(person.slug));
  assert.ok(hidden);
  const edited = { ...site, pages: { hospitality: false, waysToBook: false, about: false }, people: site.people.filter(p => p !== hidden) };
  for (const path of ['hospitality', 'ways-to-book', 'about', `legends/${hidden.slug}`])
    assert.equal(resolvePage([edited], `/${site.slug}/${path}`), null, path);
  for (const path of ['/nope', `/${site.slug}/legends/x/y`, `/${site.slug}/stories`, `/${site.slug}/site.css`, `/${site.slug}/terms/x`])
    assert.equal(resolvePage(sites, path), null, path);
  assert.ok(!sitePaths(edited).some(path => /hospitality|ways-to-book|about$/.test(path)));
  assert.equal(resolvePage([edited], `/${site.slug}/terms`)?.kind, 'terms', 'legal pages always exist');
  assert.deepEqual(resolvePage(sites, '/all'), { kind: 'landing' });
  assert.deepEqual(resolvePage(sites, '/'), { kind: 'landing' }, 'either landing URL (landingPath); the proxy redirects the other');
  assert.deepEqual(resolvePage(sites, '/privacy'), { kind: 'hub-legal', legal: 'privacy' });
});

test('demo flags come from site.json: demoHome and demoProfiles only', () => {
  for (const site of sites) {
    assert.equal((resolvePage(sites, `/${site.slug}`) as { demo: boolean }).demo, site.demoHome === true);
    for (const person of site.people) {
      const page = resolvePage(sites, `/${site.slug}/legends/${person.slug}`) as { demo: boolean };
      assert.equal(page.demo, site.demoProfiles?.includes(person.slug) === true);
    }
    assert.equal((resolvePage(sites, `/${site.slug}/legends`) as { demo: boolean }).demo, false);
  }
});

test('entities decode once; React escapes the rest', () => {
  assert.equal(decode('Fish &amp; chips &lt;b&gt; &#39;x&#x27; &unknown;'), "Fish & chips <b> 'x' &unknown;");
  assert.equal(decode('&amp;amp;'), '&amp;');
  assert.deepEqual(decodeDeep({ a: ['&amp;'], b: 1, c: null }), { a: ['&'], b: 1, c: null });
});

test('site context merges wording and FAQ overrides and fill FAQ placeholders', async () => {
  for (const site of sites) {
    const ctx = siteContext(site);
    assert.equal(ctx.v.legendsNoun, site.vocab?.legendsNoun ?? 'legends');
    assert.match(ctx.v.consentLine, /\{terms:[^}]+\}.*\{privacy:[^}]+\}/);
    for (const entry of ctx.faq()) assert.doesNotMatch(`${entry.q}${entry.a}`, /\{(org|first)/);
    assert.ok(ctx.faq(site.people[0]).length < ctx.faq().length);
    assert.doesNotMatch(JSON.stringify(ctx.site), /&amp;/, 'site strings are decoded');
  }
});

test('markdown: headings, paragraphs, nested lists, tables and safe links', () => {
  const blocks = parseMarkdown(
    '### Title\n\nOne\nline.\n\n- a\n  - a1\n  - a2\n- b\n\n1. first\n2. second\n\n| H1 | H2 |\n|---|---|\n| x<br>y | [ok](https://example.com) |\n',
  );
  assert.deepEqual(
    blocks.map(block => block.type),
    ['heading', 'paragraph', 'list', 'list', 'table'],
  );
  assert.deepEqual(blocks[1], { type: 'paragraph', children: [{ type: 'text', value: 'One line.' }] });
  const list = blocks[2] as Extract<(typeof blocks)[number], { type: 'list' }>;
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].lists[0].items.length, 2);
  assert.equal((blocks[3] as { ordered: boolean }).ordered, true);
  const table = blocks[4] as Extract<(typeof blocks)[number], { type: 'table' }>;
  assert.deepEqual(table.rows[0][0], [{ type: 'text', value: 'x' }, { type: 'break' }, { type: 'text', value: 'y' }]);
  assert.equal(table.rows[0][1][0].type, 'link');
});

test('markdown: raw HTML and unsafe links stay text', () => {
  const nodes = parseInline('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) <br>');
  assert.ok(
    nodes.every(node => node.type === 'text'),
    'no element nodes outside table cells',
  );
  assert.equal(
    nodes.map(node => (node.type === 'text' ? node.value : '')).join(''),
    '<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) <br>',
  );
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'vbscript:x']) assert.equal(safeHref(bad), null, bad);
  for (const good of ['https://x.test', 'mailto:a@b.c', '/spurs', '#faq']) assert.equal(safeHref(good), good);
  const [block] = parseMarkdown('<div onclick="x">hi</div>');
  assert.deepEqual(block, { type: 'paragraph', children: [{ type: 'text', value: '<div onclick="x">hi</div>' }] });
});

test('the real legal documents parse into headings, paragraphs, lists and a table', async () => {
  const provider = createJsonProvider({ cache: false });
  const privacy = parseMarkdown((await provider.getLegal('privacy')).body);
  assert.ok(privacy.some(block => block.type === 'table'));
  assert.ok(privacy.some(block => block.type === 'list'));
  const terms = parseMarkdown((await provider.getLegal('terms')).body);
  assert.ok(terms.filter(block => block.type === 'heading').length > 10);
});

const html = (markdown: string) => renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(markdown)));

test('rendered markdown escapes raw HTML and drops unsafe links', () => {
  const out = html(
    '### Hi <b>there</b>\n\n<script>alert(1)</script> & <img src=x onerror=alert(1)> [bad](javascript:alert(1)) [good](https://x.test)\n\n| a<br>b | <i>c</i> |\n|---|---|\n| d | e |\n',
  );
  assert.doesNotMatch(out, /<script|<img|<b>|<i>|href="javascript/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &lt;img/);
  assert.match(out, /<h2>Hi &lt;b&gt;there&lt;\/b&gt;<\/h2>/);
  assert.match(out, /<a href="https:\/\/x.test" rel="noopener">good<\/a>/);
  assert.match(out, /<th scope="col">a<br\/>b<\/th><th scope="col">&lt;i&gt;c&lt;\/i&gt;<\/th>/);
});

test('rendered markdown: heading levels shift under the page h1, nested lists nest', () => {
  assert.equal(html('### A\n\n#### B\n'), '<h2>A</h2><h3>B</h3>');
  // Bug: a source that skips a level (## then ####) used to skip it on the page too (h2 -> h4).
  assert.equal(html('## A\n\n#### B\n\n## C\n'), '<h2>A</h2><h3>B</h3><h2>C</h2>');
  assert.equal(html('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
});

test('switched-off pages, hidden people and inactive sites leave no route and no link behind', async () => {
  const [first, second] = sites;
  const raw = (await repo.getRawSite(first.slug)) as RawSite;
  const hidden = raw.people.find(person => !raw.featured.includes(person.slug));
  assert.ok(hidden);
  const edited = publishable({
    ...raw,
    pages: { hospitality: false, waysToBook: false, about: false },
    people: raw.people.map(person => (person === hidden ? { ...person, active: false } : person)),
  });
  // The second site is inactive, so it is not published at all.
  const published = [edited, ...sites.slice(2)];
  const gone = ['hospitality', 'ways-to-book', 'about', `legends/${hidden.slug}`].map(path => `/${first.slug}/${path}`);
  const paths = allPaths(published, '/');
  for (const path of gone) assert.ok(!paths.includes(path), `${path} still exists`);
  assert.ok(!paths.some(path => path.split('/')[1] === second.slug), 'inactive site still has pages');
  for (const path of [...sitePaths(edited), '/']) {
    const { status, html } = await renderPage(path, published);
    assert.equal(status, 200, path);
    for (const target of gone)
      assert.ok(!html.includes(`href="${target}"`) && !html.includes(`href="${target}#`), `${path} links ${target}`);
    assert.ok(!html.includes(`href="/${second.slug}"`) && !html.includes(`href="/${second.slug}/`), `${path} links the inactive site`);
  }
});

test('content with quotes and markup cannot break out of attributes', async () => {
  const hostile = `Club "<>&'`;
  const plain = sites.find(site => !site.demoHome && !site.demoProfiles?.length) as Site;
  const raw = structuredClone((await repo.getRawSite(plain.slug)) as RawSite);
  Object.assign(raw, { orgName: `Org ${hostile}`, short: `Short ${hostile}` });
  raw.people[0].name = `Person ${hostile}`;
  const site = publishable(raw);
  const unescapeHtml = (value: string) =>
    value.replace(/&(amp|quot|lt|gt|#x27|#39);/g, (_, entity: string) =>
      entity === 'amp' ? '&' : entity === 'quot' ? '"' : entity === 'lt' ? '<' : entity === 'gt' ? '>' : "'",
    );
  const rendered = new Map<string, string>();
  for (const path of [...sitePaths(site), '/all']) rendered.set(path, (await renderPage(path, [site])).html);
  // A raw quote after the hostile prefix inside any attribute would end the attribute early.
  for (const [path, html] of rendered) assert.doesNotMatch(html, /="[^"]*(?:Org|Short|Person) Club"/, path);
  const home = rendered.get(`/${site.slug}`) ?? '';
  assert.equal(unescapeHtml(/data-org-name="([^"]*)"/.exec(home)?.[1] ?? ''), site.orgName);
  assert.equal(unescapeHtml(/aria-label="([^"]*) crest"/.exec(home)?.[1] ?? ''), site.orgName);
  assert.equal(unescapeHtml(/<a\b[^>]*aria-label="Explore ([^"]*)"/.exec(rendered.get('/all') ?? '')?.[1] ?? ''), site.orgName);
  const profile = rendered.get(`/${site.slug}/legends/${site.people[0].slug}`) ?? '';
  assert.equal(unescapeHtml(/<aside class="side" id="book" aria-label="([^"]*)">/.exec(profile)?.[1] ?? ''), `Book ${site.people[0].name}`);
});

test('Event Spaces appears once on every branded page and never becomes a bookable profile', async () => {
  const spurs = sites.find(site => site.slug === 'spurs') as Site;
  for (const path of sitePaths(spurs)) {
    const { status, html } = await renderPage(path, [spurs]);
    assert.equal(status, 200, path);
    assert.equal((html.match(/class="event-spaces"/g) ?? []).length, 1, path);
    assert.match(html, /id="event-spaces-heading"/);
    assert.ok(html.indexOf('class="event-spaces"') < html.indexOf('</main>'), path);
    const resolved = resolvePage([spurs], path);
    if (resolved && 'demo' in resolved && !resolved.demo) {
      const link = html.match(/<a[^>]*data-event-spaces="true"[^>]*>/)?.[0] ?? '';
      assert.match(link, /href="https:\/\/www.tottenhamhotspurstadium.com\/venue-hire\/"/);
      assert.match(link, /target="_blank"/);
      assert.match(link, /rel="noopener"/);
      assert.match(link, /data-brand="spurs"/);
    }
  }
  const { html: homepage } = await renderPage('/spurs', [spurs]);
  const speakers = homepage.indexOf('id="legends"');
  const eventSpaces = homepage.indexOf('class="event-spaces"');
  const firstTeam = homepage.indexOf('id="squad"');
  assert.ok(speakers < eventSpaces && eventSpaces < firstTeam, 'Event Spaces sits between speakers and first team');
  for (const homeLayout of [{ waysAfterRoles: false }, { waysAfterRoles: true }]) {
    const { html } = await renderPage('/spurs', [{ ...spurs, homeLayout }]);
    assert.ok(html.indexOf('id="legends"') < html.indexOf('class="event-spaces"'));
    assert.ok(html.indexOf('class="event-spaces"') < html.indexOf('id="squad"'));
  }
  assert.ok(!sitePaths(spurs).some(path => path.includes('event-spaces')));
  for (const config of [undefined, {}, { ...spurs.eventSpaces, url: '' }]) {
    const hidden = { ...spurs, eventSpaces: config };
    const { html } = await renderPage('/spurs/about', [hidden]);
    assert.doesNotMatch(html, /class="event-spaces"|event-spaces-heading|data-event-spaces/);
  }
  const eastvale = sites.find(site => site.slug === 'eastvale') as Site;
  const { html } = await renderPage('/eastvale/about', [
    { ...eastvale, eventSpaces: { ...spurs.eventSpaces, image: eastvale.home.hospitalityImage as string } },
  ]);
  assert.match(html, /data-brand="eastvale"/);
  assert.match(html, /class="site-eastvale"/);
});
