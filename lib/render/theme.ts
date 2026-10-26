// Per-site stylesheets: theme variables and crest treatment.
// Served at /<slug>/site.css (and /landing.css), so pages carry no inline styles. Uses the stored (undecoded) content.
// There is no per-image map: photos are <img> elements (lib/render/images.ts), which keeps site.css under 1 KB.
import type { Site } from '../content/types.ts';

// The text badge goes into a CSS string, so only capitals, digits and spaces survive.
const crestText = (text: unknown) =>
  String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '');

export function themeFor(site: Site): string {
  const t = site.theme;
  const s = `.site-${site.slug}`;
  const sizes = `${s} .crest.xs{width:16px;height:19px}${s} .crest.md{width:24px;height:28px}${s} .crest.lg{width:62px;height:73px}${s} .crest.xl{width:110px;height:130px;margin:0}${s} .crest.nav{width:40px;height:47px}`;
  let crest: string;
  if (!site.marks.crest) {
    crest = `${s} .crest{background:var(--brand);border-radius:6px;display:inline-grid;place-items:center;color:#fff;font:800 9px/1 var(--body);letter-spacing:.04em}
${s} .crest::after{content:"${crestText(site.crestFallback)}"}
${s} .util .crest,${s} .official .crest,${s} footer .crest,${s} .closing .crest{background:#fff;color:var(--brand)}
${sizes}${s} .crest.xs{font-size:6px}${s} .crest.md{font-size:8px;border-radius:999px}${s} .crest.lg{font-size:18px}${s} .crest.xl{font-size:30px}${s} .crest.nav{font-size:12px}`;
  } else if (site.crestOnLight) {
    const on = { bar: 'full', brand: 'full', dark: 'full', ...site.crestOn };
    const sel: Record<string, string> = { bar: '.util .crest', brand: '.official .crest', dark: `footer .crest,${s} .closing .crest` };
    const rules = Object.entries(on)
      .filter(([, value]) => value !== 'full')
      .map(([key, value]) => `${s} ${sel[key]}{${value === 'white' ? 'filter:brightness(0) invert(1)' : 'display:none'}}`)
      .join('');
    crest = `${s} .crest{background:url("${site.marks.crest}") center/contain no-repeat transparent;border-radius:0}\n${sizes}\n${rules}`;
  } else {
    crest = `${s} .crest{background-image:url("${site.marks.crest}")}`;
  }
  const st = {
    buttonRadius: '999px',
    buttonCase: 'none',
    headingCase: 'uppercase',
    headingStyle: 'normal',
    cardRadius: '16px',
    ...site.style,
  };
  const neutrals = t.tint
    ? `;--tint:${t.tint};--line:${t.line};--blue-60:${t.muted};--blue-80:${t.mutedDark};--blue-40:${t.faint ?? t.muted}`
    : '';
  const vars = `--brand:${t.brand};--ink:${t.ink};--dark:${t.dark};--bar:${t.bar};--display:${t.display};--btn-radius:${st.buttonRadius};--btn-case:${st.buttonCase};--head-case:${st.headingCase};--head-style:${st.headingStyle};--card-radius:${st.cardRadius}${neutrals}`;
  const clip = st.buttonClip
    ? `\n${s} .btn{border-radius:0;clip-path:polygon(4px 0,calc(100% - 4px) 0,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0 calc(100% - 4px),0 4px)}`
    : '';
  return `${s}{${vars}}\n${crest}${clip}\n`;
}

/** /<slug>/site.css */
export const siteStylesheet = (site: Site): string => themeFor(site);

/** /landing.css: every site's theme (the landing tiles use each site's colours and crest). */
export const landingStylesheet = (sites: Site[]): string => sites.map(themeFor).join('');
