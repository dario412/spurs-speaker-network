// The enquiry endpoint (lib/enquiry): field checks mirroring the form, the honeypot, the minimum time to submit, size,
// type and rate limits, the per-site gate, same-origin, forwarding with a mocked fetch (payload and secret header),
// discarding when no webhook is set, and that no personal data ever reaches the logs.
// The endpoint behind the proxy (POST/redirect/GET, Host headers) is covered in app.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJsonProvider } from '../../lib/content/json-provider.ts';
import type { Site } from '../../lib/content/types.ts';
import { forwardingEnabled, webhookUrl } from '../../lib/enquiry/config.ts';
import { checkEnquiry, FIELD_LIMITS } from '../../lib/enquiry/fields.ts';
import {
  createRateLimiter,
  type EnquiryDeps,
  type EnquiryPayload,
  handleEnquiry,
  type LogLine,
  MAX_BYTES,
  SECRET_HEADER,
} from '../../lib/enquiry/handler.ts';
import { siteContext } from '../../lib/render/context.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';

const HUB = 'https://appearances.example';
const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);
/** The real sites plus the fictional ones (test/fixtures/sites.mjs): a second site whose password must not open spurs. */
const sites = await createJsonProvider({ sitesDir: writeSitesDir(), cache: false }).listSites();
const spurs = sites.find(site => site.slug === 'spurs') as Site;
const ctx = siteContext(spurs, { origin: HUB });
const person = spurs.people[0];

const PII = { name: 'Ada Example', email: 'ada@example.com', company: 'Example Holdings', brief: 'Annual dinner, 300 guests' };
const fields = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    site: 'spurs',
    t: String(NOW - 60_000),
    website: '',
    ...PII,
    date: '2027-03-14',
    who: ctx.v.whoOptions[1],
    where: ctx.v.whereOptions[0],
    format: Object.values(ctx.FORMATS)[0].title,
    size: '250–500',
    legend: person.slug,
    ...overrides,
  });

