// Packs an existing site from src/sites/ into <slug>.site-pack.zip (docs/site-packs.md), with its og cards, so it
// can be moved to another checkout or reviewed and imported through the admin.
import { loadSite, readRegistry } from '../src/sites/index.mjs';
import { args, fail, readTextFile, writePackFile } from './lib/cli.mjs';

const USAGE = `Usage:
  npm run pack-site -- --slug spurs [--out dir] [--verify verify.md]

Writes <out>/<slug>.site-pack.zip (default: the current directory).`;

const options = args({ slug: { type: 'string' }, out: { type: 'string', default: '.' }, verify: { type: 'string' } }, USAGE);
if (!options.slug) fail(USAGE);
if (!readRegistry().order.includes(options.slug)) fail(`"${options.slug}" is not in src/sites/registry.json.`);

const path = await writePackFile(loadSite(options.slug), { out: options.out, verify: await readTextFile(options.verify) });
console.log(`Wrote ${path}.`);
