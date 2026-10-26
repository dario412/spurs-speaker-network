// The local admin (src/admin): security gates, save semantics, preview and storage adapters.
// Every test runs against its own temp copy of src/sites/ plus the fictional test sites (test/fixtures/sites.mjs), so
// the real content is never touched and there is always more than one site.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateAll } from '../scripts/validate-content.mjs';
import { createAdmin } from '../src/admin/app.mjs';
import { PAGE_KEYS } from '../src/admin/schema.mjs';
import { branchName, githubStorage } from '../src/admin/storage/github.mjs';
import { loadSite } from '../src/sites/index.mjs';
import { buildPack, packFiles, readPack } from '../src/sites/packs.mjs';
import { shellSite } from '../src/sites/scaffold.mjs';
import { formatJson } from '../src/sites/store.mjs';
import { personFingerprint, verificationStatus } from '../src/sites/verification.mjs';
import { writeSitesDir } from './fixtures/sites.mjs';

async function start({ password, storage } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'appearances-admin-'));
  writeSitesDir({ dir });
  // A private public/ with Spurs' og cards, so packs can include and import cards without touching the repo.
  const publicDir = `${dir}-public`;
  await mkdir(join(publicDir, 'og'), { recursive: true });
  for (const name of await readdir(new URL('../public/og/', import.meta.url)))
    if (name.startsWith('spurs')) await cp(new URL(`../public/og/${name}`, import.meta.url), join(publicDir, 'og', name));
  const server = createAdmin({ dir, publicDir, password, storage });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = password ? { Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` } : {};
  const get = path => fetch(base + path, { headers: auth, redirect: 'manual' });
  const csrf = async () => (await (await get('/')).text()).match(/name="_csrf" value="([^"]+)"/)[1];
  const post = async (path, fields, headers = { Origin: base }) =>
    fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...auth, ...headers },
      body: new URLSearchParams(fields),
    });
  const file = path => readFile(join(dir, path), 'utf8');
  /** A multipart upload, the way the browser sends the "Upload a site pack" form. */
  const upload = async (data, fields = {}, headers = { Origin: base }) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append('pack', new Blob([data]), 'pack.site-pack.zip');
    return fetch(`${base}/packs`, { method: 'POST', redirect: 'manual', headers: { ...auth, ...headers }, body: form });
  };
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    await rm(publicDir, { recursive: true, force: true });
  };
  return { dir, publicDir, base, get, post, upload, csrf, file, close };
}

const decodeHtml = s =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const attrOf = (attrs, name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Serialises the form posting to `action` the way a browser would (our markup only, so regexes are enough). */
function formData(html, action) {
  const start = html.indexOf(`action="${action}"`);
  assert.ok(start !== -1, `no form for ${action}`);
  const form = html.slice(start, html.indexOf('</form>', start));
  const data = new URLSearchParams();
  for (const [, attrs] of form.matchAll(/<input\b([^>]*)>/g)) {
    const name = attrOf(attrs, 'name');
    if (!name || (attrOf(attrs, 'type') === 'checkbox' && !/\schecked\b/.test(attrs))) continue;
    data.append(decodeHtml(name), decodeHtml(attrOf(attrs, 'value') ?? ''));
  }
  for (const [, attrs, body] of form.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g))
    data.append(attrOf(attrs, 'name'), decodeHtml(body));
  for (const [, attrs, body] of form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const chosen = body.match(/<option value="([^"]*)" selected>/) ?? body.match(/<option value="([^"]*)"/);
    data.append(attrOf(attrs, 'name'), decodeHtml(chosen?.[1] ?? ''));
  }
  return data;
}

/** Follows a POST/redirect/GET redirect (Location is relative) and returns the page with its flash message. */
const followFlash = async (admin, response) => (await admin.get(response.headers.get('location'))).text();

test('optional page keys match the app’s PAGE_DEFAULTS', async () => {
  const { PAGE_DEFAULTS } = await import('../lib/content/publish.ts');
  assert.deepEqual([...PAGE_KEYS].sort(), Object.keys(PAGE_DEFAULTS).sort());
});

test('a password, when set, is required on every route', async () => {
  const admin = await start({ password: 'correct horse' });
  try {
    for (const path of ['/', '/sites/spurs', '/preview/spurs', '/assets/admin.css']) {
      const response = await fetch(admin.base + path);
      assert.equal(response.status, 401, path);
      assert.match(response.headers.get('www-authenticate'), /^Basic /);
    }
    const wrong = await fetch(`${admin.base}/`, { headers: { Authorization: `Basic ${Buffer.from('a:nope').toString('base64')}` } });
    assert.equal(wrong.status, 401);
    const right = await admin.get('/');
    assert.equal(right.status, 200);
    assert.doesNotMatch(await right.text(), /correct horse/);
  } finally {
    await admin.close();
  }
});

test('without a password, only loopback Host headers are served (DNS rebinding)', async () => {
  const admin = await start();
  try {
    const status = await new Promise((resolve, reject) => {
      const { port } = new URL(admin.base);
      httpRequest({ host: '127.0.0.1', port, path: '/', headers: { Host: 'attacker.example:80' } }, res => resolve(res.statusCode))
        .on('error', reject)
        .end();
    });
    assert.equal(status, 403);
    assert.equal((await admin.get('/')).status, 200);
  } finally {
    await admin.close();
  }
});

test('state changes need a same-origin POST with the CSRF token', async () => {
  const admin = await start();
  try {
    const before = await admin.file('northbridge/site.json');
    const token = await admin.csrf();
    assert.equal((await admin.post('/sites/northbridge/active', { active: 'off' })).status, 403, 'no token');
    assert.equal((await admin.post('/sites/northbridge/active', { active: 'off', _csrf: 'forged' })).status, 403, 'wrong token');
    assert.equal(
      (await admin.post('/sites/northbridge/active', { active: 'off', _csrf: token }, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal((await admin.post('/sites/northbridge/active', { active: 'off', _csrf: token }, {})).status, 403, 'no Origin');
    assert.equal(
      (await admin.post('/sites/northbridge/active', { active: 'off', _csrf: token }, { 'Sec-Fetch-Site': 'cross-site' })).status,
      403,
    );
    assert.equal(
      (await admin.post('/sites/northbridge/active', { active: 'off', _csrf: token }, { Origin: 'null' })).status,
      403,
      'opaque Origin',
    );
    assert.equal(await admin.file('northbridge/site.json'), before);
    assert.equal((await fetch(`${admin.base}/sites/northbridge/active`, { method: 'GET' })).status, 405, 'GET never changes state');
    // Chrome sends `Origin: null` on form posts under some referrer policies; Sec-Fetch-Site still proves same-origin.
    const opaque = await admin.post(
      '/sites/northbridge/active',
      { active: 'on', _csrf: token },
      { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
    );
    assert.equal(opaque.status, 303);
    assert.equal((await admin.get('/')).headers.get('referrer-policy'), 'same-origin');
    const ok = await admin.post('/sites/northbridge/active', { active: 'off', _csrf: token }, { 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(ok.status, 303);
  } finally {
    await admin.close();
  }
});

test('deactivating a site writes active: false in canonical JSON and flashes the next steps', async () => {
  const admin = await start();
  try {
    const response = await admin.post('/sites/northbridge/active', { active: 'off', _csrf: await admin.csrf() });
    assert.equal(response.status, 303);
    const text = await admin.file('northbridge/site.json');
    const site = JSON.parse(text);
    assert.equal(site.active, false);
    assert.deepEqual(Object.keys(site).slice(0, 2), ['slug', 'active']);
    assert.equal(text, formatJson(site));
    assert.match(await followFlash(admin, response), /Saved northbridge\/site\.json\. Run npm run check, commit and open a PR/);
    const dashboard = await (await admin.get('/')).text();
    assert.match(dashboard, /Northbridge City FC<\/b><\/a>.*?Inactive/s);

    await admin.post('/sites/northbridge/active', { active: 'on', _csrf: await admin.csrf() });
    assert.equal(JSON.parse(await admin.file('northbridge/site.json')).active, undefined);
  } finally {
    await admin.close();
  }
});

test('the root site cannot be deactivated, and nothing is written', async () => {
  const admin = await start();
  try {
    assert.equal((await admin.post('/sites/spurs/root', { _csrf: await admin.csrf() })).status, 303);
    const before = await admin.file('spurs/site.json');
    const response = await admin.post('/sites/spurs/active', { active: 'off', _csrf: await admin.csrf() });
    assert.equal(response.status, 422);
    assert.match(await response.text(), /rootSite &quot;spurs&quot; is inactive, so \/ would 404/);
    assert.equal(await admin.file('spurs/site.json'), before);
  } finally {
    await admin.close();
  }
});

test('saving any editor unchanged writes nothing (forms round-trip the stored JSON exactly)', async () => {
  const admin = await start();
  try {
    const { sites } = await validateAll(pathToFileURL(`${admin.dir}/`));
    for (const site of sites) {
      const html = await (await admin.get(`/sites/${site.slug}`)).text();
      const response = await admin.post(`/sites/${site.slug}`, formData(html, `/sites/${site.slug}`));
      assert.equal(response.status, 303, `${site.slug}: ${response.status === 422 ? await response.text() : ''}`);
      assert.match(await followFlash(admin, response), /No changes to save/, site.slug);
      const editors = [
        ...site.people.slice(0, 3).map(person => `/sites/${site.slug}/people/${person.slug}`),
        ...['site', 'people', 'images', 'licences', 'verification'].map(file => `/sites/${site.slug}/raw/${file}`),
        `/sites/${site.slug}/licences`,
        `/sites/${site.slug}/verification/pages/home`,
        `/sites/${site.slug}/verification/people/${site.people.find(person => person.active !== false).slug}`,
      ];
      for (const action of editors) {
        const page = await (await admin.get(action)).text();
        const saved = await admin.post(action, formData(page, action));
        assert.equal(saved.status, 303, `${action}`);
        assert.match(await followFlash(admin, saved), /No changes to save/, action);
      }
    }
  } finally {
    await admin.close();
  }
});

test('an invalid edit re-renders with the error and the input, leaving files byte-identical', async () => {
  const admin = await start();
  try {
    const files = ['site', 'people', 'images'].map(name => `spurs/${name}.json`);
    const before = await Promise.all(files.map(admin.file));
    const form = formData(await (await admin.get('/sites/spurs')).text(), '/sites/spurs');
    form.set('theme.brand', 'navy');
    form.set('tagline', 'Edited tagline that must not be saved');
    const response = await admin.post('/sites/spurs', form);
    assert.equal(response.status, 422);
    const html = await response.text();
    assert.match(html, /Nothing was saved/);
    assert.match(html, /spurs: theme\.brand must be a #rrggbb colour/);
    assert.match(html, /value="navy"/);
    assert.match(html, /Edited tagline that must not be saved/);
    assert.deepEqual(await Promise.all(files.map(admin.file)), before);

    form.set('theme.brand', '#000a3c');
    form.set('vocab.whoOptions', '[not json');
    const bad = await admin.post('/sites/spurs', form);
    assert.equal(bad.status, 422);
    assert.match(await bad.text(), /vocab\.whoOptions is not valid JSON/);
    assert.deepEqual(await Promise.all(files.map(admin.file)), before);
  } finally {
    await admin.close();
  }
});

test('a new site is created from the shell, inactive, and added to the registry', async () => {
  const admin = await start();
  try {
    const token = await admin.csrf();
    const fields = {
      _csrf: token,
      slug: 'test-club',
      name: 'Test <Club>',
      short: 'Test',
      brand: '#123456',
      ink: '#111111',
      dark: '#222222',
      bar: '#333333',
    };
    const response = await admin.post('/sites', fields);
    assert.equal(response.status, 303);
    assert.match(response.headers.get('location'), /^\/sites\/test-club\?flash=/);
    const site = JSON.parse(await admin.file('test-club/site.json'));
    assert.equal(site.active, false);
    assert.equal(site.status, 'shell');
    assert.equal(site.theme.brand, '#123456');
    assert.equal(JSON.parse(await admin.file('test-club/people.json')).length, 6);
    const registry = JSON.parse(await admin.file('registry.json'));
    assert.equal(registry.order.at(-1), 'test-club');
    assert.equal('rootSite' in registry, false, 'the landing page stays the root');
    assert.deepEqual((await validateAll(pathToFileURL(`${admin.dir}/`))).problems, []);
    const dashboard = await (await admin.get('/')).text();
    assert.match(dashboard, /Test &lt;Club&gt;/, 'names are escaped');
    assert.doesNotMatch(dashboard, /Test <Club>/);

    const again = await admin.post('/sites', fields);
    assert.equal(again.status, 422);
    assert.match(await again.text(), /already in the registry/);
  } finally {
    await admin.close();
  }
});

test('people can be hidden; featured people cannot, and cannot be deleted', async () => {
  const admin = await start();
  try {
    const { sites } = await validateAll(pathToFileURL(`${admin.dir}/`));
    const spurs = sites.find(site => site.slug === 'spurs');
    const linked = new Set([...spurs.featured, ...(spurs.demoProfiles ?? [])]);
    const plain = spurs.people.find(person => !linked.has(person.slug));
    const token = await admin.csrf();

    assert.equal((await admin.post(`/sites/spurs/people/${plain.slug}/active`, { active: 'off', _csrf: token })).status, 303);
    const people = JSON.parse(await admin.file('spurs/people.json'));
    assert.equal(people.find(person => person.slug === plain.slug).active, false);
    const list = await (await admin.get('/sites/spurs/people')).text();
    assert.match(list, new RegExp(`${plain.slug}</small></td>[\\s\\S]*?Hidden`));

    const before = await admin.file('spurs/people.json');
    const featured = spurs.featured[0];
    const hide = await admin.post(`/sites/spurs/people/${featured}/active`, { active: 'off', _csrf: token });
    assert.equal(hide.status, 422);
    assert.match(await hide.text(), /is hidden; unfeature them first/);
    const confirm = await (await admin.get(`/sites/spurs/people/${featured}/delete`)).text();
    assert.match(confirm, /featured on the homepage/);
    assert.equal((await admin.post(`/sites/spurs/people/${featured}/delete`, { confirm: 'yes', _csrf: token })).status, 409);
    assert.equal(await admin.file('spurs/people.json'), before);

    assert.equal((await admin.post(`/sites/spurs/people/${plain.slug}/delete`, { confirm: 'yes', _csrf: token })).status, 303);
    assert.ok(!JSON.parse(await admin.file('spurs/people.json')).some(person => person.slug === plain.slug));
  } finally {
    await admin.close();
  }
});

test('adding a person opens the editor with the validator’s list, then saves once complete', async () => {
  const admin = await start();
  try {
    const token = await admin.csrf();
    const before = await admin.file('spurs/people.json');
    const opened = await admin.post('/sites/spurs/people', { _form: 'add', slug: 'new-person', name: 'New Person', _csrf: token });
    assert.equal(opened.status, 200);
    const html = await opened.text();
    assert.match(html, /people\[\d+\] \(new-person\)\.bio needs at least one paragraph/);
    assert.equal(await admin.file('spurs/people.json'), before);

    const form = formData(html, '/sites/spurs/people');
    const image = '2206513784';
    for (const [key, value] of Object.entries({
      pos: 'Pos',
      short: 'Short',
      honour: 'Honour',
      line: 'Line',
      why: 'Why',
      roleLabel: 'Ex-player',
    }))
      form.set(key, value);
    form.set('bio', 'One paragraph.');
    form.set('talks', 'Leadership');
    form.set('audiences', 'Conferences');
    form.set('industries', 'All');
    form.set('stats', 'a | b\nc | d\ne | f\ng | h');
    form.set('timeline', '2020 | Joined');
    form.append('formats', 'keynote');
    for (const key of ['hero', 'card', 'gallery.0', 'gallery.1', 'gallery.2']) form.set(key, image);
    const saved = await admin.post('/sites/spurs/people', form);
    assert.equal(saved.status, 303, saved.status === 422 ? await saved.text() : '');
    const person = JSON.parse(await admin.file('spurs/people.json')).at(-1);
    assert.equal(person.slug, 'new-person');
    assert.deepEqual(person.stats[0], ['a', 'b']);
  } finally {
    await admin.close();
  }
});

test('slugs and keys outside the pattern never reach a path', async () => {
  const admin = await start();
  try {
    for (const path of [
      '/sites/..%2f..%2fetc/raw/site',
      '/sites/spurs/raw/..%2fregistry',
      '/sites/spurs/people/..%2f..%2fpackage',
      '/sites/Spurs',
    ]) {
      assert.equal((await admin.get(path)).status, 404, path);
    }
    assert.equal((await admin.get('/preview/..%2f..%2fpackage.json')).status, 404);
    const response = await admin.post('/sites', { _csrf: await admin.csrf(), slug: '../evil', name: 'Evil' });
    assert.equal(response.status, 422);
    assert.match(await response.text(), /Slug must be lowercase/);
    await assert.rejects(stat(join(admin.dir, '..', 'evil')));
    assert.equal(
      (await admin.post('/sites/spurs/people', { _csrf: await admin.csrf(), _form: 'add', slug: 'a/../b', name: 'X' })).status,
      422,
    );
  } finally {
    await admin.close();
  }
});

test('preview renders stored content, including inactive sites, under /preview/', async () => {
  const admin = await start();
  try {
    await admin.post('/sites/northbridge/active', { active: 'off', _csrf: await admin.csrf() });
    const response = await admin.get('/preview/northbridge');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /img-src 'self' https:\/\/media\.gettyimages\.com/);
    const html = await response.text();
    assert.match(html, /<body class="site-northbridge/);
    assert.doesNotMatch(html, /__ORIGIN__/);
    assert.doesNotMatch(html, /\s(?:href|src|action)="\/(?!preview\/|\/)/, 'every root-relative URL is under /preview/');
    assert.match(html, /href="\/preview\/northbridge\/site\.css\?v=[a-f0-9]+"/);
    assert.equal((await admin.get('/preview/northbridge/site.css')).status, 200);
    assert.match(await (await admin.get('/preview/styles.css')).text(), /url\(\/preview\/fonts\//);
    assert.equal((await admin.get('/preview/fonts/outfit-latin.woff2')).status, 200);
    assert.doesNotMatch(await (await admin.get('/preview/')).text(), /href="\/preview\/northbridge"/, 'landing lists published sites only');
    assert.equal((await admin.get('/preview/northbridge/no-such-page')).status, 404);
    assert.equal((await admin.post('/preview/northbridge', { _csrf: await admin.csrf() })).status, 405);
  } finally {
    await admin.close();
  }
});

test('make root: a site, or the landing page (no root site); the dashboard and the preview of / follow', async () => {
  const admin = await start();
  try {
    const landingRow = html => /<tr class="landing-row">[\s\S]*?<\/tr>/.exec(html)?.[0] ?? '';
    const spursRow = html => /<tr>\s*<td data-label="Site"><a href="\/sites\/spurs">[\s\S]*?<\/tr>/.exec(html)?.[0] ?? '';
    // The live content: no root site, so the landing page is the root.
    let dashboard = await (await admin.get('/')).text();
    assert.match(landingRow(dashboard), /Landing page \(no root site\)/);
    assert.match(landingRow(dashboard), /badge accent">Root</);
    assert.doesNotMatch(landingRow(dashboard), /action="\/root\/landing"/, 'no Make root on the active choice');
    assert.doesNotMatch(spursRow(dashboard), />Root</);
    assert.match(spursRow(dashboard), /action="\/sites\/spurs\/root"/);
    assert.match(dashboard, /Root: \/ serves the landing page \(no root site\)/);
    const landing = await admin.get('/preview/');
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /<body class="landing"[\s\S]*href="\/preview\/spurs"/, 'the preview of / is the landing page');
    assert.equal((await admin.get('/preview/all')).headers.get('location'), '/preview/', '/all moves to / as in the app');
    // A site as the root: / redirects there, the landing page is at /all.
    assert.equal((await admin.post('/sites/spurs/root', { _csrf: await admin.csrf() })).status, 303);
    assert.equal(JSON.parse(await admin.file('registry.json')).rootSite, 'spurs');
    dashboard = await (await admin.get('/')).text();
    assert.match(spursRow(dashboard), /badge accent">Root</);
    assert.match(landingRow(dashboard), /badge muted">Not root</);
    assert.match(landingRow(dashboard), /action="\/root\/landing"[\s\S]*>Make root</);
    assert.match(dashboard, /Root: \/ redirects to the root site, \/spurs/);
    assert.equal((await admin.get('/preview/')).headers.get('location'), '/preview/spurs');
    assert.match(await (await admin.get('/preview/all')).text(), /<body class="landing"/);
    // Back to the landing page: rootSite is removed, not emptied, and the content still validates.
    assert.equal((await admin.post('/root/landing', { _csrf: await admin.csrf() })).status, 303);
    const registry = await admin.file('registry.json');
    assert.equal('rootSite' in JSON.parse(registry), false);
    assert.equal(registry, formatJson(JSON.parse(registry)), 'canonical JSON');
    assert.deepEqual((await validateAll(pathToFileURL(`${admin.dir}/`))).problems, []);
    assert.equal((await admin.post('/root/landing', {})).status, 403, 'the CSRF check applies');
  } finally {
    await admin.close();
  }
});

test('oversized and non-form bodies are refused', async () => {
  const admin = await start();
  try {
    const big = await admin.post('/sites/spurs', { _csrf: await admin.csrf(), tagline: 'x'.repeat(1024 * 1024 + 1) });
    assert.equal(big.status, 413);
    const json = await fetch(`${admin.base}/sites/spurs`, {
      method: 'POST',
      headers: { Origin: admin.base, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(json.status, 415);
  } finally {
    await admin.close();
  }
});

/** A fake GitHub API that records calls and answers like the real git data endpoints. */
function fakeGitHub({ fail } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
    const call = {
      method: init.method,
      path: pathname.replace('/repos/peptalk/appearances', ''),
      headers: init.headers,
      body: init.body && JSON.parse(init.body),
    };
    calls.push(call);
    if (fail?.(call)) return new Response(JSON.stringify({ message: fail(call) }), { status: 401 });
    const sha = `sha${++n}`;
    const body = call.path.startsWith('/git/ref/heads/')
      ? { object: { sha: 'base-sha' } }
      : call.path.startsWith('/git/commits/')
        ? { tree: { sha: 'base-tree' } }
        : call.path === '/pulls'
          ? { html_url: 'https://github.com/peptalk/appearances/pull/7', number: 7 }
          : { sha };
    return new Response(JSON.stringify(body), { status: 201 });
  };
  return { calls, fetchImpl };
}

test('github storage commits through the git data API and opens one PR', async () => {
  const { calls, fetchImpl } = fakeGitHub();
  const now = () => new Date('2026-10-19T18:05:09Z');
  const storage = githubStorage({ token: 'ghp_secret', repo: 'peptalk/appearances', fetch: fetchImpl, now });
  assert.equal(branchName(now()), 'content/admin-20261019-180509');

  const first = await storage.save({ 'src/sites/spurs/site.json': '{}\n', 'src/sites/registry.json': '[]\n' }, 'content: first');
  assert.deepEqual(
    calls.map(c => `${c.method} ${c.path}`),
    [
      'GET /git/ref/heads/main',
      'GET /git/commits/base-sha',
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'POST /git/refs',
      'POST /pulls',
    ],
  );
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer ghp_secret');
    assert.equal(call.headers['X-GitHub-Api-Version'], '2022-11-28');
  }
  assert.equal(calls[4].body.base_tree, 'base-tree');
  assert.deepEqual(calls[5].body.parents, ['base-sha']);
  assert.equal(calls[6].body.ref, 'refs/heads/content/admin-20261019-180509');
  assert.deepEqual(calls[7].body, { ...calls[7].body, head: 'content/admin-20261019-180509', base: 'main' });
  assert.equal(first.link.href, 'https://github.com/peptalk/appearances/pull/7');
  assert.equal(storage.read('src/sites/spurs/site.json'), '{}\n');

  calls.length = 0;
  await storage.save({ 'src/sites/spurs/site.json': '{"a":1}\n' }, 'content: second');
  assert.deepEqual(
    calls.map(c => `${c.method} ${c.path}`),
    [
      'GET /git/commits/sha6',
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'PATCH /git/refs/heads/content/admin-20261019-180509',
    ],
  );
  assert.match(storage.describe().link.label, /PR #7/);
});

test('github storage errors are clear and never include the token', async () => {
  const token = 'ghp_supersecret';
  const { fetchImpl } = fakeGitHub({ fail: call => (call.path === '/git/blobs' ? `Bad credentials for ${token}` : null) });
  const storage = githubStorage({ token, repo: 'peptalk/appearances', fetch: fetchImpl });
  await assert.rejects(storage.save({ 'src/sites/a.json': '{}' }, 'm'), error => {
    assert.match(error.message, /GitHub POST \/git\/blobs failed with 401/);
    assert.doesNotMatch(error.message, /ghp_supersecret/);
    return true;
  });
  assert.equal(storage.read('src/sites/a.json'), undefined, 'a failed save leaves no overlay');

  const offline = githubStorage({
    token,
    repo: 'peptalk/appearances',
    fetch: async () => Promise.reject(new Error(`connect failed ${token}`)),
  });
  await assert.rejects(offline.save({ 'src/sites/a.json': '{}' }, 'm'), error => !error.message.includes(token));
  assert.throws(() => githubStorage({ token, repo: 'not a repo' }), /owner\/name/);
});

test('in github mode the admin shows the PR link and reads its own saves back', async () => {
  const { fetchImpl } = fakeGitHub();
  const storage = githubStorage({ token: 'ghp_secret', repo: 'peptalk/appearances', fetch: fetchImpl });
  const admin = await start({ storage });
  try {
    const before = await admin.file('northbridge/site.json');
    const response = await admin.post('/sites/northbridge/active', { active: 'off', _csrf: await admin.csrf() });
    assert.equal(response.status, 303);
    const page = await followFlash(admin, response);
    assert.match(page, /href="https:\/\/github\.com\/peptalk\/appearances\/pull\/7"/);
    assert.doesNotMatch(page, /ghp_secret/);
    assert.equal(await admin.file('northbridge/site.json'), before, 'the checkout is untouched');
    assert.match(await (await admin.get('/')).text(), /Northbridge City FC<\/b><\/a>.*?Inactive/s, 'the overlay is what the admin shows');
  } finally {
    await admin.close();
  }
});

const licencesOf = async admin => JSON.parse(await admin.file('spurs/licences.json'));

test('ticking an asset writes canonical licences.json with the approved URL; unticking removes it', async () => {
  const admin = await start();
  try {
    await assert.rejects(stat(join(admin.dir, 'spurs', 'licences.json')), 'no file until something is approved');
    const images = JSON.parse(await admin.file('spurs/images.json'));
    const [id, url] = Object.entries(images)[0];
    const form = formData(await (await admin.get('/sites/spurs/licences')).text(), '/sites/spurs/licences');
    form.append('approve', `image:${id}`);
    form.set(`note.image:${id}`, 'Getty licence #123');
    form.append('approve', 'mark:crest');
    const saved = await admin.post('/sites/spurs/licences', form);
    assert.equal(saved.status, 303);
    const text = await admin.file('spurs/licences.json');
    const licences = JSON.parse(text);
    assert.equal(text, formatJson(licences));
    assert.deepEqual(Object.keys(licences), ['images', 'marks']);
    assert.equal(licences.images[id].url, url);
    assert.equal(licences.images[id].note, 'Getty licence #123');
    assert.match(licences.images[id].approvedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(licences.marks.crest.url, JSON.parse(await admin.file('spurs/site.json')).marks.crest);

    const page = await followFlash(admin, saved);
    assert.match(page, new RegExp(`value="image:${id}" data-row-check checked`));
    const again = formData(page, '/sites/spurs/licences');
    again.delete('approve');
    again.append('approve', 'mark:crest');
    assert.equal((await admin.post('/sites/spurs/licences', again)).status, 303);
    assert.deepEqual(Object.keys((await licencesOf(admin)).images), [], 'unticking removes the entry');
    assert.deepEqual(Object.keys((await licencesOf(admin)).marks), ['crest']);
  } finally {
    await admin.close();
  }
});

test('the unapproved filter and "Approve all shown" never touch rows that are not on screen', async () => {
  const admin = await start();
  try {
    const images = Object.keys(JSON.parse(await admin.file('spurs/images.json')));
    const all = formData(await (await admin.get('/sites/spurs/licences')).text(), '/sites/spurs/licences');
    all.append('approve', `image:${images[0]}`);
    await admin.post('/sites/spurs/licences', all);

    const filtered = await (await admin.get('/sites/spurs/licences?show=unapproved')).text();
    assert.doesNotMatch(filtered, new RegExp(`name="row" value="image:${images[0]}"`), 'licensed rows are hidden');
    const form = formData(filtered, '/sites/spurs/licences?show=unapproved');
    form.set('all', 'on');
    const saved = await admin.post('/sites/spurs/licences?show=unapproved', form);
    assert.equal(saved.status, 303);
    assert.match(saved.headers.get('location'), /^\/sites\/spurs\/licences\?show=unapproved&flash=/);
    const licences = await licencesOf(admin);
    assert.equal(Object.keys(licences.images).length, images.length);
    assert.ok(licences.images[images[0]], 'the hidden approval survived');
    const page = await followFlash(admin, saved);
    assert.match(page, /Everything on this site is licensed/);
    assert.doesNotMatch(await (await admin.get('/sites/spurs')).text(), /are not licensed yet/, 'banner gone once all approved');
  } finally {
    await admin.close();
  }
});

test('changing an approved image URL makes the approval stale, everywhere it is shown', async () => {
  const admin = await start();
  try {
    const site = JSON.parse(await admin.file('spurs/people.json')).find(person => person.slug === 'sandro');
    const form = formData(await (await admin.get('/sites/spurs/licences')).text(), '/sites/spurs/licences');
    form.append('approve', `image:${site.hero}`);
    await admin.post('/sites/spurs/licences', form);
    assert.match(
      await (await admin.get('/sites/spurs/people/sandro')).text(),
      /image-pair"><img[^>]*>[^<]*<span class="badge ok">Licensed/,
    );

    const images = JSON.parse(await admin.file('spurs/images.json'));
    images[site.hero] = `${images[site.hero]}&v=2`;
    const raw = await admin.post('/sites/spurs/raw/images', { _csrf: await admin.csrf(), json: JSON.stringify(images) });
    assert.equal(raw.status, 303);
    assert.match(await (await admin.get('/sites/spurs/people/sandro')).text(), /Changed since approval/);
    const tab = await (await admin.get('/sites/spurs/licences?show=unapproved')).text();
    const row = tab.slice(tab.indexOf(`<b>${site.hero}</b>`), tab.indexOf(`name="row" value="image:${site.hero}"`));
    assert.match(row, /Changed since approval/);
    assert.match(await (await admin.get('/sites/spurs')).text(), /\(1 changed since approval\)/);
    assert.ok((await licencesOf(admin)).images[site.hero], 'a stale approval is kept until someone acts on it');
  } finally {
    await admin.close();
  }
});

test('activating a site with unlicensed assets succeeds with a warning, and the dashboard flags it', async () => {
  const admin = await start();
  try {
    await admin.post('/sites/northbridge/active', { active: 'off', _csrf: await admin.csrf() });
    const response = await admin.post('/sites/northbridge/active', { active: 'on', _csrf: await admin.csrf() });
    assert.equal(response.status, 303);
    assert.equal(JSON.parse(await admin.file('northbridge/site.json')).active, undefined, 'it is live');
    const page = await followFlash(admin, response);
    assert.match(page, /class="alert warn" role="status">Published with \d+ unlicensed assets and \d+ unverified pages or profiles\./);
    assert.match(page, /href="\/sites\/northbridge\/verification\?show=incomplete"[^>]*>Review checklists/);
    assert.match(page, /href="\/sites\/northbridge\/licences\?show=unapproved"/);
    assert.match(
      page,
      /<td data-label="Licences"><a href="\/sites\/northbridge\/licences\?show=unapproved">0\/\d+<\/a> <span class="badge warn">\d+ unlicensed/,
    );
    assert.match(await (await admin.get('/sites/northbridge/people')).text(), /are not licensed yet/, 'banner on site pages');
  } finally {
    await admin.close();
  }
});

test('removing an image drops its approval instead of failing validation', async () => {
  const admin = await start();
  try {
    const images = JSON.parse(await admin.file('spurs/images.json'));
    // Add a spare image so removing it cannot break any reference.
    const spare = '999000111';
    images[spare] = 'https://media.gettyimages.com/id/999000111/photo/spare.jpg';
    assert.equal((await admin.post('/sites/spurs/raw/images', { _csrf: await admin.csrf(), json: JSON.stringify(images) })).status, 303);
    const form = formData(await (await admin.get('/sites/spurs/licences')).text(), '/sites/spurs/licences');
    form.append('approve', `image:${spare}`);
    await admin.post('/sites/spurs/licences', form);
    delete images[spare];
    const saved = await admin.post('/sites/spurs/raw/images', { _csrf: await admin.csrf(), json: JSON.stringify(images) });
    assert.equal(saved.status, 303, saved.status === 422 ? await saved.text() : '');
    assert.equal((await licencesOf(admin)).images[spare], undefined);
  } finally {
    await admin.close();
  }
});

const checklist = '/sites/spurs/verification/people/sandro';
const storedSpurs = admin => loadSite('spurs', pathToFileURL(`${admin.dir}/`));

test('ticking checklist items writes canonical verification.json stamped with the content fingerprint', async () => {
  const admin = await start();
  try {
    await assert.rejects(stat(join(admin.dir, 'spurs', 'verification.json')), 'no file until something is checked');
    const form = formData(await (await admin.get(checklist)).text(), checklist);
    form.append('item', 'photos');
    form.append('item', 'facts');
    form.set('note.facts', 'Checked against the club archive');
    const saved = await admin.post(checklist, form);
    assert.equal(saved.status, 303);
    assert.match(saved.headers.get('location'), /^\/sites\/spurs\/verification\/people\/sandro\?flash=/);
    const text = await admin.file('spurs/verification.json');
    const verification = JSON.parse(text);
    assert.equal(text, formatJson(verification));
    assert.deepEqual(Object.keys(verification), ['pages', 'people']);
    const record = verification.people.sandro;
    assert.deepEqual(Object.keys(record.items), ['photos', 'facts']);
    assert.match(record.items.photos.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(record.items.facts.note, 'Checked against the club archive');
    const site = storedSpurs(admin);
    assert.equal(
      record.fingerprint,
      personFingerprint(
        site,
        site.people.find(person => person.slug === 'sandro'),
      ),
    );
    assert.match(await followFlash(admin, saved), /In progress/);

    const all = formData(
      await (await admin.get('/sites/spurs/verification/pages/ways-to-book')).text(),
      '/sites/spurs/verification/pages/ways-to-book',
    );
    all.set('all', 'on');
    await admin.post('/sites/spurs/verification/pages/ways-to-book', all);
    assert.deepEqual(Object.keys(JSON.parse(await admin.file('spurs/verification.json')).pages.waysToBook.items), [
      'copy',
      'links',
      'mobile',
    ]);
    assert.equal(verificationStatus(storedSpurs(admin)).verified, 1);
  } finally {
    await admin.close();
  }
});

test('editing a person makes their checklist stale until it is re-confirmed', async () => {
  const admin = await start();
  try {
    const form = formData(await (await admin.get(checklist)).text(), checklist);
    form.set('all', 'on');
    await admin.post(checklist, form);
    assert.match(await (await admin.get('/sites/spurs/people')).text(), /people\/sandro"><span class="badge ok">Verified/);

    const editor = formData(await (await admin.get('/sites/spurs/people/sandro')).text(), '/sites/spurs/people/sandro');
    editor.set('honour', 'Brazil international, Copa América winner');
    assert.equal((await admin.post('/sites/spurs/people/sandro', editor)).status, 303);
    const page = await (await admin.get(checklist)).text();
    assert.match(page, /Changed since verification/);
    assert.match(page, /value="photos" checked/, 'ticks stay visible');
    assert.match(page, /Re-confirm and save/);
    assert.match(await (await admin.get('/sites/spurs/people')).text(), /people\/sandro"><span class="badge error">Changed/);
    assert.match(await (await admin.get('/sites/spurs/people/sandro')).text(), /Checklist 7\/7 <span class="badge error">Changed/);
    assert.equal(verificationStatus(storedSpurs(admin)).stale, 1);

    assert.equal((await admin.post(checklist, formData(page, checklist))).status, 303, 're-confirm is one click');
    const status = verificationStatus(storedSpurs(admin));
    assert.equal(status.stale, 0);
    assert.equal(status.entries['people:sandro'].state, 'verified');
  } finally {
    await admin.close();
  }
});

test('switched-off pages and hidden people do not count and have no checklist', async () => {
  const admin = await start();
  try {
    const before = verificationStatus(storedSpurs(admin)).total;
    const settings = formData(await (await admin.get('/sites/spurs')).text(), '/sites/spurs');
    settings.delete('pages.hospitality');
    assert.equal((await admin.post('/sites/spurs', settings)).status, 303);
    const { sites } = await validateAll(pathToFileURL(`${admin.dir}/`));
    const spurs = sites.find(site => site.slug === 'spurs');
    const linked = new Set([...spurs.featured, ...(spurs.demoProfiles ?? [])]);
    const plain = spurs.people.find(person => !linked.has(person.slug));
    await admin.post(`/sites/spurs/people/${plain.slug}/active`, { active: 'off', _csrf: await admin.csrf() });

    assert.equal(verificationStatus(storedSpurs(admin)).total, before - 2);
    const list = await (await admin.get('/sites/spurs/verification')).text();
    assert.doesNotMatch(list, /verification\/pages\/hospitality/);
    assert.doesNotMatch(list, new RegExp(`verification/people/${plain.slug}"`));
    assert.equal((await admin.get('/sites/spurs/verification/pages/hospitality')).status, 404);
    assert.equal((await admin.get(`/sites/spurs/verification/people/${plain.slug}`)).status, 404);
    assert.equal((await admin.get('/sites/spurs/verification/pages/waysToBook')).status, 404, 'URLs use page paths');
  } finally {
    await admin.close();
  }
});

