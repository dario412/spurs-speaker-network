// Airtable people sync: config, mapper, client and provider, plus the offline dry run. fetch is always mocked
// (test/fixtures/airtable/mock.ts); nothing here reaches the network or needs a real token.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createAirtableClient, MIN_INTERVAL_MS, RATE_LIMIT_WAIT_MS } from '../../lib/content/airtable/client.ts';
import { airtableEnv, fieldIds, loadAirtableConfig } from '../../lib/content/airtable/config.ts';
import { recordsFromCsv, recordsFromJson } from '../../lib/content/airtable/export.ts';
import { assertHealthy, mapRecord, mapRecords, siteProblems } from '../../lib/content/airtable/mapper.ts';
import { createAirtablePeopleProvider, filterFormula } from '../../lib/content/airtable-provider.ts';
import { ContentError, isContentError } from '../../lib/content/errors.ts';
import { imageIdFor } from '../../lib/content/image-ids.ts';
import { selectProvider } from '../../lib/content/select.ts';
import type { RawSite } from '../../lib/content/types.ts';
import { airtableError, fixtureJson, fixturePages, mockAirtable, TOKEN } from '../fixtures/airtable/mock.ts';
import { writeSitesDir } from '../fixtures/sites.mjs';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const site = (): RawSite => json('schema/examples/site-populated.json');
const config = () => loadAirtableConfig(fixtureJson('config.json'));
const records = () => fixturePages().flatMap(page => page.records);
const noWait = async () => {};

test('config: the example loads, and the fixture config uses the same field map', () => {
  const example = loadAirtableConfig(json('config/airtable.example.json'));
  const fixture = config();
  assert.deepEqual(fixture.fields, example.fields);
  assert.deepEqual(fixture.images, example.images);
  assert.deepEqual(fixture.publish, example.publish);
  assert.ok(fieldIds(example).every(id => /^fld[A-Za-z0-9]{14}$/.test(id)));
  assert.equal(example.failClosed.maxInvalidRatio, 0.1);
});

test('config: field IDs, not names; publishing must be gated; attachments need their R2 mirror', () => {
  const raw = json('config/airtable.example.json');
  const problems = (change: (value: Record<string, unknown>) => void) => {
    const copy = structuredClone(raw);
    change(copy);
    try {
      loadAirtableConfig(copy);
      return [];
    } catch (error) {
      assert.ok(isContentError(error) && error.code === 'config');
      return error.details;
    }
  };
  assert.deepEqual(
    problems(value => {
      (value.fields as Record<string, { id: string }>).slug.id = 'Slug';
    }),
    ['fields.slug.id must be a field ID (fld + 14 characters)'],
  );
  assert.deepEqual(
    problems(value => {
      value.publish = {};
    }),
    ['publish needs at least a status or a consent condition (publishing fails closed)'],
  );
  assert.match(
    problems(value => {
      (value.images as Record<string, unknown>).hero = { id: 'fldHERO0000000000', type: 'attachment' };
    })[0],
    /urlTemplate is required for attachments/,
  );
  assert.match(
    problems(value => {
      (value.images as Record<string, unknown>).hosts = ['http://media.example.com'];
    })[0],
    /not an https origin/,
  );
  assert.deepEqual(
    problems(value => {
      delete (value.fields as Record<string, unknown>).bio;
    }),
    ['fields.bio is required'],
  );
  assert.deepEqual(
    problems(value => {
      (value.sites as { values: Record<string, string> }).values = { spurs: 'Tottenham Hotspur', northbridge: 'Tottenham Hotspur' };
    }),
    ['sites.values: "northbridge" and "spurs" share the value "Tottenham Hotspur"; each site needs its own'],
  );
});

