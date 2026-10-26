// The tracking slot (lib/tracking.ts, public/tracking.js): off by default, strict ids, the TRACKING_GTM_ID fallback,
// consent gating, the Trusted Types allowlist and the CSP it widens (only for sites with tags). public/tracking.js runs
// here in a VM against a small fake DOM. What the pages and headers carry per site is checked against a build in
// app.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import { buildManifest } from '../../lib/manifest.ts';
import { buildCsp } from '../../lib/proxy/csp.ts';
import { CONSENT_COOKIE, CONSENT_MAX_AGE, consentRequired, envGtmId, siteTracking, TAG_SCRIPT_ORIGIN } from '../../lib/tracking.ts';

const provider = createJsonProvider({ cache: false });
const sites = await provider.listSites();

test('off by default: no site has tags or consent, the manifest lists none, and the CSP is unchanged', async () => {
  for (const site of sites) {
    assert.equal(siteTracking(site, undefined), null, site.slug);
    assert.equal(consentRequired(site), false, site.slug);
  }
  const manifest = await buildManifest(provider, 'public/og', {});
  assert.deepEqual(manifest.tracking, []);
  assert.equal(buildCsp({ imageHosts: [] }), buildCsp({ imageHosts: [], tracking: false }));
});

test('a site’s own ids win; TRACKING_GTM_ID is the fallback for sites without; invalid env ids are ignored and logged', () => {
  const [site] = sites;
  assert.deepEqual(siteTracking({ ...site, tracking: { ga4Id: 'G-ABC123' } }, 'GTM-ENV1234'), { ga4Id: 'G-ABC123' });
  assert.deepEqual(siteTracking(site, 'GTM-ENV1234'), { gtmId: 'GTM-ENV1234' });
  assert.equal(envGtmId({ TRACKING_GTM_ID: ' GTM-ENV1234 ' }), 'GTM-ENV1234');
  const errors: string[] = [];
  const original = console.error;
  console.error = (line: string) => errors.push(line);
  try {
    assert.equal(envGtmId({ TRACKING_GTM_ID: 'GTM-1"><script>' }), undefined);
  } finally {
    console.error = original;
  }
  assert.match(errors[0], /tracking\.invalid/);
  assert.doesNotMatch(errors[0], /script/, 'the bad value is not echoed');
  assert.equal(envGtmId({}), undefined);
});

test('the manifest lists sites with tags (own or fallback), so the proxy widens only their CSP', async () => {
  const manifest = await buildManifest(provider, 'public/og', { TRACKING_GTM_ID: 'GTM-ENV1234' });
  assert.deepEqual(
    manifest.tracking,
    sites.map(site => site.slug),
  );
});

const LOADER = readFileSync('public/tracking.js', 'utf8');

interface FakeNode {
  tag: string;
  attributes: Record<string, string>;
  children: (FakeNode | string)[];
  listeners: Record<string, () => void>;
  [key: string]: unknown;
}

/** Runs public/tracking.js once with the given data attributes and cookie; returns what it did. */
function runLoader(dataset: Record<string, string>, { cookie = '', https = true, trustedTypes = true } = {}) {
  const node = (tag: string): FakeNode => {
    const self: FakeNode = {
      tag,
      attributes: {},
      children: [],
      listeners: {},
      setAttribute: (name: string, value: string) => {
        self.attributes[name] = value;
      },
      append: (...items: (FakeNode | string)[]) => self.children.push(...items),
      addEventListener: (type: string, listener: () => void) => {
        self.listeners[type] = listener;
      },
      remove: () => {
        self.removed = true;
      },
    };
    return self;
  };
  const head = node('head');
  const body = node('body');
  const cookies: string[] = [];
  const policies: { name: string; rules: { createScriptURL(value: string): string | null } }[] = [];
  const listeners: Record<string, (event: unknown) => void> = {};
  const document = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    currentScript: { dataset },
    head,
    body,
    createElement: node,
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookies.push(value);
    },
  };
  const window: Record<string, unknown> = {
    trustedTypes: trustedTypes
      ? {
          defaultPolicy: null,
          createPolicy: (name: string, rules: { createScriptURL(value: string): string | null }) => policies.push({ name, rules }),
        }
      : undefined,
  };
  runInNewContext(LOADER, {
    document,
    window,
    location: { protocol: https ? 'https:' : 'http:', pathname: '/spurs/about' },
    URL,
    console,
    Date,
    encodeURIComponent,
  });
  const scripts = () => head.children.map(child => (child as FakeNode).src as string);
  const banner = () => body.children[0] as FakeNode | undefined;
  const click = (label: string) => {
    const actions = banner()?.children[1] as FakeNode;
    const button = actions.children.find(child => (child as FakeNode).textContent === label) as FakeNode;
    button.listeners.click();
  };
  const outbound = () =>
    listeners.click({
      target: {
        closest: () => ({
          href: 'https://www.tottenhamhotspurstadium.com/venue-hire/',
          dataset: { brand: 'spurs' },
          textContent: 'Explore event spaces',
        }),
      },
    });
  return { window, scripts, banner, click, cookies, policies, outbound };
}

