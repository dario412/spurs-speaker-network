// Imports a site pack (docs/site-packs.md) into src/sites/: the command-line equivalent of the admin's
// New site → Upload a site pack. Validates first and writes nothing if there are problems.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadSite, readRegistry, SITES_DIR } from '../src/sites/index.mjs';
import { licenceSummary } from '../src/sites/licences.mjs';
import { PackError, packFiles, prepareImport, readPack } from '../src/sites/packs.mjs';
import { registryFile, writeFiles } from '../src/sites/store.mjs';
import { verificationSummary } from '../src/sites/verification.mjs';
import { args, fail } from './lib/cli.mjs';
import { validateRegistry, validateSite } from './validate-content.mjs';

const USAGE = `Usage:
  npm run import-pack -- wimbledon.site-pack.zip [--root] [--publish] [--force]

The site is imported inactive unless --publish. --root makes / redirect to it. --force replaces an existing site
with the same slug (its registry position, and any licence approvals or checks the pack lacks, are kept).`;

const options = args(
  { root: { type: 'boolean', default: false }, publish: { type: 'boolean', default: false }, force: { type: 'boolean', default: false } },
  USAGE,
  { positionals: true },
);
if (options._.length !== 1) fail(USAGE);

const registry = readRegistry();
let pack;
try {
  pack = readPack(await readFile(options._[0]), { existing: registry.order, redirects: registry.redirects });
} catch (error) {
  fail(error instanceof PackError ? error.message : `Cannot read ${options._[0]}: ${error.code ?? error.message}`);
}
if (pack.verify) console.log(`Verify list (put it in the PR description):\n${pack.verify}`);
if (pack.problems.length) fail(`${pack.problems.join('\n')}\n${pack.problems.length} problem(s); nothing imported.`);
if (pack.collision && !options.force) fail(`"${pack.site.slug}" already exists. Pass --force to replace it.`);

const current = pack.collision ? loadSite(pack.site.slug) : null;
const { site, registry: next } = prepareImport(pack, { registry, current, publish: options.publish, root: options.root });
const sites = next.order.map(slug => (slug === site.slug ? site : loadSite(slug)));
const problems = [...validateSite(site), ...validateRegistry(next, sites)];
if (problems.length) fail(`${problems.join('\n')}\n${problems.length} problem(s); nothing imported.`);

// An existing licences.json / verification.json is rewritten (possibly emptied) rather than left stale.
const present = file => existsSync(new URL(`${site.slug}/${file}.json`, SITES_DIR));
const files = packFiles({ site, og: pack.og }, { licencesPresent: present('licences'), verificationPresent: present('verification') });
await writeFiles({ ...files, ...registryFile(next) });
console.log(
  `Imported ${site.orgName} as src/sites/${site.slug}/ (${site.active === false ? 'inactive' : 'live'}, ${Object.keys(pack.og).length} og cards).`,
);
console.log(
  `${licenceSummary(site)}\n${verificationSummary(site)}\nNext: npm run check, then tick licences and work through verification in the admin.`,
);