test('config from the environment: the token is required and never part of the config', () => {
  assert.throws(
    () => airtableEnv({}),
    (error: unknown) => isContentError(error) && /AIRTABLE_TOKEN/.test(error.message),
  );
  assert.throws(() => airtableEnv({ AIRTABLE_TOKEN: TOKEN, AIRTABLE_CONFIG: '{' }), /AIRTABLE_CONFIG is not valid JSON/);
  assert.throws(() => airtableEnv({ AIRTABLE_TOKEN: TOKEN }, '/nonexistent'), /AIRTABLE_CONFIG/);
  assert.deepEqual(airtableEnv({ AIRTABLE_TOKEN: TOKEN, AIRTABLE_CONFIG: '{"a":1}' }), { token: TOKEN, config: { a: 1 } });
  assert.throws(() => selectProvider({ PEOPLE_PROVIDER: 'airtable' }), /AIRTABLE_TOKEN/);
});

test('filterByFormula: the site and the publishing gate, by field ID, with escaped literals', () => {
  assert.equal(
    filterFormula(config(), 'northbridge'),
    'AND({fldSITE0000000000} = "Northbridge City FC", OR({fldSTATUS00000000} = "Published"), {fldCONSENT0000000}, NOT({fldARCHIVED000000}))',
  );
  const list = { ...config(), sites: { field: { id: 'fldSITE0000000000', type: 'list' as const }, values: { a: 'Say "hi"' } } };
  assert.match(filterFormula(list, 'a'), /^AND\(FIND\(",Say \\"hi\\",", "," & ARRAYJOIN\(\{fldSITE0000000000\}, ","\) & ","\)/);
});

test('mapper: fixture records become the people-result example; problems are listed, never dropped', () => {
  const result = mapRecords(records(), config(), site());
  assert.deepEqual({ people: result.people, images: result.images }, json('schema/examples/people-result.json'));
  assert.deepEqual(
    result.errors.map(error => [error.record, error.slug]),
    [
      ['recLeeCarver00005', 'lee-carver'],
      ['recDuplicate00009', 'sam-hollis'],
    ],
  );
  const [lee, duplicate] = result.errors;
  assert.ok(lee.problems.some(problem => /cdn\.elsewhere\.example is not an allowed image host/.test(problem)));
  assert.ok(lee.problems.some(problem => /gallery .* needs exactly 3 images/.test(problem)));
  assert.ok(
    lee.problems.some(problem => /^role must be one of/.test(problem)),
    'other fields are still checked',
  );
  assert.deepEqual(duplicate.problems, ['slug "sam-hollis" is already used by recSamHollis00004']);
  assert.deepEqual(
    result.excluded.map(entry => [entry.slug, entry.reason]),
    [
      ['mia-duval', 'not published (status "Draft")'],
      ['kit-ward', 'no consent recorded'],
    ],
  );
  assert.ok(!result.people.some(person => person.slug === 'ray-dunn'), 'another site’s record is not mapped');
});

test('mapper: deterministic whatever order the API returns records in', () => {
  const sorted = mapRecords(records(), config(), site());
  const shuffled = mapRecords([...records()].reverse(), config(), site());
  assert.equal(JSON.stringify(shuffled), JSON.stringify(sorted));
});

test('mapper: the CSV export maps exactly like the API JSON', () => {
  const csv = recordsFromCsv(readFileSync('test/fixtures/airtable/export.csv', 'utf8'), config());
  assert.deepEqual(csv.missingColumns, []);
  const fromCsv = mapRecords(csv.records, config(), site());
  const fromJson = mapRecords(recordsFromJson(fixtureJson('records.json'), config()).records, config(), site());
  assert.deepEqual(fromCsv.people, fromJson.people);
  assert.deepEqual(fromCsv.images, fromJson.images);
  assert.equal(fromCsv.errors.length, fromJson.errors.length);
});

test('mapper: R2 image ids are host + path; attachments go through the mirror template, never Airtable URLs', () => {
  assert.equal(imageIdFor('https://media.example.com/people/a.jpg?v=2'), 'media.example.com/people/a.jpg');
  assert.equal(imageIdFor('https://media.gettyimages.com/id/2206513784/photo/x.jpg?s=612x612'), '2206513784');
  const base = config();
  const attachment = {
    id: 'fldHERO0000000000',
    type: 'attachment' as const,
    urlTemplate: 'https://media.example.com/airtable/{id}/{filename}',
  };
  const withAttachments = { ...base, images: { ...base.images, hero: attachment } };
  const [record] = records();
  const hero = [{ id: 'attAbc', url: 'https://v5.airtableusercontent.com/expiring', filename: 'jo marsh.jpg' }];
  const mapped = mapRecord({ ...record, fields: { ...record.fields, fldHERO0000000000: hero } }, withAttachments, site());
  assert.ok('person' in mapped);
  assert.equal(mapped.images[mapped.person.hero as string], 'https://media.example.com/airtable/attAbc/jo%20marsh.jpg');
  const fromCsv = mapRecord(
    { ...record, fields: { ...record.fields, fldHERO0000000000: 'jo.jpg (https://dl.airtable…)' } },
    withAttachments,
    site(),
  );
  assert.ok('problems' in fromCsv && /cannot be read from a CSV export/.test(fromCsv.problems[0]));
});

test('fail closed: too many invalid records, too few people, or a site that would break', () => {
  const result = mapRecords(records(), config(), site());
  assert.doesNotThrow(() => assertHealthy(result, config()));
  const strict = { ...config(), failClosed: { maxInvalidRatio: 0.1, minPeople: 1 } };
  assert.throws(
    () => assertHealthy(result, strict),
    (error: unknown) => isContentError(error) && error.code === 'invalid_content' && error.details.length === 2,
  );
  assert.throws(() => assertHealthy({ ...result, people: [], errors: [] }, config()), /0 publishable people/);
  const withoutFeatured = { ...result, people: result.people.filter(person => person.slug !== 'jo-marsh') };
  assert.ok(siteProblems(site(), withoutFeatured).some(problem => /featured "jo-marsh" is not in people.json/.test(problem)));
});

test('client: paginates with offset, POSTs by field ID with the token only in the header', async () => {
  const mock = mockAirtable();
  const logs: unknown[] = [];
  const client = createAirtableClient({
    token: TOKEN,
    baseId: 'appEXAMPLE0000000',
    fetch: mock.fetch,
    sleep: noWait,
    log: e => logs.push(e),
  });
  const list = await client.listRecords('tblPEOPLE00000000', { fields: fieldIds(config()), filterByFormula: 'TRUE()', maxPages: 5 });
  assert.equal(list.length, records().length);
  assert.equal(mock.calls.length, 2);
  const [first, second] = mock.calls;
  assert.equal(first.url, 'https://api.airtable.com/v0/appEXAMPLE0000000/tblPEOPLE00000000/listRecords');
  assert.equal(first.method, 'POST');
  assert.equal(first.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(first.body, { pageSize: 100, returnFieldsByFieldId: true, fields: fieldIds(config()), filterByFormula: 'TRUE()' });
  assert.equal(second.body.offset, fixturePages()[0].offset);
  assert.ok(!JSON.stringify(logs).includes(TOKEN));
});

test('client: 429 waits Airtable’s 30 seconds, 5xx backs off, both then succeed', async () => {
  const slept: number[] = [];
  const mock = mockAirtable([
    airtableError(429, { type: 'RATE_LIMIT_REACHED', message: 'Rate limit' }),
    airtableError(503, 'SERVICE_UNAVAILABLE'),
  ]);
  const client = createAirtableClient({
    token: TOKEN,
    baseId: 'appEXAMPLE0000000',
    fetch: mock.fetch,
    sleep: async ms => void slept.push(ms),
    log: () => {},
  });
  const list = await client.listRecords('tblPEOPLE00000000', { fields: [], maxPages: 5 });
  assert.equal(list.length, records().length);
  assert.ok(slept.includes(RATE_LIMIT_WAIT_MS), `slept ${slept}`);
  assert.ok(slept.includes(1000) || slept.includes(2000), `slept ${slept}`);
});

test('client: stays under 5 requests per second per base', async () => {
  let clock = 0;
  const starts: number[] = [];
  const mock = mockAirtable();
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    starts.push(clock);
    return mock.fetch(input, init);
  }) as typeof globalThis.fetch;
  const client = createAirtableClient({
    token: TOKEN,
    baseId: 'appEXAMPLE0000000',
    fetch,
    now: () => clock,
    sleep: async ms => {
      clock += ms;
    },
    log: () => {},
  });
  await client.listRecords('tblPEOPLE00000000', { fields: [], maxPages: 5 });
  await client.listRecords('tblPEOPLE00000000', { fields: [], maxPages: 5 });
  for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] - starts[i - 1] >= MIN_INTERVAL_MS, `requests ${starts}`);
});

