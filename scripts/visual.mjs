// Visual regression check for the Next.js app: full-page screenshots of a representative set of pages (every page type
// on five sites, plus the landing page and the 404 page: 37 pages) at 1280 and 390 px, compared pixel by pixel with a baseline.
// Needs Chrome (CHROME_PATH, default /usr/bin/google-chrome).
//
//   npm run visual -- --update        build, capture and store the baseline in .visual/baseline (on the base branch)
//   npm run visual                    build, capture and compare with the baseline (on your branch); diffs in .visual/diff
//   npm run visual -- --skip-build    reuse the existing .next build
//   npm run visual -- --paths /spurs,/spurs/legends   only these pages (--update then stores only these)
//
// The baseline is not committed: 74 full-page PNGs are 50 MB or more per refresh, and screenshots depend on the
// machine's Chrome and font rendering, so a baseline from another machine would differ for no reason. Capture it
// locally from the base branch, then compare your branch against it (docs/architecture.md, "Visual regression check").
// Pages whose difference exceeds --threshold get a baseline | current | diff composite in the output directory, and
// report.json lists every page. Exit code 1 when a page differs, its status changed, or it has no baseline.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { args } from './lib/cli.mjs';

const options = args(
  {
    update: { type: 'boolean' },
    'skip-build': { type: 'boolean' },
    baseline: { type: 'string' },
    out: { type: 'string' },
    threshold: { type: 'string' },
    port: { type: 'string' },
    paths: { type: 'string' },
  },
  'Usage: npm run visual [-- --update] [--skip-build] [--baseline .visual/baseline] [--out .visual/diff] [--threshold 0.5] [--port 3300] [--paths /a,/b]',
);
const BASELINE = options.baseline ?? '.visual/baseline';
const OUT = options.out ?? '.visual/diff';
const THRESHOLD = Number(options.threshold ?? 0.5); // % of differing pixels that counts as a visual regression
const SITES = ['spurs'];
const WIDTHS = [1280, 390];
const log = (event, extra = {}) => console.log(JSON.stringify({ service: 'visual', event, ...extra }));

const { SITES: published, ROOT_SITE } = await import('../src/sites/index.mjs');
const bySlug = new Map(published.map(site => [site.slug, site]));

/** Every page type on five differently branded sites, the landing page and the 404 page. */
function representative() {
  // The landing page: `/`, or `/all` when registry.json → rootSite makes `/` redirect to a site.
  const paths = [ROOT_SITE ? '/all' : '/', '/no-such-page'];
  for (const slug of SITES) {
    const site = bySlug.get(slug);
    if (!site) continue;
    const pages = { waysToBook: true, hospitality: true, about: true, ...site.pages };
    paths.push(`/${slug}`, `/${slug}/legends`, `/${slug}/check-availability`);
    if (pages.waysToBook) paths.push(`/${slug}/ways-to-book`);
    if (pages.hospitality) paths.push(`/${slug}/hospitality`);
    if (pages.about) paths.push(`/${slug}/about`);
    const profiles = [site.featured[0], ...(site.demoProfiles ?? [])];
    for (const person of new Set(profiles)) paths.push(`/${slug}/legends/${person}`);
  }
  return paths;
}

async function startNext() {
  const port = Number(options.port ?? 3300 + Math.floor(Math.random() * 500));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PREVIEW_PASSWORD')));
  if (!options['skip-build']) {
    const built = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { stdio: 'inherit', env });
    if (built.status !== 0) throw new Error('next build failed');
  }
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    env: { ...env, PREVIEW_PUBLIC: 'true' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return { origin, stop: () => child.kill('SIGTERM') };
    } catch {
      // Not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill('SIGTERM');
  throw new Error('next start did not come up');
}

/** Status and full-page PNG (base64) in a fresh tab, so no state carries over between captures. */
async function capture(browser, origin, path, width) {
  const page = await browser.newPage();
  try {
    // No browser cache: every capture loads the page as a first visit (and a revisit's 304 would mask the status).
    await page.setCacheEnabled(false);
    await page.setViewport({ width, height: 900 });
    const response = await page.goto(origin + path, { waitUntil: 'networkidle0' });
    // Load every photo before the full-page capture (lazy <img> beyond the viewport would stay blank), then let fonts
    // settle. The first request for each optimised size is encoded on the fly, so wait for the images themselves.
    await page.evaluate(async () => {
      for (const img of document.images) img.loading = 'eager';
      const settled = img =>
        img.complete
          ? null
          : new Promise(resolve => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            });
      await Promise.race([Promise.all([...document.images].map(settled)), new Promise(resolve => setTimeout(resolve, 20000))]);
    });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width, height: Math.min(height, 16000) });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => log('network.busy', { path, width }));
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => undefined))));
    return { status: response.status(), png: await page.screenshot({ type: 'png', fullPage: true, encoding: 'base64' }) };
  } finally {
    await page.close();
  }
}

