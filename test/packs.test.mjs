// Site packs: the zip reader/writer (including every rejection), the pack library and the pack CLIs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadSite } from '../src/sites/index.mjs';
import { buildPack, PackError, packFiles, readPack } from '../src/sites/packs.mjs';
import { shellSite } from '../src/sites/scaffold.mjs';
import { siteFiles } from '../src/sites/store.mjs';
import { readZip, writeZip, ZipError } from '../src/sites/zip.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const OG_DIR = new URL('../public/og/', import.meta.url);
const jpeg = (size = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, 7)]);

/** Offsets in a single-entry zip from writeZip (no archive comment). */
const offsets = zip => {
  const end = zip.length - 22;
  return { end, central: zip.readUInt32LE(end + 16) };
};
const rejects = (zip, pattern, limits) =>
  assert.throws(
    () => readZip(zip, limits),
    error => error instanceof ZipError && pattern.test(error.message),
  );

test('zip: entries round-trip, stored and deflated, with UTF-8 names', () => {
  const entries = [
    { name: 'site.json', data: `${JSON.stringify({ text: 'x'.repeat(2000) })}\n` },
    { name: 'og/café.jpg', data: jpeg() },
    { name: 'empty.txt', data: '' },
  ];
  const back = readZip(writeZip(entries));
  assert.deepEqual(
    back.map(entry => entry.name),
    entries.map(entry => entry.name),
  );
  for (const [i, entry] of back.entries()) assert.ok(entry.data.equals(Buffer.from(entries[i].data)), entry.name);
});

