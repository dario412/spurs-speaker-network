// Turns research output (see docs/research-brief.md) into a populated site under src/sites/<slug>/.
// The config file holds { club, roles, eras, legends?, images }; each people file holds { legends, images }.
// Stories were removed from the product: a `stories` array in an older research config is ignored, with a note.
// Current players may live in the config's `legends` array (role "squad"). The result is validated before writing.
import { existsSync } from 'node:fs';
import { readRegistry, SITES_DIR } from '../src/sites/index.mjs';
import { assembleSite } from '../src/sites/scaffold.mjs';
import { registryFile, siteFiles, withSite, writeFiles } from '../src/sites/store.mjs';
import { args, fail, readJsonFile, readTextFile, writePackFile } from './lib/cli.mjs';
import { validateSite } from './validate-content.mjs';

const USAGE = `Usage:
  npm run assemble-site -- --slug f1 --config research/f1-config.json \\
    --people research/f1-legends.json [--people research/f1-more.json] [--era-map turbo=classic,v8=v10] [--root] \\
    [--pack [--out research] [--verify research/f1-verify.md]]

--era-map renames era keys used in the people files to the config's era keys.
--root makes / redirect to the site. An existing src/sites/<slug>/ is overwritten.
--pack writes <slug>.site-pack.zip (to --out, default .) instead of touching src/sites/ or the registry. Its verify.md
is --verify, or else the "verify" lists from the research files.`;

const options = args(
  {
    slug: { type: 'string' },
    config: { type: 'string' },
    people: { type: 'string', multiple: true, default: [] },
    'era-map': { type: 'string', default: '' },
    root: { type: 'boolean', default: false },
    pack: { type: 'boolean', default: false },
    out: { type: 'string', default: '.' },
    verify: { type: 'string' },
  },
  USAGE,
);
if (!options.slug || !options.config) fail(USAGE);

const pairs = options['era-map'].split(',').filter(Boolean);
const eraMap = Object.fromEntries(pairs.map(pair => pair.split('=')));
if (pairs.some(pair => !/^[a-z0-9-]+=[a-z0-9-]+$/.test(pair)))
  fail(`--era-map must look like old=new,old2=new2 (got "${options['era-map']}")`);

const config = await readJsonFile(options.config);
if (!config.club) fail(`${options.config} has no "club" object; see docs/research-brief.md.`);
const peopleFiles = await Promise.all(options.people.map(readJsonFile));
if (config.stories?.length)
  console.log(`Note: ignoring ${config.stories.length} stories in ${options.config} (stories were removed from the sites).`);

const site = assembleSite({ slug: options.slug, config, peopleFiles, eraMap });
const problems = validateSite(site);
if (problems.length) fail(`${problems.join('\n')}\n${problems.length} problem(s); nothing written.`);

if (options.pack) {
  // The research files' own verify lists, when no hand-written list is given.
  const lists = [config, ...peopleFiles].flatMap(file => (Array.isArray(file.verify) ? file.verify : []));
  const verify =
    (await readTextFile(options.verify)) ?? (lists.length ? `# Verify list\n\n${lists.map(item => `- ${item}`).join('\n')}\n` : undefined);
  const path = await writePackFile(site, { out: options.out, mode: 'populated', verify });
  console.log(`Wrote ${path} (${site.people.length} people). Upload it in the admin (New site → Upload a site pack).`);
  process.exit(0);
}

if (existsSync(new URL(`${options.slug}/`, SITES_DIR))) console.log(`Overwriting src/sites/${options.slug}/.`);
await writeFiles({ ...siteFiles(site), ...registryFile(withSite(readRegistry(), options.slug, { root: options.root })) });

const counts = Object.fromEntries(site.roles.map(role => [role.key, site.people.filter(person => person.role === role.key).length]));
console.log(
  `Wrote src/sites/${options.slug}/ (${site.people.length} people, ${Object.keys(site.images).length} images): ${JSON.stringify(counts)}`,
);
