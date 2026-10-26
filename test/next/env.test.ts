// Every environment variable the code reads is documented: in .env.example (for local runs) and in docs/vercel.md (the
// Vercel reference). A new `process.env.X` (or `env.X` on a passed-in environment) without both fails here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOTS = ['app', 'components', 'lib', 'scripts', 'src', 'proxy.ts', 'next.config.ts'];
const CODE = /\.(?:ts|tsx|mjs|js)$/;

function files(path: string): string[] {
  if (statSync(path).isFile()) return CODE.test(path) ? [path] : [];
  return readdirSync(path).flatMap(name => (name === 'node_modules' ? [] : files(join(path, name))));
}

/** Names read as `process.env.X`, `env.X` / `env?.X`, or destructured from `process.env` / `env`. */
export function envReads(source: string): string[] {
  const names = new Set<string>();
  for (const [, name] of source.matchAll(/\benv\??\.([A-Z][A-Z0-9_]+)\b/g)) names.add(name);
  for (const [, keys] of source.matchAll(/\{([^{}]*)\}\s*=\s*(?:process\.)?env\b/g))
    for (const [, name] of keys.matchAll(/\b([A-Z][A-Z0-9_]+)\s*(?=[:,}]|$)/g)) names.add(name);
  return [...names];
}

const reads = new Map<string, string>();
for (const file of ROOTS.flatMap(files))
  for (const name of envReads(readFileSync(file, 'utf8'))) if (!reads.has(name)) reads.set(name, file);

test('the scanner finds the ways the code reads the environment', () => {
  const sample = 'process.env.AA_B; env.CC; env?.DD_1; const { EE: e, FF } = env; const { GG } = process.env;';
  assert.deepEqual(envReads(sample).sort(), ['AA_B', 'CC', 'DD_1', 'EE', 'FF', 'GG']);
  for (const name of ['PREVIEW_PASSWORD', 'ENQUIRY_WEBHOOK_URL', 'TRACKING_GTM_ID', 'HUB_HOST', 'GITHUB_TOKEN'])
    assert.ok(reads.has(name), name);
});

test('every environment variable read in code is in .env.example and docs/vercel.md', () => {
  const example = readFileSync('.env.example', 'utf8');
  const vercel = readFileSync('docs/vercel.md', 'utf8');
  for (const [name, file] of reads) {
    assert.match(example, new RegExp(`\\b${name}\\b`), `${name} (read in ${file}) is missing from .env.example`);
    assert.match(vercel, new RegExp(`\`${name}\``), `${name} (read in ${file}) is missing from docs/vercel.md`);
  }
  // Per-site passwords are read by prefix, so they are documented by pattern.
  assert.match(example, /PREVIEW_PASSWORD_<SLUG>|PREVIEW_PASSWORD_SPURS/);
  assert.match(vercel, /`PREVIEW_PASSWORD_<SLUG>`/);
});
