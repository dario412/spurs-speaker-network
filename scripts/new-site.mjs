// Scaffolds a new *shell* site: real brand (name, colours, marks) with placeholder people and photos.
// The admin's "New site" form does the same thing (src/admin/).
import { existsSync } from 'node:fs';
import { readRegistry, SITES_DIR } from '../src/sites/index.mjs';
import { shellSite } from '../src/sites/scaffold.mjs';
import { registryFile, siteFiles, withSite, writeFiles } from '../src/sites/store.mjs';
import { args, fail, readJsonFile, readTextFile, writePackFile } from './lib/cli.mjs';
import { validateSite } from './validate-content.mjs';

const USAGE = `Usage:
  npm run new-site -- --slug wimbledon --name "Wimbledon" [--short "Wimbledon"] \\
    [--brand "#006633"] [--ink "#1b1b1b"] [--dark "#006633"] [--bar "#4b0082"] \\
    [--wordmark https://…/logo.svg] [--crest https://…/crest.png] [--root] [--force]
  npm run new-site -- --from research/wimbledon-config.json   (a research-brief config; its "club" object fills the fields)

--root makes / redirect to the new site. --force overwrites an existing src/sites/<slug>/.
--pack writes <slug>.site-pack.zip (to --out, default .) instead of touching src/sites/ or the registry; upload it
in the admin (New site → Upload a site pack) or run npm run import-pack. --verify adds a verify list to the pack.`;

const options = args(
  Object.fromEntries(
    ['slug', 'name', 'short', 'brand', 'ink', 'dark', 'bar', 'wordmark', 'crest', 'from']
      .map(key => [key, { type: 'string' }])
      .concat([
        ['root', { type: 'boolean', default: false }],
        ['force', { type: 'boolean', default: false }],
        ['pack', { type: 'boolean', default: false }],
        ['out', { type: 'string', default: '.' }],
        ['verify', { type: 'string' }],
      ]),
  ),
  USAGE,
);

const fromFile = options.from ? await readJsonFile(options.from) : null;
const brief = fromFile?.club ?? fromFile ?? {};
const slug = options.slug ?? brief.slug;
const name = options.name ?? brief.orgName;
if (!slug || !name) fail(`Missing --slug and --name (or --from with a club object).\n\n${USAGE}`);
for (const key of ['wordmark', 'crest']) {
  if (options[key] && !URL.canParse(options[key])) fail(`--${key} is not a valid URL: ${options[key]}`);
}
if (!options.pack && existsSync(new URL(`${slug}/`, SITES_DIR)) && !options.force)
  fail(`src/sites/${slug}/ already exists. Pass --force to overwrite it.`);

const { pack, out, verify, ...fields } = options;
const site = shellSite({ ...fields, slug, name, brief });
const problems = validateSite(site);
if (problems.length) fail(`${problems.join('\n')}\n${problems.length} problem(s); nothing written.`);

if (pack) {
  const path = await writePackFile(site, { out, mode: 'shell', verify: await readTextFile(verify) });
  console.log(`Wrote ${path}.\nUpload it in the admin (New site → Upload a site pack) or run: npm run import-pack -- ${path}`);
  process.exit(0);
}

await writeFiles({ ...siteFiles(site), ...registryFile(withSite(readRegistry(), slug, { root: options.root })) });
console.log(
  `Created shell site src/sites/${slug}/ and registered it.\nNext: npm run og-cards (needs Chrome), then npm run dev and open /${slug}.`,
);
