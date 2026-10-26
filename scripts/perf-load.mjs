// Server-side cost of a page: sequential TTFB (median, p95) and throughput under concurrency, against a running server.
// Complements scripts/perf.mjs (browser metrics). Used to compare rendering strategies (docs/architecture.md).
//
//   node scripts/perf-load.mjs --origin http://127.0.0.1:3000 [--paths /spurs,/spurs/legends] [--requests 300] [--concurrency 20]
import { args } from './lib/cli.mjs';

const options = args(
  { origin: { type: 'string' }, paths: { type: 'string' }, requests: { type: 'string' }, concurrency: { type: 'string' } },
  'Usage: node scripts/perf-load.mjs --origin http://127.0.0.1:3000 [--paths /a,/b] [--requests 300] [--concurrency 20]',
);
if (!options.origin) {
  console.error('--origin is required');
  process.exit(1);
}
const origin = options.origin.replace(/\/$/, '');
const paths = (options.paths ?? '/spurs,/spurs/legends,/spurs/legends/dele-alli').split(',');
const total = Number(options.requests ?? 300);
const concurrency = Number(options.concurrency ?? 20);
const pct = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

async function timed(url) {
  const started = performance.now();
  const res = await fetch(url);
  const reader = res.body.getReader();
  const { done } = await reader.read();
  const ttfb = performance.now() - started;
  if (!done) while (!(await reader.read()).done);
  return { ttfb, total: performance.now() - started, status: res.status };
}

for (const path of paths) {
  for (let i = 0; i < 10; i += 1) await timed(origin + path);
  const sequential = [];
  for (let i = 0; i < 50; i += 1) sequential.push((await timed(origin + path)).ttfb);
  let next = 0;
  const latencies = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        next += 1;
        latencies.push((await timed(origin + path)).total);
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  console.log(
    JSON.stringify({
      service: 'perf-load',
      path,
      ttfbMedianMs: Number(pct(sequential, 0.5).toFixed(1)),
      ttfbP95Ms: Number(pct(sequential, 0.95).toFixed(1)),
      requestsPerSecond: Number((total / seconds).toFixed(0)),
      loadedP95Ms: Number(pct(latencies, 0.95).toFixed(1)),
      concurrency,
    }),
  );
}
