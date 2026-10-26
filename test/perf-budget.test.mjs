// Performance budgets (scripts/lib/perf-budget.mjs): what `npm run perf:budget` fails on. The measuring itself needs
// Chrome and a build, so it runs in its own CI job (.github/workflows/ci.yml → perf), not here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUDGET_METRICS, budgetFailures } from '../scripts/lib/perf-budget.mjs';

const row = (profile, path, values) => ({ profile, path, ...values });

test('budgets pass at or under the ceiling and name every page and metric over it', () => {
  const budgets = { $note: 'ignored', mobile: { lcp: 2000, js: 150000 }, desktop: { cls: 0.05 } };
  const results = [
    row('mobile', '/spurs', { lcp: 2000, js: 140000 }),
    row('mobile', '/eastvale', { lcp: 2600.4, js: 151000 }),
    row('desktop', '/spurs', { cls: 0.12 }),
  ];
  assert.deepEqual(budgetFailures(results, budgets), [
    'mobile /eastvale: lcp 2600 ms > budget 2000 ms',
    'mobile /eastvale: js 147.5 KB > budget 146.5 KB',
    'desktop /spurs: cls 0.120 > budget 0.050',
  ]);
  assert.deepEqual(budgetFailures([row('mobile', '/', { lcp: 1 })], { mobile: { lcp: 2 } }), []);
});

test('a typo, a missing metric or a missing profile fails instead of passing silently', () => {
  assert.deepEqual(budgetFailures([row('mobile', '/', { lcp: 1 })], { mobile: { lpc: 2 } }), ['mobile: "lpc" is not a budget metric']);
  assert.deepEqual(budgetFailures([row('mobile', '/', {})], { mobile: { cls: 0.1 } }), ['mobile /: cls was not measured']);
  assert.deepEqual(budgetFailures([row('mobile', '/', { tbt: 900 })], { mobile: { tbt: 300 } }), ['mobile: "tbt" is not a budget metric']);
  assert.deepEqual(budgetFailures([], { desktop: { lcp: 2 } }), ['desktop: no measurements for a budgeted profile']);
});

test('the committed budget file caps every metric on both profiles', () => {
  const budgets = JSON.parse(readFileSync(new URL('../scripts/perf-budgets.json', import.meta.url), 'utf8'));
  for (const profile of ['mobile', 'desktop'])
    assert.deepEqual(Object.keys(budgets[profile]).sort(), Object.keys(BUDGET_METRICS).sort(), profile);
});