function deps(overrides: Partial<EnquiryDeps> = {}) {
  const logs: LogLine[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const base: EnquiryDeps = {
    env: { ENQUIRY_WEBHOOK_URL: 'https://hooks.example/enquiries?token=abc', ENQUIRY_WEBHOOK_SECRET: 'shh' },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as typeof fetch,
    now: () => NOW,
    limiter: createRateLimiter(),
    log: line => logs.push(line),
    loadSite: async slug => {
      const site = sites.find(candidate => candidate.slug === slug);
      return site ? { site, domain: null } : null;
    },
    hubOrigin: HUB,
  };
  return { deps: { ...base, ...overrides }, logs, calls };
}

const request = (form: URLSearchParams | string, headers: Record<string, string> = {}) =>
  new Request('http://appearances.example/api/enquiry', {
    method: 'POST',
    headers: { host: 'appearances.example', 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...headers },
    body: typeof form === 'string' ? form : form.toString(),
  });

test('field checks mirror the form: required fields, email, date, lengths, the site’s own choices and people', () => {
  assert.equal(checkEnquiry(fields(), ctx).ok, true);
  const bad = checkEnquiry(
    fields({
      name: '',
      email: 'ada@',
      company: 'x'.repeat(FIELD_LIMITS.company + 1),
      date: '2027-02-30',
      who: 'Mascot',
      where: '',
      format: 'Skydive',
      size: '10000',
      legend: 'someone-else',
    }),
    ctx,
  );
  assert.equal(bad.ok, false);
  if (!bad.ok)
    assert.deepEqual(bad.errors.map(error => `${error.field}:${error.problem}`).sort(), [
      'company:too-long',
      'date:invalid',
      'email:invalid',
      'format:invalid',
      'legend:invalid',
      'name:required',
      'size:invalid',
      'where:required',
      'who:invalid',
    ]);
  assert.equal(checkEnquiry(fields({ date: '', legend: '', brief: '' }), ctx).ok, true, 'date, person and brief are optional');
});

test('forwards a normalised payload with the shared secret, and logs only event, site and outcome', async () => {
  const { deps: d, logs, calls } = deps();
  const response = await handleEnquiry(
    request(fields(), { referer: 'https://appearances.example/spurs/check-availability?legend=x#form' }),
    d,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, forwarded: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://hooks.example/enquiries?token=abc');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers[SECRET_HEADER], 'shh');
  assert.equal(headers['Content-Type'], 'application/json');
  const payload = JSON.parse(String(calls[0].init.body)) as EnquiryPayload;
  assert.deepEqual(payload, {
    type: 'enquiry',
    version: 1,
    site: { slug: 'spurs', platform: ctx.site.platform, orgName: ctx.site.orgName, url: `${HUB}/spurs` },
    personOfInterest: { slug: person.slug, name: ctx.bySlug[person.slug].name, url: `${HUB}/spurs/legends/${person.slug}` },
    fields: {
      name: PII.name,
      email: PII.email,
      company: PII.company,
      eventDate: '2027-03-14',
      who: ctx.v.whoOptions[1],
      where: ctx.v.whereOptions[0],
      format: Object.values(ctx.FORMATS)[0].title,
      audienceSize: '250–500',
      brief: PII.brief,
    },
    submittedAt: '2026-10-20T09:00:00.000Z',
    pageUrl: 'https://appearances.example/spurs/check-availability?legend=x',
  });
  assert.deepEqual(logs, [{ service: 'appearances', event: 'enquiry.submitted', site: 'spurs', outcome: 'forwarded', status: 200 }]);
});

test('no personal data, secrets or webhook URL in the logs, whatever the outcome', async () => {
  const lines: string[] = [];
  const capture = (line: LogLine) => lines.push(JSON.stringify(line));
  const failing = (async () => {
    throw new Error('connect ECONNREFUSED https://hooks.example/enquiries?token=abc');
  }) as typeof fetch;
  const cases: [URLSearchParams, Partial<EnquiryDeps>][] = [
    [fields(), {}],
    [fields({ email: 'bad' }), {}],
    [fields({ website: 'filled' }), {}],
    [fields(), { fetch: failing }],
    [fields(), { fetch: (async () => new Response('nope', { status: 500 })) as typeof fetch }],
    [fields(), { env: {} }],
  ];
  const original = { log: console.log, error: console.error, warn: console.warn };
  const consoleLines: string[] = [];
  console.log = console.error = console.warn = (...args: unknown[]) => consoleLines.push(args.map(String).join(' '));
  try {
    for (const [form, overrides] of cases) await handleEnquiry(request(form), deps({ ...overrides, log: capture }).deps);
  } finally {
    Object.assign(console, original);
  }
  const all = [...lines, ...consoleLines].join('\n');
  for (const secret of [...Object.values(PII), 'shh', 'hooks.example', 'token=abc', 'ECONNREFUSED'])
    assert.ok(!all.includes(secret), `"${secret}" reached the logs`);
  assert.deepEqual(
    lines.map(line => JSON.parse(line).outcome),
    ['forwarded', 'invalid', 'honeypot', 'forward-failed', 'forward-failed', 'discarded'],
  );
});

test('no webhook configured: checked, then discarded; nothing is sent', async () => {
  const { deps: d, calls } = deps({ env: {} });
  const response = await handleEnquiry(request(fields()), d);
  assert.deepEqual(await response.json(), { ok: true, forwarded: false });
  assert.equal(calls.length, 0);
  assert.equal(forwardingEnabled({}), false);
  assert.equal(webhookUrl({ ENQUIRY_WEBHOOK_URL: 'http://hooks.example/x' }), null, 'plain http only for localhost');
  assert.equal(webhookUrl({ ENQUIRY_WEBHOOK_URL: 'http://localhost:9000/x' }), 'http://localhost:9000/x');
  assert.equal(webhookUrl({ ENQUIRY_WEBHOOK_URL: 'not a url' }), null);
  assert.equal(forwardingEnabled({ ENQUIRY_WEBHOOK_URL: 'https://hooks.example/x' }), true);
});

test('honeypot and minimum time: bots get a normal-looking answer and nothing is sent; a too-quick submit is refused', async () => {
  const bot = deps();
  const filled = await handleEnquiry(request(fields({ website: 'https://spam.example' })), bot.deps);
  assert.deepEqual(await filled.json(), { ok: true, forwarded: false });
  assert.equal(bot.calls.length, 0);
  const quick = deps();
  const fast = await handleEnquiry(request(fields({ t: String(NOW - 1000) })), quick.deps);
  assert.equal(fast.status, 400);
  assert.deepEqual(await fast.json(), { ok: false, error: 'too-fast' });
  assert.equal((await handleEnquiry(request(fields({ t: 'yesterday' })), deps().deps)).status, 400);
  assert.equal(quick.calls.length, 0);
  // No timestamp (the form posted without JavaScript): the other checks still apply.
  assert.equal((await handleEnquiry(request(fields({ t: '' })), deps().deps)).status, 200);
});

test('without JavaScript: 303 back to the form’s thank-you or error state, on the hub folder or the site’s domain', async () => {
  const html = { accept: 'text/html' };
  const sent = await handleEnquiry(request(fields(), html), deps().deps);
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get('location'), '/spurs/check-availability#enquiry-sent');
  const invalid = await handleEnquiry(request(fields({ email: '' }), html), deps().deps);
  assert.equal(invalid.headers.get('location'), '/spurs/check-availability#enquiry-error');
  const failed = await handleEnquiry(
    request(fields(), html),
    deps({ fetch: (async () => new Response('', { status: 503 })) as typeof fetch }).deps,
  );
  assert.equal(failed.headers.get('location'), '/spurs/check-availability#enquiry-failed');
  const onDomain = await handleEnquiry(request(fields(), { ...html, 'x-appearances-site': 'spurs' }), deps().deps);
  assert.equal(onDomain.headers.get('location'), '/check-availability#enquiry-sent');
});

test('limits and refusals: size, type, rate, unknown or foreign site, cross-origin, and the site’s password gate', async () => {
  const big = await handleEnquiry(request(fields({ brief: 'x'.repeat(MAX_BYTES) })), deps().deps);
  assert.equal(big.status, 413);
  const declared = await handleEnquiry(request(fields(), { 'content-length': String(MAX_BYTES + 1) }), deps().deps);
  assert.equal(declared.status, 413);
  assert.equal((await handleEnquiry(request('{}', { 'content-type': 'application/json' }), deps().deps)).status, 415);
  const limited = deps({ limiter: createRateLimiter({ limit: 2 }) });
  const statuses = [];
  for (let i = 0; i < 3; i += 1)
    statuses.push((await handleEnquiry(request(fields(), { 'x-real-ip': '203.0.113.9' }), limited.deps)).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  assert.equal((await handleEnquiry(request(fields(), { 'x-real-ip': '203.0.113.10' }), limited.deps)).status, 200, 'per client');
  assert.equal((await handleEnquiry(request(fields({ site: 'nope' })), deps().deps)).status, 400);
  assert.equal((await handleEnquiry(request(fields({ site: 'spurs--domain' })), deps().deps)).status, 400);
  assert.equal((await handleEnquiry(request(fields(), { 'x-appearances-site': 'northbridge' }), deps().deps)).status, 400);
  assert.equal((await handleEnquiry(request(fields(), { origin: 'https://evil.example' }), deps().deps)).status, 403);
  assert.equal((await handleEnquiry(request(fields(), { origin: 'null' }), deps().deps)).status, 403);
  assert.equal((await handleEnquiry(request(fields(), { origin: 'http://appearances.example' }), deps().deps)).status, 200);
  const gated = {
    ENQUIRY_WEBHOOK_URL: 'https://hooks.example/x',
    PREVIEW_PASSWORD: 'master',
    PREVIEW_PASSWORD_NORTHBRIDGE: 'northbridge pw',
  };
  const basic = (pw: string) => ({ authorization: `Basic ${Buffer.from(`x:${pw}`).toString('base64')}` });
  assert.equal((await handleEnquiry(request(fields()), deps({ env: gated }).deps)).status, 401);
  assert.equal(
    (await handleEnquiry(request(fields(), basic('northbridge pw')), deps({ env: gated }).deps)).status,
    401,
    'another site’s password',
  );
  assert.equal((await handleEnquiry(request(fields(), basic('master')), deps({ env: gated }).deps)).status, 200);
});