/** Pixel diff in the browser: canvas comparison of two PNGs, plus a baseline | current | diff composite. */
async function diffImages(page, before, after) {
  return page.evaluate(
    async (a, b) => {
      const load = src =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      // A 1px blur before comparing ignores anti-aliasing and photo resampling, while layout and colour changes show.
      const pixels = img => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.filter = 'blur(1px)';
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const diff = new ImageData(w, h);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const delta = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
        const hit = delta > 40;
        if (hit) changed += 1;
        diff.data[i] = hit ? 255 : pa[i] * 0.3 + 178;
        diff.data[i + 1] = hit ? 0 : pa[i + 1] * 0.3 + 178;
        diff.data[i + 2] = hit ? 0 : pa[i + 2] * 0.3 + 178;
        diff.data[i + 3] = 255;
      }
      const gap = 16;
      const out = new OffscreenCanvas(w * 3 + gap * 2, h);
      const octx = out.getContext('2d');
      octx.fillStyle = '#888';
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(ia, 0, 0);
      octx.drawImage(ib, w + gap, 0);
      octx.putImageData(diff, (w + gap) * 2, 0);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return {
        percent: (changed / (w * h)) * 100,
        sizes: [
          [ia.width, ia.height],
          [ib.width, ib.height],
        ],
        composite: btoa(bin),
      };
    },
    before,
    after,
  );
}

const fileName = (path, width) => `${path.slice(1).replaceAll('/', '_') || 'root'}@${width}.png`;
const paths = options.paths ? options.paths.split(',') : representative();
const manifestFile = join(BASELINE, 'manifest.json');
if (!options.update && !existsSync(manifestFile)) {
  console.error(`No baseline in ${BASELINE}. Capture one on the base branch first: npm run visual -- --update`);
  process.exit(1);
}
const baseline = options.update ? null : JSON.parse(await readFile(manifestFile, 'utf8'));
const revision = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || null;

const server = await startNext();
log('server.started', { origin: server.origin, mode: options.update ? 'update' : 'compare', pages: paths.length });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--hide-scrollbars'],
  protocolTimeout: 60000,
});
const report = {
  baseline: baseline && { revision: baseline.revision, captured: baseline.captured },
  revision,
  threshold: THRESHOLD,
  pages: [],
};
try {
  if (options.update) {
    await rm(BASELINE, { recursive: true, force: true });
    await mkdir(BASELINE, { recursive: true });
    const pages = {};
    for (const path of paths) {
      for (const width of WIDTHS) {
        const { status, png } = await capture(browser, server.origin, path, width);
        await writeFile(join(BASELINE, fileName(path, width)), Buffer.from(png, 'base64'));
        pages[path] = status;
      }
      log('page.captured', { path, status: pages[path] });
    }
    const manifest = { revision, captured: new Date().toISOString(), widths: WIDTHS, pages };
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    log('visual.baseline_saved', { pages: paths.length, baseline: BASELINE, revision });
  } else {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });
    const canvasPage = await browser.newPage();
    for (const path of paths) {
      const entry = { path, problems: [], pixels: {} };
      if (!Object.hasOwn(baseline.pages, path)) {
        entry.problems.push('no baseline (capture one with --update)');
        report.pages.push(entry);
        log('page.differs', entry);
        continue;
      }
      for (const width of WIDTHS) {
        const { status, png } = await capture(browser, server.origin, path, width);
        if (width === WIDTHS[0] && status !== baseline.pages[path]) entry.problems.push(`status ${baseline.pages[path]} -> ${status}`);
        const before = (await readFile(join(BASELINE, fileName(path, width)))).toString('base64');
        const result = await diffImages(canvasPage, before, png);
        entry.pixels[width] = { percent: Number(result.percent.toFixed(3)), sizes: result.sizes };
        if (result.percent > THRESHOLD) {
          const file = join(OUT, fileName(path, width));
          await writeFile(file, Buffer.from(result.composite, 'base64'));
          entry.pixels[width].file = file;
          entry.problems.push(`pixels ${width}px: ${result.percent.toFixed(2)}% differ (${file})`);
        }
      }
      report.pages.push(entry);
      log(entry.problems.length ? 'page.differs' : 'page.matches', entry);
    }
  }
} finally {
  await browser.close();
  server.stop();
}
if (options.update) process.exit(0);
const differing = report.pages.filter(entry => entry.problems.length);
await writeFile(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
log('visual.completed', {
  pages: report.pages.length,
  differing: differing.map(entry => entry.path),
  baseline: report.baseline,
  report: join(OUT, 'report.json'),
});
process.exit(differing.length ? 1 : 0);
