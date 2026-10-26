// Renders the 1200x630 Open Graph (link preview) cards into public/og/ with headless Chrome.
// Usage: npm run og-cards   (needs Chrome; set CHROME_PATH if it is not at a standard location)
// Re-run after changing a site's name, theme, hero image or section titles, and commit the JPEGs.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { VOCAB } from '../src/copy/defaults.mjs';
import { SITES } from '../src/sites/index.mjs';

const out = new URL('../public/og/', import.meta.url);
const fonts = fileURLToPath(new URL('../public/fonts/', import.meta.url));
const logo = fileURLToPath(new URL('../public/peptalk/logo.png', import.meta.url));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fontFaces = `
@font-face{font-family:Outfit;src:url(file://${fonts}outfit-latin.woff2);font-weight:400 900}
@font-face{font-family:'Barlow Condensed';src:url(file://${fonts}barlow-condensed-800.woff2);font-weight:800}
@font-face{font-family:Sofia;src:url(file://${fonts}sofia-pro-500.woff2);font-weight:500}
@font-face{font-family:Recoleta;src:url(file://${fonts}recoleta-alt-400.woff2);font-weight:400}
@font-face{font-family:Recoleta;src:url(file://${fonts}recoleta-alt-500.woff2);font-weight:500}`;

function siteCard(site, kicker, title) {
  const t = site.theme;
  const mark =
    site.navMark === 'wordmark' && site.marks.wordmark
      ? `<img class="mark wm" src="${site.marks.wordmark}" alt="">`
      : site.marks.crest
        ? `<img class="mark crest" src="${site.marks.crest}" alt="">`
        : '';
  const display = t.display.includes('Barlow') ? "'Barlow Condensed',Outfit,sans-serif" : 'Outfit,sans-serif';
  return `<!doctype html><html><head><style>${fontFaces}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;display:grid;grid-template-columns:640px 560px;font-family:Outfit,sans-serif;background:#fff}
.l{background:#fff;padding:56px 56px 40px;display:flex;flex-direction:column;border-top:14px solid ${t.brand}}
.mark{display:block;align-self:flex-start;object-fit:contain}.wm{height:40px;width:auto}.crest{height:92px;width:auto}
.k{margin-top:34px;font:700 20px/1 Outfit;letter-spacing:.14em;text-transform:uppercase;color:${t.brand}}
h1{margin-top:16px;font:800 74px/.95 ${display};text-transform:uppercase;color:${t.ink};letter-spacing:-.01em}
.p{margin-top:auto;display:flex;align-items:center;gap:14px;font:600 20px Outfit;color:#555}
.p img{height:26px}
.r{background:url("${site.images[site.home.hero.image]}") center 22%/cover;position:relative}
.r::after{content:"";position:absolute;inset:0;box-shadow:inset 14px 0 0 ${t.dark}}
</style></head><body><div class="l">${mark}<div class="k">${esc(kicker)}</div><h1>${esc(title)}</h1>
<div class="p">Powered by <img src="file://${logo}" alt="PepTalk"></div></div><div class="r"></div></body></html>`;
}

function landingCard() {
  const photos = SITES.map(site => `<div style="background:url('${site.images[site.home.hero.image]}') center 22%/cover"></div>`).join('');
  return `<!doctype html><html><head><style>${fontFaces}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;display:grid;grid-template-columns:660px 540px;background:#edf3fb}
.l{padding:60px 56px 44px;display:flex;flex-direction:column}
.l img{height:44px;width:auto;align-self:flex-start}
.k{margin-top:40px;font:500 20px Sofia;letter-spacing:.14em;text-transform:uppercase;color:#3971c0}
h1{margin-top:14px;font:500 64px/1.2 Recoleta;color:#191d63}
.s{margin-top:auto;font:500 22px Sofia;color:#3d3f4d}
.r{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6px;background:#191d63;padding:6px}
</style></head><body><div class="l"><img src="file://${logo}" alt="PepTalk"><div class="k">Appearances</div>
<h1>Book sporting greats for your next event</h1><div class="s">${esc(SITES.map(site => site.short).join(' · '))}</div></div><div class="r">${photos}</div></body></html>`;
}

const cards = [['appearances', landingCard()]];
for (const site of process.argv.includes('--landing-only') ? [] : SITES) {
  // v: the site's wording (defaults merged with site.vocab); nl: its nav labels.
  const v = { ...VOCAB, ...site.vocab };
  const nl = { ...VOCAB.navLabels, ...site.vocab?.navLabels };
  cards.push(
    [site.slug, siteCard(site, site.vocab?.officialLabel ?? `Official ${site.orgName} platform`, site.platform)],
    [`${site.slug}-legends`, siteCard(site, site.platform, `${site.short} ${v.legendsNoun}`)],
    [`${site.slug}-ways-to-book`, siteCard(site, site.platform, nl.ways)],
    [`${site.slug}-hospitality`, siteCard(site, site.platform, v.hospitalityTitle)],
    [`${site.slug}-about`, siteCard(site, site.platform, v.aboutTitle ?? `About ${site.platform}`)],
    [`${site.slug}-check-availability`, siteCard(site, site.platform, 'Check availability')],
  );
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const found = candidates.find(path => path && existsSync(path));
  if (!found) throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH.');
  return found;
}

await mkdir(out, { recursive: true });
// A private temp dir per run: no clash with a concurrent run, no predictable shared path.
const tmpDir = await mkdtemp(join(tmpdir(), 'appearances-og-'));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromePath(),
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  const tmp = join(tmpDir, 'card.html');
  for (const [name, html] of cards) {
    await writeFile(tmp, html);
    // Load from disk so local fonts resolve; remote marks and photos get a bounded wait.
    await page.goto(`file://${tmp}`, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]));
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 15000 })
      .catch(() => console.warn(`network not idle for ${name}; rendering anyway`));
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.jpg`, out)), type: 'jpeg', quality: 82 });
  }
} finally {
  await browser?.close();
  await rm(tmpDir, { recursive: true, force: true });
}
console.log(JSON.stringify({ service: 'appearances', event: 'og_cards.rendered', cards: cards.length }));
