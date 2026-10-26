// Node module hooks that let the admin import the Next.js page components (components/**/*.tsx) directly, so its
// preview renders with the same components as the app (see index.mjs and docs/admin.md, "Preview").
// - `.tsx` files are compiled with the SWC compiler bundled in Next.js: the engine `next/jest` uses, so no extra
//   dependency. Plain `.ts` files need nothing: Node strips their types itself.
// - `next/image` resolves to image-shim.mjs: the admin has no image optimizer, and outside a Next.js build
//   getImageProps() refuses every remote host (its config is injected by the bundler).
// - Other `next/*` imports get their `.js` file: Next.js ships no `exports` map, and Node's ESM resolver needs one.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
let compiler;

async function swc() {
  if (!compiler) {
    compiler = require('next/dist/build/swc/index.js');
    await compiler.loadBindings();
  }
  return compiler;
}

export async function resolve(specifier, context, next) {
  if (specifier === 'next/image') return { url: new URL('./image-shim.mjs', import.meta.url).href, shortCircuit: true };
  if (/^next\/[a-z/-]+$/.test(specifier)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context);
  const path = new URL(url).pathname;
  const { code } = await (await swc()).transform(await readFile(path, 'utf8'), {
    filename: path,
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' },
    module: { type: 'es6' },
    sourceMaps: 'inline',
  });
  return { format: 'module', source: code, shortCircuit: true };
}
