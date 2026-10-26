// Page-load measurement: home, roster and a profile on two sites, mobile and desktop, against `next build && next start`.
// Records LCP, CLS, TBT (lab proxy for INP), TTFB, transfer size, JS and CSS bytes and request count, as the median of
// several cold browser loads (fresh browser context, cache off) after one warm-up load. Needs Chrome (CHROME_PATH, default /usr/bin/google-chrome).
//
//   npm run perf                         build, start, measure, print a table
//   npm run perf -- --skip-build         reuse the existing .next build
//   npm run perf -- --origin http://…    measure an already running server instead
//   npm run perf -- --runs 5 --out .perf/after.json
//   npm run perf:budget                  CI: network-free run checked against scripts/perf-budgets.json (exit 1 if over)
//   npm run perf -- --offline            network-free: third-party requests are blocked and /_next/image answers a
//                                        1×1 PNG, so hotlinked Getty photos and partner marks can't make runs flaky
//   npm run perf -- --budget scripts/perf-budgets.json   check any run against the budgets
//
// Budgets (scripts/perf-budgets.json) are per profile, on the worst page: LCP, CLS, JS bytes, first-party bytes without
// images (HTML, CSS, JS, fonts: what this codebase controls, whatever Getty does) and first-party requests.
//
// Mobile follows Lighthouse's mobile profile (412×823 at DPR 1.75, 4× CPU slowdown, 150 ms RTT, 1.6 Mbps down);
// desktop uses 1350×940, 40 ms RTT, 10 Mbps and no CPU slowdown. Throttling is DevTools-applied, so absolute numbers
// are lab numbers: compare runs with each other, not with field data.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { args } from './lib/cli.mjs';
import { budgetFailures } from './lib/perf-budget.mjs';