test('the site banner combines licences and verification in one alert, two lines', async () => {
  const admin = await start();
  try {
    assert.equal((await admin.get('/sites/spurs/stories')).status, 404, 'the Stories screens are gone');
    const html = await (await admin.get('/sites/spurs/people')).text();
    assert.doesNotMatch(html, /href="\/sites\/spurs\/stories"/);
    const banners = html.match(/<div class="alert warn banner"[\s\S]*?<\/div>/g);
    assert.equal(banners.length, 1);
    assert.match(banners[0], /pictures and marks are not licensed yet[\s\S]*pages and profiles are not verified yet/);
    const dashboard = await (await admin.get('/')).text();
    assert.match(
      dashboard,
      /<td data-label="Verified"><a href="\/sites\/spurs\/verification\?show=incomplete">0\/\d+<\/a> <span class="badge warn">\d+ to verify/,
    );
    const incomplete = await (await admin.get('/sites/spurs/verification?show=incomplete')).text();
    assert.match(incomplete, /Incomplete only/);
  } finally {
    await admin.close();
  }
});

/** A Wimbledon shell pack with a verify list (including markup that must be escaped) and one og card. */
async function wimbledonPack() {
  const dir = await mkdtemp(join(tmpdir(), 'appearances-og-'));
  const card = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 3)]);
  await writeFile(join(dir, 'wimbledon.jpg'), card);
  const site = shellSite({ slug: 'wimbledon', name: 'Wimbledon', brand: '#006633' });
  const verify = '# Verify list\n\n- Naming sign-off from the AELTC <script>alert(1)</script>\n- **Crest** is a placeholder\n';
  const data = buildPack(site, { ogDir: dir, verify });
  await rm(dir, { recursive: true, force: true });
  return { data, card };
}

