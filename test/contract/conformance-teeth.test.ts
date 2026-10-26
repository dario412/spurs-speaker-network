// The conformance suite must fail a provider that breaks the contract: every check fails on
// fixtures/broken-provider.ts (one defect per check), run in a child process so its failures don't fail this run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('every conformance check fails on a provider that breaks it', () => {
  // Without NODE_TEST_CONTEXT, which would make the child report to this runner instead of failing on its own.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'test/contract/fixtures/broken-provider.ts'], {
    encoding: 'utf8',
    env,
  });
  assert.notEqual(run.status, 0, 'the broken provider passed the conformance suite');
  const failed = (name: string) => new RegExp(`✖ ${name.replace(/[()]/g, '\\$&')}`).test(run.stdout);
  for (const check of [
    'shapes match the JSON Schema',
    'content rules hold',
    'publishing switches',
    'slugs are unique and URL-safe',
    'image references resolve',
    'legal content is present',
    'ordering is deterministic',
    'per-site domains pass through',
    'errors are typed ContentErrors',
  ])
    assert.ok(failed(check), `"${check}" did not fail:\n${run.stdout.slice(-3000)}`);
});