test('the loader mirrors lib/tracking.ts (origin, cookie name, lifetime)', () => {
  assert.ok(LOADER.includes(`const ORIGIN = '${TAG_SCRIPT_ORIGIN}';`));
  assert.ok(LOADER.includes(`const COOKIE = '${CONSENT_COOKIE}';`));
  assert.ok(LOADER.includes(`const MAX_AGE = ${CONSENT_MAX_AGE};`));
  assert.doesNotMatch(LOADER, /innerHTML|insertAdjacentHTML|document\.write|eval\(/, 'DOM calls only');
});

test('without consent required: tags load at once, GTM and GA4 queued the way their loaders expect', () => {
  const run = runLoader({ gtmId: 'GTM-ABC1234', ga4Id: 'G-ABC123' });
  assert.deepEqual(run.scripts(), [
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234',
    'https://www.googletagmanager.com/gtag/js?id=G-ABC123',
  ]);
  const layer = run.window.dataLayer as unknown[];
  assert.equal((layer[0] as { event: string }).event, 'gtm.js');
  assert.deepEqual(Array.from(layer[2] as ArrayLike<unknown>), ['config', 'G-ABC123']);
  assert.equal(run.banner(), undefined, 'no banner');
  assert.equal(run.cookies.length, 0, 'no cookie is set without a banner');
});

test('consent required: nothing loads until the visitor accepts; a refusal is remembered and loads nothing', () => {
  const run = runLoader({ gtmId: 'GTM-ABC1234', consent: 'required' });
  assert.deepEqual(run.scripts(), []);
  const banner = run.banner();
  assert.equal(banner?.tag, 'aside');
  assert.equal(banner?.attributes['aria-label'], 'Cookie choices');
  run.click('Accept analytics cookies');
  assert.deepEqual(run.scripts(), ['https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234']);
  assert.equal(run.cookies[0], `pa_consent=granted; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax; Secure`);
  assert.equal(banner?.removed, true);

  const refused = runLoader({ gtmId: 'GTM-ABC1234', consent: 'required' }, { https: false });
  refused.click('Reject');
  assert.deepEqual(refused.scripts(), []);
  assert.equal(refused.cookies[0], `pa_consent=denied; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax`);
  const later = runLoader({ gtmId: 'GTM-ABC1234', consent: 'required' }, { cookie: 'x=1; pa_consent=denied' });
  assert.equal(later.banner(), undefined, 'a stored refusal: no banner, no tags');
  assert.deepEqual(later.scripts(), []);
  const granted = runLoader({ gtmId: 'GTM-ABC1234', consent: 'required' }, { cookie: 'pa_consent=granted' });
  assert.equal(granted.scripts().length, 1, 'a stored yes loads at once');
});

test('the Trusted Types default policy lets through script URLs on Google Tag Manager’s origin over https only', () => {
  const run = runLoader({ gtmId: 'GTM-ABC1234' });
  assert.equal(run.policies.length, 1);
  const [{ name, rules }] = run.policies;
  assert.equal(name, 'default');
  assert.equal(rules.createScriptURL('https://www.googletagmanager.com/gtag/js?id=G-1'), 'https://www.googletagmanager.com/gtag/js?id=G-1');
  for (const bad of [
    'http://www.googletagmanager.com/gtm.js',
    'https://www.googletagmanager.com.evil.example/gtm.js',
    'https://evil.example/https://www.googletagmanager.com/',
    'javascript:alert(1)',
    'data:text/javascript,alert(1)',
    '/local.js',
  ])
    assert.equal(rules.createScriptURL(bad), null, bad);
  assert.equal(runLoader({ gtmId: 'GTM-ABC1234' }, { trustedTypes: false }).scripts().length, 1, 'browsers without Trusted Types');
});

test('CSP with tracking: Google’s tag hosts and a default Trusted Types policy; nothing else loosens', () => {
  const csp = buildCsp({ imageHosts: ['https://media.gettyimages.com'], tracking: true });
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/www\.googletagmanager\.com;/);
  assert.match(
    csp,
    /img-src 'self' https:\/\/media\.gettyimages\.com https:\/\/www\.googletagmanager\.com https:\/\/\*\.google-analytics\.com;/,
  );
  assert.match(csp, /connect-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/\*\.google-analytics\.com/);
  assert.match(csp, /require-trusted-types-for 'script'; trusted-types default$/);
  assert.match(csp, /style-src 'self';/, 'still no inline styles');
  assert.match(csp, /form-action 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval/);
});

test('Event Spaces outbound clicks identify brand, destination and source page, respecting consent', () => {
  const run = runLoader({ gtmId: 'GTM-ABC1234', ga4Id: 'G-ABC123', consent: 'required' });
  run.outbound();
  assert.equal(typeof run.window.dataLayer, 'undefined');
  run.click('Accept analytics cookies');
  run.outbound();
  const layer = run.window.dataLayer as unknown[];
  const event = layer[layer.length - 2] as Record<string, unknown>;
  assert.equal(event.event, 'event_spaces_click');
  assert.equal(event.brand, 'spurs');
  assert.equal(event.page_path, '/spurs/about');
  assert.equal(event.link_url, 'https://www.tottenhamhotspurstadium.com/venue-hire/');
  const ga4 = Array.from(layer[layer.length - 1] as ArrayLike<unknown>);
  assert.deepEqual(ga4.slice(0, 2), ['event', 'event_spaces_click']);
  assert.equal((ga4[2] as Record<string, unknown>).send_to, 'G-ABC123');
  const denied = runLoader({ gtmId: 'GTM-ABC1234', consent: 'required' }, { cookie: 'pa_consent=denied' });
  denied.outbound();
  assert.equal(denied.window.dataLayer, undefined);
});
