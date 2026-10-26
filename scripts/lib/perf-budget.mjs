// Performance budgets for scripts/perf.mjs (`--budget scripts/perf-budgets.json`), as a pure function so it is tested
// (test/perf-budget.test.mjs). A budget file maps a profile (mobile, desktop) to metric ceilings; every measured page
// on that profile must stay at or under each ceiling. Unknown metrics are an error, so a typo can't silently pass.

/** Metrics a budget may cap, with how to print them. */
export const BUDGET_METRICS = {
  lcp: value => `${Math.round(value)} ms`,
  cls: value => value.toFixed(3),
  js: value => `${(value / 1024).toFixed(1)} KB`,
  transferNoImages: value => `${(value / 1024).toFixed(1)} KB`,
  firstPartyRequests: value => String(value),
};

/**
 * @param {{ profile: string, path: string, [metric: string]: unknown }[]} results median rows from scripts/perf.mjs
 * @param {Record<string, Record<string, number>>} budgets profile -> metric -> ceiling (keys starting with $ are notes)
 * @returns {string[]} one line per measurement over its ceiling (empty when everything fits)
 */
export function budgetFailures(results, budgets) {
  const problems = [];
  for (const [profile, ceilings] of Object.entries(budgets)) {
    if (profile.startsWith('$')) continue;
    for (const metric of Object.keys(ceilings))
      if (!Object.hasOwn(BUDGET_METRICS, metric)) problems.push(`${profile}: "${metric}" is not a budget metric`);
    const rows = results.filter(row => row.profile === profile);
    if (!rows.length) problems.push(`${profile}: no measurements for a budgeted profile`);
    for (const row of rows)
      for (const [metric, ceiling] of Object.entries(ceilings)) {
        const value = row[metric];
        if (!Object.hasOwn(BUDGET_METRICS, metric)) continue;
        if (typeof value !== 'number') problems.push(`${profile} ${row.path}: ${metric} was not measured`);
        else if (value > ceiling)
          problems.push(`${profile} ${row.path}: ${metric} ${BUDGET_METRICS[metric](value)} > budget ${BUDGET_METRICS[metric](ceiling)}`);
      }
  }
  return problems;
}