test('client: typed errors for credentials, wrong ids, bad formulas, outages and runaway pagination; the token never leaks', async () => {
  const run = async (replies: Parameters<typeof mockAirtable>[0], maxPages = 5) => {
    const logs: unknown[] = [];
    const client = createAirtableClient({
      token: TOKEN,
      baseId: 'appEXAMPLE0000000',
      fetch: mockAirtable(replies).fetch,
      sleep: noWait,
      log: e => logs.push(e),
    });
    try {
      await client.listRecords('tblPEOPLE00000000', { fields: [], maxPages });
      assert.fail('expected a ContentError');
    } catch (error) {
      assert.ok(error instanceof ContentError, String(error));
      const everything = JSON.stringify([error.message, error.details, logs, String(error.cause ?? '')]);
      assert.ok(!everything.includes(TOKEN), 'the token leaked into an error or a log line');
      return error;
    }
  };
  assert.equal((await run([airtableError(401, { type: 'AUTHENTICATION_REQUIRED', message: 'x' })])).code, 'unauthorized');
  assert.equal((await run([airtableError(403, 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND')])).code, 'unauthorized');
  assert.equal((await run([airtableError(404, 'NOT_FOUND')])).code, 'config');
  const formula = await run([airtableError(422, { type: 'INVALID_FILTER_BY_FORMULA', message: 'Unknown field names: fldX' })]);
  assert.equal(formula.code, 'config');
  assert.match(formula.message, /INVALID_FILTER_BY_FORMULA\): Unknown field names: fldX/);
  const outage = await run(Array.from({ length: 4 }, () => airtableError(502, 'BAD_GATEWAY')));
  assert.equal(outage.code, 'unavailable');
  assert.equal((await run(Array.from({ length: 4 }, () => airtableError(429, { type: 'RATE_LIMIT_REACHED' })))).code, 'rate_limited');
  assert.equal((await run(Array.from({ length: 4 }, () => new TypeError('fetch failed')))).code, 'unavailable');
  assert.match((await run([], 1)).message, /exceeded 1 pages/);
});

test('client: an expired pagination iterator restarts the listing from the first page', async () => {
  const pages = fixturePages();
  const mock = mockAirtable([Response.json(pages[0]), airtableError(422, { type: 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE' })]);
  const client = createAirtableClient({ token: TOKEN, baseId: 'appEXAMPLE0000000', fetch: mock.fetch, sleep: noWait, log: () => {} });
  const list = await client.listRecords('tblPEOPLE00000000', { fields: [], maxPages: 5 });
  assert.equal(list.length, records().length, 'no duplicates from the abandoned pass');
  assert.equal(mock.calls[2].body.offset, undefined, 'the restart begins without an offset');
});

test('provider: unmanaged sites keep their people; managed ones come from Airtable, validated', async () => {
  const logs: { event: string }[] = [];
  const provider = createAirtablePeopleProvider(config(), {
    token: TOKEN,
    fetch: mockAirtable().fetch,
    sleep: noWait,
    log: e => logs.push(e),
  });
  assert.equal(await provider.peopleFor({ ...site(), slug: 'spurs' }), null);
  const result = await provider.peopleFor(site());
  assert.deepEqual(result, json('schema/examples/people-result.json'));
  assert.equal(logs.filter(entry => entry.event === 'airtable.record_skipped').length, 2);
  assert.ok(logs.some(entry => entry.event === 'airtable.synced'));
  assert.ok(!JSON.stringify(logs).includes(TOKEN));
  const strict = createAirtablePeopleProvider(
    { ...config(), failClosed: { maxInvalidRatio: 0, minPeople: 1 } },
    {
      token: TOKEN,
      fetch: mockAirtable().fetch,
      sleep: noWait,
      log: () => {},
    },
  );
  await assert.rejects(strict.peopleFor(site()), (error: unknown) => isContentError(error) && error.code === 'invalid_content');
  const featured = createAirtablePeopleProvider(config(), { token: TOKEN, fetch: mockAirtable().fetch, sleep: noWait, log: () => {} });
  await assert.rejects(featured.peopleFor({ ...site(), featured: ['tom-rees'] }), /break the site's content rules/);
});

test('selectProvider: PEOPLE_PROVIDER=airtable wires config, token and fetch (mocked) into the JSON content', async () => {
  const fixture = fixtureJson('config.json') as { sites: { values: Record<string, string> } };
  const env = {
    PEOPLE_PROVIDER: 'airtable',
    AIRTABLE_TOKEN: TOKEN,
    AIRTABLE_CONFIG: JSON.stringify({ ...fixture, sites: { ...fixture.sites, values: { spurs: 'Northbridge City FC' } } }),
  };
  // The real sites plus the fictional ones (test/fixtures/sites.mjs), so there is a site outside the config.
  const provider = selectProvider(env, { fetch: mockAirtable().fetch, json: { sitesDir: writeSitesDir() } });
  // The fixture people don't fit spurs' featured list, so the sync must fail closed rather than publish a broken site.
  await assert.rejects(provider.getSite('spurs'), (error: unknown) => isContentError(error) && error.code === 'invalid_content');
  assert.ok((await provider.getSite('northbridge'))?.people.length, 'sites outside the config keep their JSON people');
});

const dryRun = (...args: string[]) => {
  const { AIRTABLE_TOKEN: _, AIRTABLE_CONFIG: __, AIRTABLE_CONFIG_FILE: ___, ...env } = process.env;
  return spawnSync(process.execPath, ['scripts/airtable-dry-run.mjs', ...args], { encoding: 'utf8', env });
};
const FIXTURE_ARGS = ['--config', 'test/fixtures/airtable/config.json', '--site-file', 'schema/examples/site-populated.json'];

test('dry run: maps an export offline (no token) and diffs against the current people', () => {
  for (const file of ['test/fixtures/airtable/records.json', 'test/fixtures/airtable/export.csv']) {
    const run = dryRun('--file', file, ...FIXTURE_ARGS);
    assert.equal(run.status, 0, run.stderr);
    for (const line of [
      '4 people, 2 skipped, 2 excluded',
      '+ sam-hollis',
      '- tom-rees',
      '~ jo-marsh: short',
      '= 2 unchanged',
      'Result: OK',
    ])
      assert.ok(run.stdout.includes(line), `${file}: missing "${line}"\n${run.stdout}`);
    assert.match(run.stdout, /recLeeCarver00005|csv-row-6/);
  }
  const report = JSON.parse(dryRun('--file', 'test/fixtures/airtable/records.json', ...FIXTURE_ARGS, '--json').stdout);
  assert.deepEqual(report.sites[0].diff, {
    added: ['sam-hollis'],
    removed: ['tom-rees'],
    changed: [{ slug: 'jo-marsh', fields: ['short'] }],
    unchanged: 2,
  });
});

test('dry run: exits 1 when the live sync would fail closed, 2 on bad usage', () => {
  const run = dryRun('--file', 'test/fixtures/airtable/records.json', '--site', 'spurs');
  assert.equal(run.status, 1);
  assert.match(run.stdout, /would FAIL CLOSED/);
  assert.equal(dryRun().status, 2);
  assert.equal(dryRun('--file', 'nope.json', ...FIXTURE_ARGS).status, 2);
});
