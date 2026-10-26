// Writes the content contract's JSON Schema files (schema/*.schema.json) and the generated field tables in
// docs/content-contract.md, from lib/content/contract/schemas.ts (the single source; the typecheck ties it to
// lib/content/types.ts). `npm run schema -- --check` writes nothing and exits 1 when a committed file is out of date (CI).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaFiles, withFieldReference } from '../lib/content/contract/emit.ts';
import { args } from './lib/cli.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA_DIR = join(ROOT, 'schema');
const DOC = join(ROOT, 'docs', 'content-contract.md');

const options = args({ check: { type: 'boolean' } }, 'Usage: npm run schema [-- --check]');
const files = schemaFiles();
const stale = [];

const sync = (path, wanted) => {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === wanted) return;
  stale.push(path.slice(ROOT.length));
  if (!options.check) writeFileSync(path, wanted);
};

if (!options.check) mkdirSync(SCHEMA_DIR, { recursive: true });
for (const [name, content] of Object.entries(files)) sync(join(SCHEMA_DIR, name), content);
// A schema file whose root was removed from the contract would otherwise linger and mislead.
for (const name of existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR) : []) {
  if (!name.endsWith('.schema.json') || Object.hasOwn(files, name)) continue;
  stale.push(`schema/${name} (no longer in the contract)`);
  if (!options.check) rmSync(join(SCHEMA_DIR, name));
}
sync(DOC, withFieldReference(readFileSync(DOC, 'utf8')));

if (options.check) {
  if (stale.length) {
    console.error(`The content contract changed but these files were not regenerated:\n  ${stale.join('\n  ')}\nRun npm run schema.`);
    process.exit(1);
  }
  console.log(`schema: ${Object.keys(files).length} schema files and docs/content-contract.md are up to date.`);
} else {
  console.log(stale.length ? `schema: updated ${stale.join(', ')}` : 'schema: nothing to update.');
}
