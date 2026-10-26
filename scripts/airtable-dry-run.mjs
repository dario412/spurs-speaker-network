// Offline dry run of the Airtable people sync: maps an Airtable export (the API's JSON, or a CSV downloaded from a
// grid view) with the same mapper the live sync uses, and prints the people, the skipped and excluded records, the
// site-level checks, and a diff against the site's current people. No API key, no network.
//
//   npm run airtable:dry-run -- --file export.json|export.csv [--site spurs] [--config config/airtable.json]
//                               [--site-file site.json] [--json]
//
// Exits 1 when the live sync would fail closed for any mapped site (too many invalid records, too few people, or a
// result that breaks the site's content rules). Guide: docs/airtable-cms.md.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadAirtableConfig } from '../lib/content/airtable/config.ts';
import { recordsFromCsv, recordsFromJson } from '../lib/content/airtable/export.ts';
import { assertHealthy, describeSkipped, mapRecords, siteProblems } from '../lib/content/airtable/mapper.ts';
import { createJsonProvider } from '../lib/content/json-provider.ts';
import { personImageIds, pickImages, siteImageIds } from '../lib/content/publish.ts';
import { licenceStatus } from '../src/sites/licences.mjs';

const USAGE = `Usage: npm run airtable:dry-run -- --file <export.json|export.csv> [--site <slug>] [--config <path>] [--site-file <site.json>] [--json]

  --file       Airtable export: the API's JSON (one response, several pages, or a records array) or a grid-view CSV
  --site       Only this site (default: every site in the config's sites.values)
  --config     Sync config (default: $AIRTABLE_CONFIG_FILE, else config/airtable.json, else config/airtable.example.json)
  --site-file  Compare against this site file (a stored site with people, e.g. schema/examples/site-populated.json)
               instead of src/sites/<slug>
  --json       Machine-readable output`;

function fail(message) {
  console.error(message);
  process.exit(2);
}

let options;
try {
  options = parseArgs({
    options: {
      file: { type: 'string' },
      site: { type: 'string' },
      config: { type: 'string' },
      'site-file': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (error) {
  fail(`${error.message}\n\n${USAGE}`);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!options.file) fail(`--file is required.\n\n${USAGE}`);

const readText = path => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail(`Cannot read ${path}: ${error.code ?? error.message}`);
  }
};
const readJson = path => {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    return fail(`${path} is not valid JSON: ${error.message}`);
  }
};

const configPath =
  options.config ??
  process.env.AIRTABLE_CONFIG_FILE ??
  (existsSync('config/airtable.json') ? 'config/airtable.json' : 'config/airtable.example.json');
let config;
try {
  config = loadAirtableConfig(readJson(configPath));
} catch (error) {
  fail(`${configPath}: ${error.message}`);
}

const text = readText(options.file);
let exported;
try {
  exported = options.file.toLowerCase().endsWith('.csv') ? recordsFromCsv(text, config) : recordsFromJson(JSON.parse(text), config);
} catch (error) {
  fail(`${options.file}: ${error.message}`);
}

const siteFile = options['site-file'] ? readJson(options['site-file']) : null;
const slugs = options.site ? [options.site] : siteFile ? [siteFile.slug] : Object.keys(config.sites.values);
const provider = createJsonProvider({ cache: false });

/** Field-level differences between the current and the mapped person. */
const changedFields = (before, after) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

const report = {
  file: options.file,
  config: configPath,
  records: exported.records.length,
  missingColumns: exported.missingColumns,
  sites: [],
};
let failed = false;
for (const slug of slugs) {
  if (!Object.hasOwn(config.sites.values, slug))
    fail(`Site "${slug}" is not in the config's sites.values (${Object.keys(config.sites.values).join(', ')}).`);
  const site = siteFile && siteFile.slug === slug ? siteFile : await provider.getRawSite(slug);
  if (!site) fail(`Site "${slug}" was not found in src/sites; pass --site-file to compare against another file.`);
  const result = mapRecords(exported.records, config, site);
  let failure = null;
  try {
    assertHealthy(result, config);
  } catch (error) {
    failure = `${error.message}`;
  }
  const problems = siteProblems(site, result);
  if (problems.length && !failure) failure = `the synced people break ${slug}'s content rules`;
  failed ||= failure !== null;

  const before = new Map(site.people.map(person => [person.slug, person]));
  const after = new Map(result.people.map(person => [person.slug, person]));
  const diff = {
    added: [...after.keys()].filter(key => !before.has(key)),
    removed: [...before.keys()].filter(key => !after.has(key)),
    changed: [...after.keys()]
      .filter(key => before.has(key) && changedFields(before.get(key), after.get(key)).length)
      .map(key => ({
        slug: key,
        fields: changedFields(before.get(key), after.get(key)),
      })),
  };
  diff.unchanged = after.size - diff.added.length - diff.changed.length;
  const images = { ...pickImages(site.images, siteImageIds(site)), ...result.images };
  const used = pickImages(images, [...siteImageIds(site), ...result.people.flatMap(personImageIds)]);
  const licences = licenceStatus({ ...site, images: used });
  report.sites.push({
    site: slug,
    value: config.sites.values[slug],
    people: result.people,
    skipped: result.errors,
    excluded: result.excluded,
    siteProblems: problems,
    diff,
    images: Object.keys(result.images).length,
    licences: { approved: licences.approved, total: licences.total },
    failure,
  });
}

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
}

const out = [];
out.push(`Airtable dry run: ${options.file} (${report.records} records), config ${configPath}`);
if (report.missingColumns.length)
  out.push(`Not in the export (empty in every record, or no such column): ${report.missingColumns.join(', ')}`);
for (const entry of report.sites) {
  out.push(
    '',
    `== ${entry.site} ("${entry.value}"): ${entry.people.length} people, ${entry.skipped.length} skipped, ${entry.excluded.length} excluded ==`,
  );
  out.push('People:');
  for (const person of entry.people)
    out.push(`  ${person.slug.padEnd(24)} ${person.name} · ${person.role} · ${person.era}${person.active === false ? ' · hidden' : ''}`);
  if (!entry.people.length) out.push('  (none)');
  if (entry.skipped.length) {
    out.push('Skipped (invalid; fix in Airtable):');
    for (const line of describeSkipped(entry.skipped)) out.push(`  ${line}`);
  }
  if (entry.excluded.length) {
    out.push('Excluded by the publishing gate:');
    for (const record of entry.excluded) out.push(`  ${record.record}${record.slug ? ` (${record.slug})` : ''}: ${record.reason}`);
  }
  out.push(entry.siteProblems.length ? 'Site rules: problems' : 'Site rules: OK');
  for (const problem of entry.siteProblems) out.push(`  ${problem}`);
  out.push(`Diff against the current people of ${entry.site}:`);
  for (const slug of entry.diff.added) out.push(`  + ${slug}`);
  for (const slug of entry.diff.removed) out.push(`  - ${slug}`);
  for (const change of entry.diff.changed) out.push(`  ~ ${change.slug}: ${change.fields.join(', ')}`);
  out.push(`  = ${entry.diff.unchanged} unchanged`);
  out.push(`Images: ${entry.images} from Airtable; licences ${entry.licences.approved}/${entry.licences.total} approved (keyed by URL)`);
  out.push(entry.failure ? `Result: the live sync would FAIL CLOSED: ${entry.failure}` : 'Result: OK');
}
console.log(out.join('\n'));
process.exit(failed ? 1 : 0);
