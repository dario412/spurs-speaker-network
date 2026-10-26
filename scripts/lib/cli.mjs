// Small helpers shared by the site tools: argument parsing with a usage message, and JSON file reading with clear errors.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildPack, packName } from '../../src/sites/packs.mjs';
import { PUBLIC_DIR } from '../../src/sites/store.mjs';

/**
 * parseArgs that prints `usage` and exits 1 on unknown or malformed options instead of throwing a stack trace.
 * With `{ positionals: true }` the positional arguments come back as `_`.
 */
export function args(options, usage, { positionals: allowPositionals = false } = {}) {
  try {
    const { values, positionals } = parseArgs({ options: { ...options, help: { type: 'boolean', short: 'h' } }, allowPositionals });
    if (values.help) {
      console.log(usage);
      process.exit(0);
    }
    return allowPositionals ? { ...values, _: positionals } : values;
  } catch (error) {
    fail(`${error.message}\n\n${usage}`);
  }
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export async function readJsonFile(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    fail(`Cannot read ${path}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
  }
}

/**
 * Writes `<out>/<slug>.site-pack.zip` for a site (docs/site-packs.md) and returns its path. The site's og cards in
 * public/og/ are included when present; `verify` is the verify list for the human reviewer.
 */
export async function writePackFile(site, { out = '.', verify, mode, ogDir = new URL('og/', PUBLIC_DIR) } = {}) {
  await mkdir(out, { recursive: true });
  const path = resolve(join(out, packName(site.slug)));
  await writeFile(
    path,
    buildPack(site, { mode, verify, ogDir, generator: `peptalk-appearances ${process.argv[1]?.split('/').at(-1) ?? 'cli'}` }),
  );
  return path;
}

/** Reads an optional text file (a verify list), failing clearly when the path is wrong. */
export async function readTextFile(path) {
  if (!path) return undefined;
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    fail(`Cannot read ${path}: ${error.code ?? error.message}`);
  }
}
