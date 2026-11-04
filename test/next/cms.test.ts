// The CMS (/admin, lib/cms/): what can be tested without a database. The proxy's admin branch (outside the preview
// gate, never cached or indexed), the session and form-token signing, link mounting for the local admin's screens,
// cache tags after a save, upload sniffing, and the JSON provider's overlay that the CMS provider is built on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csrfOk, csrfToken, readSession, sessionCookie, signValue, unsignValue } from '../../lib/cms/auth.ts';
import { CONTENT_PATH } from '../../lib/cms/content-files.ts';
import { MEDIA_ID, sniffImage } from '../../lib/cms/media.ts';
import { tagsFor } from '../../lib/cms/publish.ts';
import { mountPath } from '../../lib/cms/web.ts';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { buildCsp } from '../../lib/proxy/csp.ts';
import { decide, isCmsPath, type ProxyConfig } from '../../lib/proxy/decide.ts';

process.env.AUTH_SECRET ||= 'test-secret-test-secret-test-secret-0123456789';

const manifest = {
  rootSite: null,
  redirects: {},
  slugs: ['spurs'],
  pages: ['/spurs'],
  imageHosts: ['https://media.gettyimages.com'],
  photoOrigins: [],
  ogCards: [],
  indexable: [] as string[],
  hubIndexable: false,
  domains: {},
  hubHost: 'appearances.getapeptalk.com',
  tracking: [] as string[],
} as unknown as ProxyConfig['manifest'];
const gated: ProxyConfig = {
  manifest,
  passwords: { master: 'master pw', sites: { spurs: 'spurs pw' } },
  production: true,
  previewPublic: false,
  dev: false,
};
const run = (path: string, method = 'GET') =>
  decide({ method, url: `https://appearances.getapeptalk.com${path}`, authorization: null }, gated);

test('the CMS is outside the preview gate, never cached, never indexed, and allows data: images only for itself', async () => {
  for (const path of ['/admin', '/admin/login', '/admin/sites/spurs/people/sandro']) {
    for (const method of ['GET', 'POST']) {
      const decision = await run(path, method);
      assert.equal(decision.action, 'next', `${method} ${path}`);
      assert.equal(decision.headers['Cache-Control'], 'no-store', path);
      assert.equal(decision.headers['X-Robots-Tag'], 'noindex, nofollow', path);
      assert.match(decision.headers['Content-Security-Policy'], /img-src 'self' data: /, path);
      assert.match(decision.headers['Content-Security-Policy'], /style-src 'self'(;|$)/, 'still no inline styles');
    }
  }
  assert.equal((await run('/admin', 'DELETE')).action, 'respond');
  // Site pages keep the gate and the strict policy.
  const site = await run('/spurs');
  assert.equal(site.action === 'respond' && site.status, 401);
  assert.doesNotMatch(buildCsp({ imageHosts: [] }), /data:/);
  // Uploads are public, like any site photo.
  assert.equal((await run('/api/media/m-abcdefghij')).action, 'next');
  assert.equal(isCmsPath('/administrator'), false, 'only /admin and below');
  assert.equal(isCmsPath('/spurs/admin'), false);
});

test('sessions and form tokens are signed; a tampered or expired session is refused', () => {
  const user = { id: 'u1', sessionVersion: 3 } as Parameters<typeof sessionCookie>[0];
  const cookie = sessionCookie(user, Date.now());
  const payload = readSession(cookie);
  assert.equal(payload?.uid, 'u1');
  assert.equal(payload?.v, 3);
  const [body, signature] = cookie.split('.');
  const forged = Buffer.from(JSON.stringify({ ...payload, uid: 'someone-else' })).toString('base64url');
  assert.equal(readSession(`${forged}.${signature}`), null, 'changed payload');
  assert.equal(readSession(`${body}.x${signature.slice(1)}`), null, 'changed signature');
  assert.equal(readSession(cookie, Date.now() + 13 * 3600 * 1000), null, 'expired after 12 hours');
  assert.equal(readSession(undefined), null);
  const token = csrfToken('sid-1');
  assert.equal(csrfOk('sid-1', token), true);
  assert.equal(csrfOk('sid-2', token), false, 'a token belongs to one session');
  assert.equal(csrfOk('sid-1', ''), false);
  assert.equal(unsignValue(signValue('{"text":"Saved."}')), '{"text":"Saved."}');
  assert.equal(unsignValue(`${Buffer.from('{"text":"x"}').toString('base64url')}.nope`), null);
});

test('the local admin’s links and redirects are mounted under /admin; previews open the live page', () => {
  assert.equal(mountPath('/'), '/admin/content');
  assert.equal(mountPath('/sites/spurs/people'), '/admin/sites/spurs/people');
  assert.equal(mountPath('/sites/spurs/licences?show=unapproved'), '/admin/sites/spurs/licences?show=unapproved');
  assert.equal(mountPath('/preview/spurs/legends/sandro'), '/spurs/legends/sandro');
  assert.equal(mountPath('/preview/all'), '/all');
  assert.equal(mountPath('/assets/admin.css'), '/admin/assets/admin.css');
  assert.equal(mountPath('/admin/users'), '/admin/users');
});

test('a save refreshes exactly the pages that used the saved files', () => {
  assert.deepEqual(tagsFor(['src/sites/spurs/people.json']).sort(), ['site:spurs', 'sites']);
  assert.deepEqual(tagsFor(['src/sites/registry.json']).sort(), ['registry', 'sites']);
  assert.deepEqual(tagsFor(['src/copy/legal/terms.md']), ['legal']);
});

test('the CMS stores content files only, and uploads only real PNG, JPEG or WebP images', () => {
  for (const ok of [
    'src/sites/registry.json',
    'src/sites/spurs/site.json',
    'src/sites/spurs/people.json',
    'src/copy/legal/accessibility.md',
  ])
    assert.match(ok, CONTENT_PATH);
  for (const bad of [
    'src/sites/../lib/x.json',
    'lib/cms/web.ts',
    'src/sites/spurs/notes.txt',
    'src/copy/legal/x.md',
    'public/og/spurs.jpg',
  ])
    assert.doesNotMatch(bad, CONTENT_PATH);
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImage(new TextEncoder().encode('RIFF....WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImage(new TextEncoder().encode('<svg onload="alert(1)">')), null, 'no SVG');
  assert.match('m-abc123xyz9', MEDIA_ID);
  assert.doesNotMatch('../etc/passwd', MEDIA_ID);
});

test('the CMS provider’s overlay: saved files win over the committed ones, unsaved paths read the files', async () => {
  const plain = createJsonProvider({ cache: false });
  const site = await plain.getRawSite('spurs');
  assert.ok(site);
  const edited = {
    ...site,
    people: undefined,
    images: undefined,
    licences: undefined,
    verification: undefined,
    tagline: 'Edited in the CMS',
  };
  for (const key of ['people', 'images', 'licences', 'verification'] as const) delete (edited as Record<string, unknown>)[key];
  const overlay = new Map([['src/sites/spurs/site.json', JSON.stringify(edited)]]);
  const cms = createJsonProvider({ cache: false, overlay, name: 'cms' });
  assert.equal((await cms.getSite('spurs'))?.tagline, 'Edited in the CMS');
  assert.equal((await cms.getSite('spurs'))?.people.length, (await plain.getSite('spurs'))?.people.length, 'people still from the files');
  const legal = createJsonProvider({ cache: false, overlay: new Map([['src/copy/legal/terms.md', '---\ntitle: New terms\n---\nBody']]) });
  assert.equal((await legal.getLegal('terms')).title, 'New terms');
});
