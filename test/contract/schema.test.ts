// The content contract: the committed JSON Schema files and docs/content-contract.md match the definitions
// (lib/content/contract/schemas.ts, tied to lib/content/types.ts by the typecheck), the examples in schema/examples
// are valid, and the validator rejects what it should.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fieldReference, schemaFiles, schemaFor, withFieldReference } from '../../lib/content/contract/emit.ts';
import { formatErrors, validateSchema } from '../../lib/content/contract/validate.ts';
import { publishable } from '../../lib/content/publish.ts';
import { validateRegistry, validateSite } from '../../scripts/validate-content.mjs';

const read = (path: string) => readFileSync(path, 'utf8');
const example = (name: string) => JSON.parse(read(join('schema', 'examples', name)));
const errors = (file: Parameters<typeof schemaFor>[0], value: unknown) => formatErrors(validateSchema(schemaFor(file), value));

test('schema/*.schema.json and the doc’s field reference are generated from the contract (npm run schema)', () => {
  for (const [name, content] of Object.entries(schemaFiles())) assert.equal(read(join('schema', name)), content, `schema/${name} is stale`);
  const doc = read(join('docs', 'content-contract.md'));
  assert.equal(withFieldReference(doc), doc, 'docs/content-contract.md field reference is stale');
  for (const field of ['sameAs', 'gallery', 'indexable', 'pages', 'licences', 'lastUpdated', 'domains', 'aliases', 'tracking', 'consent'])
    assert.ok(fieldReference().includes(`\`${field}\``), `${field} missing from the field reference`);
});

test('the examples are valid: shapes and content rules', () => {
  const populated = example('site-populated.json');
  const shell = example('site-shell.json');
  assert.deepEqual(errors('registry', example('registry.json')), []);
  for (const site of [populated, shell]) {
    assert.deepEqual(errors('raw-site', site), [], site.slug);
    assert.deepEqual(errors('site', publishable(site)), [], `${site.slug} published`);
    assert.deepEqual(validateSite(site), [], `${site.slug} content rules`);
  }
  assert.deepEqual(validateRegistry(example('registry.json'), [populated, shell]), []);
  assert.deepEqual(errors('legal', example('legal-terms.json')), []);
  assert.deepEqual(errors('legal', example('legal-privacy.json')), []);
  assert.deepEqual(errors('people-result', example('people-result.json')), []);
  for (const person of populated.people) assert.deepEqual(errors('person', person), [], person.slug);
});

test('the examples show both image kinds: Getty ids today, R2 URLs keyed by host and path', () => {
  const { images, people } = example('site-populated.json');
  assert.ok(Object.keys(images).some(id => /^\d+$/.test(id) && images[id].startsWith('https://media.gettyimages.com/id/')));
  for (const person of people)
    for (const id of [person.hero, person.card, ...person.gallery]) assert.equal(images[id], `https://${id}`, `${person.slug}: ${id}`);
  assert.ok(
    people.some((person: { sameAs?: string[] }) => person.sameAs?.length),
    'an example person has sameAs',
  );
});

test('the validator reports precise problems', () => {
  const person = example('site-populated.json').people[0];
  const without = (value: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
  assert.deepEqual(errors('person', without(person, 'name')), ['/name is required']);
  assert.deepEqual(errors('person', { ...person, nickname: 'x' }), ['/nickname is not a known field']);
  assert.deepEqual(errors('person', { ...person, slug: 'Jo Marsh' }), ['/slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$']);
  assert.deepEqual(errors('person', { ...person, stats: person.stats.slice(0, 3) }), ['/stats must have at least 4 item(s)']);
  assert.deepEqual(errors('person', { ...person, stats: [['a'], ...person.stats.slice(1)] }), ['/stats/0 must have at least 2 item(s)']);
  assert.deepEqual(errors('person', { ...person, role: 'goalkeeper' }), [
    '/role must be one of "player", "manager", "staff", "women", "squad"',
  ]);
  assert.deepEqual(errors('person', { ...person, limited: 'yes' }), ['/limited must be boolean (got string)']);
  assert.deepEqual(errors('person', { ...person, sameAs: ['http://example.org/a'] }), ['/sameAs/0 must match ^https://']);
  assert.deepEqual(errors('person', { ...person, sameAs: [person.sameAs[0], person.sameAs[0]] }), ['/sameAs must not repeat items']);
  assert.deepEqual(errors('person', { ...person, hero: 7 }), ['/hero must be string (got integer)']);
  assert.deepEqual(
    errors('person', { ...person, hero: null }),
    [],
    'null image ids are a shape the schema allows (content rules limit them to shell sites)',
  );
  assert.throws(() => validateSchema({ type: 'object', patternProperties: {} }, {}), /Unsupported JSON Schema keyword "patternProperties"/);
  const registry = example('registry.json');
  const domain = registry.domains.northbridge;
  assert.deepEqual(errors('registry', { ...registry, domains: { northbridge: { ...domain, live: 'yes' }, 'Bad Slug': domain } }), [
    '/domains/northbridge/live must be boolean (got string)',
    '/domains/Bad Slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$',
  ]);
  assert.match(
    errors('registry', { ...registry, domains: { northbridge: { ...domain, primary: 'https://x.example' } } })[0],
    /^\/domains\/northbridge\/primary must match/,
  );
  const site = example('site-populated.json');
  assert.deepEqual(errors('raw-site', { ...site, tracking: { gtmId: 'UA-1' }, consent: { required: 'no' } }), [
    '/tracking/gtmId must match ^GTM-[A-Z0-9]{4,10}$',
    '/consent/required must be boolean (got string)',
  ]);
});