const options = args(
  {
    'skip-build': { type: 'boolean' },
    origin: { type: 'string' },
    runs: { type: 'string' },
    out: { type: 'string' },
    paths: { type: 'string' },
    offline: { type: 'boolean' },
    budget: { type: 'string' },
  },
  'Usage: npm run perf [-- --skip-build] [--origin http://127.0.0.1:3000] [--runs 3] [--out .perf/run.json] [--paths /a,/b] [--offline] [--budget scripts/perf-budgets.json]',
);
const OFFLINE = Boolean(options.offline);
/** A 1×1 transparent PNG: what /_next/image answers in --offline mode. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const RUNS = Number(options.runs ?? 3);
const { SITES } = await import('../src/sites/index.mjs');
const profileOf = slug => {
  const site = SITES.find(candidate => candidate.slug === slug);
  // A featured person whose profile is not a look-only demo page.
  return site.featured.find(person => !(site.demoProfiles ?? []).includes(person));
};
const PATHS = options.paths
  ? options.paths.split(',')
  : ['spurs'].flatMap(slug => [`/${slug}`, `/${slug}/legends`, `/${slug}/legends/${profileOf(slug)}`]);
const PROFILES = {
  mobile: {
    viewport: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
    cpu: 4,
    network: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  },
  desktop: {
    viewport: { width: 1350, height: 940, deviceScaleFactor: 1 },
    cpu: 1,
    network: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 },
  },
};

async function startServer() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PREVIEW_PASSWORD')));
  if (!options['skip-build']) {
    const built = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { stdio: 'inherit', env });
    if (built.status !== 0) throw new Error('next build failed');
  }
  const port = 3800 + Math.floor(Math.random() * 500);
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

// Runs in the page before any script: collects LCP, layout shifts and long tasks.
const OBSERVE = () => {
  window.__perf = { lcp: 0, lcpElement: '', cls: 0, longTasks: [] };
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      window.__perf.lcp = entry.startTime;
      const el = entry.element;
      window.__perf.lcpElement = el
        ? `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').join('.')}` : ''}`
        : entry.url;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) window.__perf.longTasks.push([entry.startTime, entry.duration]);
  }).observe({ type: 'longtask', buffered: true });
};

async function measure(browser, origin, path, profile) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    if (OFFLINE) {
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin !== origin && !url.protocol.startsWith('data')) request.abort('blockedbyclient');
        else if (url.pathname === '/_next/image') request.respond({ status: 200, contentType: 'image/png', body: PIXEL });
        else request.continue();
      });
    }
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.setViewport(profile.viewport);
    await page.evaluateOnNewDocument(OBSERVE);
    const requests = new Map();
    cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
      requests.set(requestId, { type, url: response.url, bytes: 0 });
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const entry = requests.get(requestId);
      if (entry) entry.bytes = encodedDataLength;
    });
    await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 120000 });
    // Let late layout shifts and long tasks land, then end the LCP observation with a (non-scrolling) input.
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
      const tbt = window.__perf.longTasks
        .filter(([start]) => start >= fcp)
        .reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
      return {
        ttfb: nav.responseStart - nav.requestStart,
        fcp,
        lcp: window.__perf.lcp,
        lcpElement: window.__perf.lcpElement,
        cls: window.__perf.cls,
        tbt,
        domContentLoaded: nav.domContentLoadedEventEnd,
        htmlBytes: nav.encodedBodySize,
      };
    });
    const list = [...requests.values()];
    const sum = filter => list.filter(filter).reduce((total, entry) => total + entry.bytes, 0);
    const firstParty = entry => URL.canParse(entry.url) && new URL(entry.url).origin === origin;
    return {
      ...result,
      requests: list.length,
      firstPartyRequests: list.filter(firstParty).length,
      // HTML, CSS, JS and fonts from this app: the bytes the codebase controls, whatever the photo hosts do.
      transferNoImages: sum(entry => firstParty(entry) && entry.type !== 'Image'),
      transfer: sum(() => true),
      js: sum(entry => entry.type === 'Script'),
      css: sum(entry => entry.type === 'Stylesheet'),
      images: sum(entry => entry.type === 'Image'),
      fonts: sum(entry => entry.type === 'Font'),
      imageRequests: list.filter(entry => entry.type === 'Image').length,
    };
  } finally {
    await context.close();
  }
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const server = options.origin ? { origin: options.origin.replace(/\/$/, ''), stop: () => undefined } : await startServer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--hide-scrollbars'],
  protocolTimeout: 180000,
});
const results = [];
try {
  // Warm the server (first render of each route compiles nothing in production, but fills the content cache).
  for (const path of PATHS) await fetch(server.origin + path);
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const path of PATHS) {
      // One untimed load first, so server-side caches (rendered pages, optimised images) are warm, as on a CDN.
      await measure(browser, server.origin, path, profile);
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) runs.push(await measure(browser, server.origin, path, profile));
      const keys = [
        'ttfb',
        'fcp',
        'lcp',
        'cls',
        'tbt',
        'transfer',
        'js',
        'css',
        'images',
        'fonts',
        'requests',
        'firstPartyRequests',
        'transferNoImages',
        'imageRequests',
        'htmlBytes',
      ];
      const row = { profile: name, path, lcpElement: runs[0].lcpElement };
      for (const key of keys) row[key] = median(runs.map(run => run[key]));
      results.push(row);
      console.log(JSON.stringify({ service: 'perf', event: 'page.measured', ...row }));
    }
  }
} finally {
  await browser.close();
  server.stop();
}

const kb = bytes => (bytes / 1024).toFixed(0);
const table = [
  '| Profile | Page | TTFB ms | FCP ms | LCP ms | CLS | TBT ms | Transfer KB | JS KB | CSS KB | Img KB | Font KB | Requests |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map(
    r =>
      `| ${r.profile} | ${r.path} | ${r.ttfb.toFixed(0)} | ${r.fcp.toFixed(0)} | ${r.lcp.toFixed(0)} | ${r.cls.toFixed(3)} | ${r.tbt.toFixed(0)} | ${kb(r.transfer)} | ${kb(r.js)} | ${kb(r.css)} | ${kb(r.images)} | ${kb(r.fonts)} | ${r.requests} |`,
  ),
].join('\n');
console.log(table);
if (options.out) {
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify({ runs: RUNS, offline: OFFLINE, results }, null, 2)}\n`);
}
if (options.budget) {
  const budgets = JSON.parse(await readFile(options.budget, 'utf8'));
  const over = budgetFailures(results, budgets);
  console.log(OFFLINE ? 'Budgets checked on a network-free run (--offline).' : 'Budgets checked on a networked run.');
  if (over.length) {
    console.error(['Over budget:', ...over].join('\n  '));
    process.exitCode = 1;
  } else console.log(`All ${results.length} measurements are within ${options.budget}.`);
}