test('zip: packs open with the standard unzip tool', async t => {
  if (spawnSync('unzip', ['-v']).status !== 0) return t.skip('unzip is not installed');
  const dir = await mkdtemp(join(tmpdir(), 'appearances-zip-'));
  try {
    const file = join(dir, 'spurs.site-pack.zip');
    await writeFile(file, buildPack(loadSite('spurs'), { ogDir: OG_DIR, verify: '# Verify\n- a\n' }));
    const result = spawnSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /No errors detected/);
    assert.match(result.stdout, /og\/spurs\.jpg/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zip: unsafe names, links, duplicates and encryption are refused', () => {
  for (const [name, pattern] of [
    ['/etc/passwd', /absolute path/],
    ['C:/evil.json', /absolute path/],
    ['og/../../evil.json', /"\.\." segments|"\." or "\.\." segments/],
    ['og\\evil.jpg', /backslash/],
  ])
    rejects(writeZip([{ name, data: 'x' }]), pattern);
  rejects(
    writeZip([
      { name: 'a.json', data: '1' },
      { name: 'a.json', data: '2' },
    ]),
    /appears twice/,
  );

  const link = writeZip([{ name: 'site.json', data: '/etc/passwd' }]);
  link.writeUInt32LE((0o120777 << 16) >>> 0, offsets(link).central + 38);
  rejects(link, /symbolic link/);

  const encrypted = writeZip([{ name: 'site.json', data: '{}' }]);
  encrypted.writeUInt16LE(0x0801, offsets(encrypted).central + 8);
  rejects(encrypted, /encrypted/);
});

test('zip: zip64, unknown methods, corruption and non-zips are refused', () => {
  const zip64 = writeZip([{ name: 'a.json', data: '{}' }]);
  zip64.writeUInt32LE(0xffffffff, offsets(zip64).end + 16);
  rejects(zip64, /Zip64/);

  const method = writeZip([{ name: 'a.json', data: '{}' }]);
  method.writeUInt16LE(12, offsets(method).central + 10);
  rejects(method, /compression method 12/);

  const crc = writeZip([{ name: 'a.json', data: '{"a":1}' }]);
  crc.writeUInt32LE(0x12345678, offsets(crc).central + 16);
  rejects(crc, /checksum/);

  rejects(Buffer.from('definitely not a zip file, just some text'), /not a zip file/);
});

test('zip: size and entry caps, and declared sizes are enforced while inflating', () => {
  const big = writeZip([{ name: 'a.json', data: 'a'.repeat(100_000) }]);
  rejects(big, /larger than/, { compressed: 100 });
  rejects(big, /unpacks to more than/, { uncompressed: 50_000 });
  rejects(writeZip(Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' }))), /51 entries; at most 50/);

  // A "zip bomb": the header claims 100 bytes, the deflated data expands to 100 KB.
  const bomb = writeZip([{ name: 'a.json', data: 'a'.repeat(100_000) }]);
  bomb.writeUInt32LE(100, offsets(bomb).central + 24);
  rejects(bomb, /more than its declared size/);
});

test('pack: build → read → files equal the canonical output, og cards byte for byte', async () => {
  const site = loadSite('spurs');
  const pack = readPack(buildPack(site, { ogDir: OG_DIR, verify: '# Verify\n- Check Sandro' }), { existing: ['spurs'] });
  assert.deepEqual(pack.problems, []);
  assert.equal(pack.collision, true);
  assert.equal(pack.manifest.format, 'peptalk-appearances-site-pack');
  assert.equal(pack.manifest.mode, 'populated');
  assert.equal(pack.verify, '# Verify\n- Check Sandro\n');
  const files = packFiles(pack);
  for (const [path, text] of Object.entries(siteFiles(site))) assert.equal(files[path], text, path);
  const cards = Object.keys(files).filter(path => path.startsWith('public/og/'));
  assert.ok(cards.includes('public/og/spurs.jpg') && cards.length === 6, cards.join());
  for (const path of cards) assert.ok(files[path].equals(await readFile(join(repo, path))), path);
});

test('pack: unreadable packs throw a clear PackError; content problems are listed', () => {
  const site = shellSite({ slug: 'wimbledon', name: 'Wimbledon' });
  const good = readZip(buildPack(site));
  const repack = (change = entries => entries) => writeZip(change(good.map(entry => ({ ...entry }))));
  const fails = (zip, pattern) =>
    assert.throws(
      () => readPack(zip),
      error => error instanceof PackError && pattern.test(error.message),
    );

  fails(
    repack(entries => [...entries, { name: 'scripts/evil.mjs', data: 'x' }]),
    /files a site pack may not: scripts\/evil\.mjs/,
  );
  fails(
    repack(entries => entries.filter(entry => entry.name !== 'manifest.json')),
    /no manifest\.json/,
  );
  fails(
    repack(entries => entries.filter(entry => entry.name !== 'people.json')),
    /missing people\.json/,
  );
  const manifest = JSON.parse(good[0].data);
  fails(
    repack(entries => [{ name: 'manifest.json', data: JSON.stringify({ ...manifest, version: 2 }) }, ...entries.slice(1)]),
    /version 2 site pack/,
  );
  fails(
    repack(entries => [{ name: 'manifest.json', data: '{' }, ...entries.slice(1)]),
    /manifest\.json in the pack is not valid JSON/,
  );
  fails(Buffer.from('nope'), /Not a usable site pack/);

  const broken = repack(entries => [
    ...entries.map(entry =>
      entry.name === 'site.json'
        ? { ...entry, data: JSON.stringify({ ...JSON.parse(entry.data), theme: { ...site.theme, brand: 'green' } }) }
        : entry,
    ),
    { name: 'og/wimbledon.jpg', data: 'not a jpeg' },
    { name: 'og/spurs.jpg', data: jpeg() },
  ]);
  const pack = readPack(broken, { existing: ['spurs'], redirects: { wimbledon: 'spurs' } });
  const problems = pack.problems.join('\n');
  assert.match(problems, /theme\.brand must be a #rrggbb colour/);
  assert.match(problems, /og\/wimbledon\.jpg is not a JPEG/);
  assert.match(problems, /og\/spurs\.jpg is not an Open Graph card for "wimbledon"/);
  assert.match(problems, /old slug that redirects to "spurs"/);
  assert.equal(pack.collision, false);
});

/** A throwaway copy of the repository's code and content, so the CLIs write nowhere real. */
async function scratchRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'appearances-cli-'));
  for (const part of ['src', 'scripts', 'public', 'lib']) await cp(join(repo, part), join(dir, part), { recursive: true });
  const run = (script, ...argv) => spawnSync(process.execPath, [join(dir, 'scripts', script), ...argv], { cwd: dir, encoding: 'utf8' });
  return { dir, run, read: path => readFile(join(dir, path)), close: () => rm(dir, { recursive: true, force: true }) };
}

test('CLI: new-site --pack, import-pack (inactive, collisions, --force) and pack-site round-trip', async () => {
  const scratch = await scratchRepo();
  try {
    const registryBefore = (await scratch.read('src/sites/registry.json')).toString();
    const made = scratch.run(
      'new-site.mjs',
      '--slug',
      'wimbledon',
      '--name',
      'Wimbledon',
      '--brand',
      '#006633',
      '--pack',
      '--out',
      'packs',
    );
    assert.equal(made.status, 0, made.stderr);
    assert.equal((await scratch.read('src/sites/registry.json')).toString(), registryBefore, '--pack never touches the registry');
    const pack = join(scratch.dir, 'packs', 'wimbledon.site-pack.zip');

    const imported = scratch.run('import-pack.mjs', pack);
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /Imported Wimbledon as src\/sites\/wimbledon\/ \(inactive/);
    assert.equal(JSON.parse(await scratch.read('src/sites/wimbledon/site.json')).active, false);
    assert.equal(JSON.parse(await scratch.read('src/sites/registry.json')).order.at(-1), 'wimbledon');

    const again = scratch.run('import-pack.mjs', pack);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists\. Pass --force/);

    // Pack an existing site and import it over itself: nothing changes, og cards included.
    const before = {};
    for (const file of ['site', 'people', 'images']) before[file] = (await scratch.read(`src/sites/spurs/${file}.json`)).toString();
    assert.equal(scratch.run('pack-site.mjs', '--slug', 'spurs', '--out', 'packs').status, 0);
    const forced = scratch.run('import-pack.mjs', join(scratch.dir, 'packs', 'spurs.site-pack.zip'), '--force');
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /\(live, 6 og cards\)/, 'a replaced site keeps its live state');
    for (const file of ['site', 'people', 'images'])
      assert.equal((await scratch.read(`src/sites/spurs/${file}.json`)).toString(), before[file], file);
    assert.ok((await scratch.read('public/og/spurs.jpg')).equals(await readFile(join(repo, 'public/og/spurs.jpg'))));
    const registry = JSON.parse(await scratch.read('src/sites/registry.json'));
    assert.equal(registry.order[0], 'spurs', 'registry order kept');

    assert.equal(scratch.run('validate-content.mjs').status, 0);
  } finally {
    await scratch.close();
  }
});