test('site pack upload needs the CSRF token and a same-origin request', async () => {
  const admin = await start();
  try {
    const { data } = await wimbledonPack();
    assert.equal((await admin.upload(data)).status, 403, 'no token');
    assert.equal((await admin.upload(data, { _csrf: await admin.csrf() }, { Origin: 'https://evil.example' })).status, 403);
    const huge = await admin.upload(Buffer.alloc(16 * 1024 * 1024), { _csrf: await admin.csrf() });
    assert.equal(huge.status, 413);
    const bad = await admin.upload(Buffer.from('not a zip'), { _csrf: await admin.csrf() });
    assert.equal(bad.status, 422);
    assert.match(await bad.text(), /Not a usable site pack: This is not a zip file/);
    await assert.rejects(stat(join(admin.dir, 'wimbledon')));
  } finally {
    await admin.close();
  }
});

test('a valid pack opens a review page with counts, an escaped verify list and an in-memory preview', async () => {
  const admin = await start();
  try {
    const { data } = await wimbledonPack();
    const uploaded = await admin.upload(data, { _csrf: await admin.csrf() });
    assert.equal(uploaded.status, 303);
    const review = uploaded.headers.get('location');
    assert.match(review, /^\/packs\/[a-f0-9]{24}$/);
    const html = await (await admin.get(review)).text();
    assert.match(html, /Review site pack/);
    assert.match(html, /People<\/th><td>6 \(/);
    assert.match(html, /Former players: <b>2<\/b>/);
    assert.match(html, /<li>Naming sign-off from the AELTC &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/li>/);
    assert.match(html, /<li><b>Crest<\/b> is a placeholder<\/li>/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /og\/wimbledon\.jpg/);
    assert.match(html, /0\/\d+ pages and profiles verified/);
    await assert.rejects(stat(join(admin.dir, 'wimbledon')), 'review writes nothing');

    const preview = await admin.get(`${review}/preview/wimbledon`);
    assert.equal(preview.status, 200);
    const page = await preview.text();
    assert.match(page, /<body class="site-wimbledon/);
    assert.doesNotMatch(page, /\s(?:href|src|action)="\/(?!packs\/[a-f0-9]{24}\/preview\/|\/)/, 'links stay inside the pack preview');
    assert.equal((await admin.get(`${review}/preview/wimbledon/site.css`)).status, 200);
    assert.equal((await admin.get(`${review}/og/wimbledon.jpg`)).headers.get('content-type'), 'image/jpeg');
    assert.equal((await admin.get('/packs/000000000000000000000000/preview/wimbledon')).status, 404);
  } finally {
    await admin.close();
  }
});

test('importing a pack writes canonical files, an inactive registry entry and byte-identical og cards', async () => {
  const admin = await start();
  try {
    const { data, card } = await wimbledonPack();
    const review = (await admin.upload(data, { _csrf: await admin.csrf() })).headers.get('location');
    const imported = await admin.post(`${review}/import`, { _csrf: await admin.csrf() });
    assert.equal(imported.status, 303);
    assert.match(imported.headers.get('location'), /^\/sites\/wimbledon\?flash=/);
    const flash = await followFlash(admin, imported);
    assert.match(flash, /Imported Wimbledon\. It is inactive; tick licences and work through verification before publishing\./);
    const pack = readPack(data);
    const site = JSON.parse(await admin.file('wimbledon/site.json'));
    assert.equal(site.active, false);
    for (const [path, text] of Object.entries(packFiles({ ...pack, site: { ...pack.site, active: false } }))) {
      if (path.startsWith('public/og/')) continue;
      if (path.endsWith('site.json')) assert.deepEqual(JSON.parse(text), site);
      else assert.equal(await admin.file(path.replace('src/sites/', '')), text, path);
    }
    assert.ok((await readFile(join(admin.publicDir, 'og', 'wimbledon.jpg'))).equals(card), 'og card byte-identical');
    const registry = JSON.parse(await admin.file('registry.json'));
    assert.equal(registry.order.at(-1), 'wimbledon');
    assert.equal('rootSite' in registry, false, 'the landing page stays the root');
    assert.match(await (await admin.get('/')).text(), /Wimbledon<\/b><\/a>.*?Inactive/s);
    assert.equal((await admin.get(review)).status, 404, 'an imported pack is gone from memory');
    assert.deepEqual((await validateAll(pathToFileURL(`${admin.dir}/`))).problems, []);
  } finally {
    await admin.close();
  }
});

test('a pack for an existing site is blocked unless "Replace existing site" is ticked; download round-trips', async () => {
  const admin = await start();
  try {
    const download = await admin.get('/sites/spurs/pack');
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/zip');
    assert.match(download.headers.get('content-disposition'), /attachment; filename="spurs\.site-pack\.zip"/);
    const data = Buffer.from(await download.arrayBuffer());
    const pack = readPack(data, { existing: ['spurs'] });
    assert.deepEqual(pack.problems, []);
    for (const [path, body] of Object.entries(packFiles(pack))) {
      const disk = path.startsWith('public/')
        ? await readFile(join(admin.publicDir, path.slice(7)))
        : Buffer.from(await admin.file(path.slice(10)));
      assert.ok(disk.equals(Buffer.isBuffer(body) ? body : Buffer.from(body)), path);
    }

    const before = await admin.file('spurs/people.json');
    const review = (await admin.upload(data, { _csrf: await admin.csrf() })).headers.get('location');
    assert.match(await (await admin.get(review)).text(), /\/spurs already exists/);
    const blocked = await admin.post(`${review}/import`, { _csrf: await admin.csrf() });
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /tick &quot;Replace existing site&quot;/);
    const replaced = await admin.post(`${review}/import`, { _csrf: await admin.csrf(), replace: 'on' });
    assert.equal(replaced.status, 303);
    assert.match(await followFlash(admin, replaced), /No changes to save/, 'an identical pack changes nothing');
    assert.equal(await admin.file('spurs/people.json'), before);
    assert.equal(JSON.parse(await admin.file('spurs/site.json')).active, undefined, 'a replaced site keeps its live state');

    const discard = (await admin.upload(data, { _csrf: await admin.csrf() })).headers.get('location');
    assert.equal((await admin.post(`${discard}/discard`, { _csrf: await admin.csrf() })).status, 303);
    assert.equal((await admin.get(discard)).status, 404);
  } finally {
    await admin.close();
  }
});

test('github storage uploads binary files (og cards) as base64 blobs', async () => {
  const { calls, fetchImpl } = fakeGitHub();
  const storage = githubStorage({ token: 'ghp_secret', repo: 'peptalk/appearances', fetch: fetchImpl });
  const card = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe]);
  await storage.save({ 'src/sites/wimbledon/site.json': '{}\n', 'public/og/wimbledon.jpg': card }, 'content(wimbledon): import site pack');
  const blobs = calls.filter(call => call.path === '/git/blobs').map(call => call.body);
  assert.deepEqual(blobs, [
    { content: '{}\n', encoding: 'utf-8' },
    { content: card.toString('base64'), encoding: 'base64' },
  ]);
  const tree = calls.find(call => call.path === '/git/trees').body.tree.map(entry => entry.path);
  assert.deepEqual(tree, ['src/sites/wimbledon/site.json', 'public/og/wimbledon.jpg']);
  assert.ok(storage.read('public/og/wimbledon.jpg').equals(card), 'the overlay keeps the bytes');
});

