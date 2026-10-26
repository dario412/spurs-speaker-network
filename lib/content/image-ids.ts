// Stable image ids for the `images` map. Getty comps keep their Getty id (today's images.json keys, so existing
// licence approvals still match); any other URL (Cloudflare R2, a CMS asset host) is keyed by its host and path,
// e.g. `media.example.com/people/dele-alli/hero.jpg`. The id follows the URL: a replaced file at a new URL is a new
// id, so it needs its own licence approval (src/sites/licences.mjs compares the approved URL with the one in use).
const GETTY = /^https:\/\/media\.gettyimages\.com\/id\/(\d+)\//;

export function imageIdFor(url: string): string {
  const getty = GETTY.exec(url);
  if (getty) return getty[1];
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`;
}

/** `https://host[:port]` origins from a comma- or space-separated list; throws on anything that isn't one. */
export function parseOrigins(value: string | undefined, name: string): string[] {
  const origins: string[] = [];
  for (const entry of (value ?? '').split(/[\s,]+/).filter(Boolean)) {
    const url = URL.canParse(entry) ? new URL(entry) : null;
    if (url?.protocol !== 'https:' || url.origin !== entry.replace(/\/$/, ''))
      throw new Error(`${name}: "${entry}" is not an https origin (https://host, no path)`);
    origins.push(url.origin);
  }
  return [...new Set(origins)];
}
