// Page shell for every admin screen: header with the storage mode, breadcrumbs, flash message and site tabs.
import { licenceStatus } from '../../sites/licences.mjs';
import { verificationStatus } from '../../sites/verification.mjs';
import { esc } from './html.mjs';

/**
 * @param {{ title: string, body: string, crumbs?: [string, string?][], flash?: { text: string, kind?: string,
 *   link?: { href: string, label: string } }, storage: { label: string, detail: string, link?: object } }} options
 */
export function layout({ title, body, crumbs = [], flash, storage }) {
  const trail = [['Sites', '/'], ...crumbs]
    .map(([label, href], i, all) =>
      href && i < all.length - 1 ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`,
    )
    .join('<span class="sep">/</span>');
  const linkHtml = link => (link ? ` <a href="${esc(link.href)}" rel="noopener">${esc(link.label)}</a>` : '');
  const flashHtml = flash
    ? `<div class="alert ${esc(flash.kind ?? 'ok')}" role="status">${esc(flash.text)}${[flash.link, ...(flash.links ?? [])].map(linkHtml).join('')}</div>`
    : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Appearances admin</title>
<link rel="icon" href="/assets/favicon.png">
<link rel="stylesheet" href="/assets/admin.css">
<script src="/assets/admin.js" defer></script>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="logo" href="/"><b>PepTalk</b> Appearances <span>admin</span></a>
  <p class="storage" title="${esc(storage.detail)}"><span class="badge accent">${esc(storage.label)}</span>${linkHtml(storage.link)}</p>
</div></header>
<main class="wrap">
<nav class="crumbs" aria-label="Breadcrumb">${trail}</nav>
${flashHtml}
${body}
</main>
<footer class="wrap foot"><p>${esc(storage.detail)}</p></footer>
</body>
</html>
`;
}

const TABS = [
  ['Site settings', ''],
  ['People', '/people'],
  ['Licences', '/licences'],
  ['Verification', '/verification'],
  ['Raw JSON', '/raw/site'],
];

/**
 * One amber banner, never blocking, on every site page while licences or verification are outstanding: one line each.
 * A tab's own line is left out on that tab, which already shows the detail.
 */
function alertsBanner(site, current) {
  if (!site.images || !site.people) return '';
  const lines = [];
  const licences = licenceStatus(site);
  if (current !== 'Licences' && licences.approved < licences.total) {
    const changed = licences.stale.length ? ` (${licences.stale.length} changed since approval)` : '';
    lines.push(
      `${licences.total - licences.approved} of ${licences.total} pictures and marks are not licensed yet${changed}. <a href="/sites/${esc(site.slug)}/licences?show=unapproved">Review licences</a>`,
    );
  }
  const checks = verificationStatus(site);
  if (current !== 'Verification' && checks.verified < checks.total) {
    const changed = checks.stale ? ` (${checks.stale} changed since verification)` : '';
    lines.push(
      `${checks.total - checks.verified} of ${checks.total} pages and profiles are not verified yet${changed}. <a href="/sites/${esc(site.slug)}/verification?show=incomplete">Review checklists</a>`,
    );
  }
  if (!lines.length) return '';
  return `<div class="alert warn banner" role="status"><p>${lines.join('</p><p>')}</p><p class="hint">This never blocks publishing, but clear it before launch.</p></div>`;
}

/** Heading and tabs shared by every per-site screen. */
export function siteHeader(site, current) {
  const base = `/sites/${site.slug}`;
  const tabs = TABS.map(
    ([label, path]) => `<a href="${esc(base + path)}"${label === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`,
  ).join('');
  const state = site.active === false ? '<span class="badge muted">Inactive</span>' : '<span class="badge ok">Active</span>';
  return `<div class="page-head"><div><h1>${esc(site.orgName ?? site.slug)} ${state}</h1><p class="sub">/${esc(site.slug)}</p></div><a class="btn" href="/preview/${esc(site.slug)}" target="_blank" rel="noopener">Preview</a></div>
<nav class="tabs" aria-label="Site sections">${tabs}</nav>
${alertsBanner(site, current)}`;
}

export const errorPage = (status, message) =>
  `<div class="page-head"><h1>${esc(status === 404 ? 'Not found' : 'Something went wrong')}</h1></div><div class="alert error"><p>${esc(message)}</p></div><p><a href="/">Back to all sites</a></p>`;