test('site settings: indexable (with its guard), lang and orgType save through the validator, defaults left out', async () => {
  const admin = await start();
  try {
    const editor = async slug => formData(await (await admin.get(`/sites/${slug}`)).text(), `/sites/${slug}`);
    const page = await (await admin.get('/sites/northbridge')).text();
    assert.match(page, /Indexable launches the site\./);
    assert.match(page, /name="lang"[\s\S]*?<option value="en-GB" selected>/);

    const form = await editor('northbridge');
    form.set('indexable', 'on');
    form.set('lang', 'en-US');
    form.set('orgType', 'SportsOrganization');
    assert.equal((await admin.post('/sites/northbridge', form)).status, 303);
    const site = JSON.parse(await admin.file('northbridge/site.json'));
    assert.deepEqual(Object.keys(site).slice(0, 2), ['slug', 'indexable'], 'the launch switch sits at the top');
    assert.equal(site.indexable, true);
    assert.equal(site.lang, 'en-US');
    assert.equal(site.orgType, 'SportsOrganization');
    assert.match(await (await admin.get('/')).text(), /Northbridge City FC<\/b><\/a>[\s\S]*?<span class="badge live">Indexable<\/span>/);

    const back = await editor('northbridge');
    back.delete('indexable');
    back.set('lang', 'en-GB');
    back.set('orgType', 'SportsTeam');
    assert.equal((await admin.post('/sites/northbridge', back)).status, 303);
    const reverted = JSON.parse(await admin.file('northbridge/site.json'));
    for (const key of ['indexable', 'lang', 'orgType']) assert.ok(!(key in reverted), `${key} default is not written`);

    // A site with demo pages can't be made indexable; the save is refused and nothing is written.
    const before = await admin.file('spurs/site.json');
    const spurs = await editor('spurs');
    spurs.set('demoHome', 'on');
    spurs.set('indexable', 'on');
    const refused = await admin.post('/sites/spurs', spurs);
    assert.equal(refused.status, 422);
    assert.match(await refused.text(), /indexable cannot be true while demoHome or demoProfiles are set/);
    assert.equal(await admin.file('spurs/site.json'), before);
  } finally {
    await admin.close();
  }
});

test('person editor: sameAs is one https URL per line, validated, and removed when emptied', async () => {
  const admin = await start();
  try {
    const action = '/sites/spurs/people/sandro';
    const form = formData(await (await admin.get(action)).text(), action);
    form.set('sameAs', 'https://en.wikipedia.org/wiki/Sandro_(footballer,_born_1989)\n\nhttps://www.wikidata.org/wiki/Q312940\n');
    assert.equal((await admin.post(action, form)).status, 303);
    const sandro = () => JSON.parse(readFileSync(join(admin.dir, 'spurs/people.json'), 'utf8')).find(person => person.slug === 'sandro');
    assert.deepEqual(sandro().sameAs, [
      'https://en.wikipedia.org/wiki/Sandro_(footballer,_born_1989)',
      'https://www.wikidata.org/wiki/Q312940',
    ]);

    const before = await admin.file('spurs/people.json');
    form.set('sameAs', 'http://example.com/sandro\nhttps://www.wikidata.org/wiki/Q312940\nhttps://www.wikidata.org/wiki/Q312940');
    const bad = await admin.post(action, form);
    assert.equal(bad.status, 422);
    const html = await bad.text();
    assert.match(html, /sameAs &quot;http:\/\/example\.com\/sandro&quot; must be an https URL/);
    assert.match(html, /sameAs lists a URL twice/);
    assert.equal(await admin.file('spurs/people.json'), before);

    form.set('sameAs', '');
    assert.equal((await admin.post(action, form)).status, 303);
    assert.ok(!('sameAs' in sandro()));
  } finally {
    await admin.close();
  }
});

test('preview renders with the Next.js components: layout, legal pages, lang and plain <img> photos', async () => {
  const admin = await start();
  try {
    const home = await (await admin.get('/preview/eastvale')).text();
    assert.match(home, /^<!doctype html>\n<html lang="en-US">/, 'the app’s Document shell with the site’s language');
    assert.match(home, /<title>Home \| [^<]+ · admin preview<\/title>/);
    assert.match(home, /href="\/preview\/eastvale\/terms"/, 'the app footer links the legal pages');
    assert.match(home, /<script type="application\/ld\+json">/, 'structured data from the app components');
    assert.match(home, /<img[^>]+src="https:\/\/media\.gettyimages\.com\//, 'photos are <img> from their source');
    assert.doesNotMatch(home, /_next\/image|srcSet|srcset/, 'no image optimizer in the admin');
    assert.doesNotMatch(home, /\sstyle="/, 'no inline styles (the CSP forbids them)');

    const profile = await (await admin.get('/preview/spurs/legends/sandro')).text();
    assert.match(profile, /<body class="site-spurs"/);
    assert.match(profile, /<title>Sandro \| Spurs Speaker Network · admin preview<\/title>/);
    const terms = await admin.get('/preview/northbridge/terms');
    assert.equal(terms.status, 200);
    assert.match(await terms.text(), /<h1[^>]*>Terms/);
    assert.equal((await admin.get('/preview/privacy')).status, 200, 'hub legal page');
    const notFound = await admin.get('/preview/spurs/legends/nobody');
    assert.equal(notFound.status, 404);
    assert.match(await notFound.text(), /<body class="landing"/);

    // A pending site pack previews through the same renderer.
    const { data } = await wimbledonPack();
    const review = (await admin.upload(data, { _csrf: await admin.csrf() })).headers.get('location');
    const packHome = await (await admin.get(`${review}/preview/wimbledon`)).text();
    assert.match(packHome, /<body class="site-wimbledon"/);
    assert.match(packHome, new RegExp(`href="${review}/preview/wimbledon/legends"`));
  } finally {
    await admin.close();
  }
});

test('licences cover every image and mark the Next.js pages render', async () => {
  const { published, renderPage, siteCss } = await import('../src/admin/next-render/index.mjs');
  const { sitePaths } = await import('../lib/render/routes.ts');
  const { licenceAssets } = await import('../src/sites/licences.mjs');
  const { readRegistry } = await import('../src/sites/index.mjs');
  for (const slug of readRegistry().order) {
    const raw = loadSite(slug);
    const site = await published(raw);
    const licensable = new Set(licenceAssets(raw).map(asset => asset.url));
    const rendered = new Map();
    for (const path of sitePaths(site)) {
      const { html } = await renderPage(path, [site]);
      for (const [, src] of html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)) rendered.set(src.replaceAll('&amp;', '&'), path);
    }
    for (const [, url] of (await siteCss(site)).matchAll(/url\("?([^")]+)"?\)/g)) rendered.set(url, `/${slug}/site.css`);
    const external = [...rendered].filter(([url]) => /^https?:/.test(url));
    assert.ok(external.length > 0, `${slug} renders photos`);
    const unlicensable = external.filter(([url]) => !licensable.has(url));
    assert.deepEqual(unlicensable, [], `${slug}: rendered images missing from the licence list`);
  }
});
