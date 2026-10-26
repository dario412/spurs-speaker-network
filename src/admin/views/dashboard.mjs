// Dashboard: every site in registry order (inactive ones too) with publishing actions, plus the New site form.
import { licenceStatus } from '../../sites/licences.mjs';
import { verificationStatus } from '../../sites/verification.mjs';
import { action, badge, check, colour, csrfField, esc, field, problemsBox } from './html.mjs';
import { uploadForm } from './packs.mjs';

function licences(site, base) {
  const { total, approved } = licenceStatus(site);
  const flag = approved < total ? ` ${badge(`${total - approved} unlicensed`, 'warn')}` : '';
  return `<a href="${esc(base)}/licences${approved < total ? '?show=unapproved' : ''}">${approved}/${total}</a>${flag}`;
}

function verified(site, base) {
  const { total, verified: done } = verificationStatus(site);
  const flag = done < total ? ` ${badge(`${total - done} to verify`, 'warn')}` : '';
  return `<a href="${esc(base)}/verification${done < total ? '?show=incomplete' : ''}">${done}/${total}</a>${flag}`;
}

/**
 * The first row: the PepTalk landing page as the root, i.e. no root site (registry.json without rootSite), so `/` serves
 * the landing page. Shows the Root badge when it is the active choice, else a Make root action.
 */
function landingRow({ registry, csrf }) {
  const root = !registry.rootSite;
  const href = root ? '/preview/' : '/preview/all';
  return `<tr class="landing-row">
<td data-label="Site"><b>Landing page (no root site)</b><br><small>${root ? '/' : '/all'} · every active site, master password only</small></td>
<td data-label="Status">${root ? badge('Root', 'accent') : badge('Not root', 'muted')}</td>
<td data-label="People" colspan="3"><small>${root ? '/ serves the landing page; /all answers 301 to /.' : `/ redirects to /${esc(registry.rootSite)}; the landing page is at /all.`}</small></td>
<td data-label="Actions"><div class="actions"><a class="btn" href="${href}" target="_blank" rel="noopener">Preview</a>${root ? '' : action({ href: '/root/landing', csrf, label: 'Make root', title: 'Serve the landing page at / (no root site)' })}</div></td>
</tr>`;
}

const count = (items = []) => `${items.filter(item => item.active !== false).length}/${items.length}`;

function row(site, i, { registry, csrf, last }) {
  const slug = site.slug;
  const base = `/sites/${slug}`;
  if (site.broken)
    return `<tr><td data-label="Site"><b>${esc(slug)}</b></td><td data-label="Status" colspan="4">${badge('Unreadable', 'error')} <small>${esc(site.broken)}</small></td><td data-label="Actions"><a class="btn" href="${esc(base)}/raw/site">Raw JSON</a></td></tr>`;
  const root = registry.rootSite === slug;
  const active = site.active !== false;
  const status = [
    active ? badge('Active', 'ok') : badge('Inactive', 'muted'),
    site.status === 'shell' ? badge('Shell', 'warn') : badge('Populated'),
    root ? badge('Root', 'accent') : '',
    site.indexable === true ? badge('Indexable', 'live') : '',
  ].join(' ');
  const actions = [
    `<a class="btn primary" href="${esc(base)}">Edit</a>`,
    `<a class="btn" href="/preview/${esc(slug)}" target="_blank" rel="noopener">Preview</a>`,
    `<a class="btn" href="${esc(base)}/pack" download title="Download this site as a .site-pack.zip">Download pack</a>`,
    active
      ? action({ href: `${base}/active`, csrf, label: 'Deactivate', fields: { active: 'off' } })
      : action({ href: `${base}/active`, csrf, label: 'Activate', fields: { active: 'on' } }),
    root ? '' : action({ href: `${base}/root`, csrf, label: 'Make root' }),
    action({ href: `${base}/move`, csrf, label: '↑', fields: { direction: 'up' }, disabled: i === 0, title: 'Move up' }),
    action({ href: `${base}/move`, csrf, label: '↓', fields: { direction: 'down' }, disabled: last, title: 'Move down' }),
  ].join('');
  return `<tr>
<td data-label="Site"><a href="${esc(base)}"><b>${esc(site.orgName)}</b></a><br><small>/${esc(slug)} · ${esc(site.platform)}</small></td>
<td data-label="Status">${status}</td>
<td data-label="People"><a href="${esc(base)}/people">${count(site.people)}</a></td>
<td data-label="Licences">${licences(site, base)}</td>
<td data-label="Verified">${verified(site, base)}</td>
<td data-label="Actions"><div class="actions">${actions}</div></td>
</tr>`;
}

export const NEW_SITE_DEFAULTS = { brand: '#000a3c', ink: '#11111f', dark: '#11111f', bar: '#11111f' };

function newSiteForm({ csrf, values = {}, problems = [] }) {
  const v = { ...NEW_SITE_DEFAULTS, ...values };
  return `<section class="card" id="new-site"><h2>New site</h2>
<p class="intro">Creates a branded shell with placeholder people and "Photo to come" images. It stays inactive (not built or deployed) until you activate it or tick Publish now.</p>
${problemsBox(problems)}
<form method="post" action="/sites">${csrfField(csrf)}
<div class="grid">
${field({ label: 'Slug', name: 'slug', value: v.slug, placeholder: 'man-utd', hint: 'URL folder: lowercase letters, digits and hyphens', required: true })}
${field({ label: 'Organisation name', name: 'name', value: v.name, placeholder: 'Manchester United', required: true })}
${field({ label: 'Short name', name: 'short', value: v.short, placeholder: 'United', hint: 'Used in copy; defaults to the organisation name' })}
${field({ label: 'Wordmark URL', name: 'wordmark', value: v.wordmark, placeholder: 'https://…', hint: 'Optional; the organisation’s own file' })}
${field({ label: 'Crest URL', name: 'crest', value: v.crest, placeholder: 'https://…', hint: 'Optional; a text badge stands in without one' })}
</div>
<div class="grid colours">
${colour({ label: 'Brand', name: 'brand', value: v.brand })}
${colour({ label: 'Ink', name: 'ink', value: v.ink })}
${colour({ label: 'Dark', name: 'dark', value: v.dark })}
${colour({ label: 'Bar', name: 'bar', value: v.bar })}
</div>
${check({ label: 'Publish now', name: 'publish', checked: v.publish, hint: 'Leave unticked to build it privately first' })}
<p><button class="btn primary" type="submit">Create site</button></p>
</form></section>`;
}

/**
 * @param {{ registry: object, sites: object[], csrf: string, problems?: string[], newSite?: { values?: object,
 *   problems?: string[] } }} options
 */
export function dashboard({ registry, sites, csrf, problems = [], newSite = {}, upload = {} }) {
  const rows = [
    landingRow({ registry, csrf }),
    ...sites.map((site, i) => row(site, i, { registry, csrf, last: i === sites.length - 1 })),
  ].join('\n');
  const home = registry.rootSite ? `/ redirects to the root site, /${esc(registry.rootSite)}` : '/ serves the landing page (no root site)';
  return `<div class="page-head"><div><h1>Sites</h1><p class="sub">${sites.length} sites in registry order. Inactive sites are left out of the build. Root: ${home}. Indexable sites are public and open to search engines${registry.indexable === true ? '; the hub pages (the landing page, /terms, /privacy) are indexable too (registry.json)' : ''}.</p></div>
<div class="head-actions"><a class="btn" href="${registry.rootSite ? '/preview/all' : '/preview/'}" target="_blank" rel="noopener">Preview landing</a><a class="btn" href="/registry">Registry JSON</a><a class="btn" href="#upload-pack">Upload a site pack</a><a class="btn primary" href="#new-site">New site</a></div></div>
${problemsBox(problems)}
<div class="table-wrap"><table class="sites">
<thead><tr><th>Site</th><th>Status</th><th>People</th><th>Licences</th><th>Verified</th><th>Actions</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<div class="new-site">${newSiteForm({ csrf, ...newSite })}${uploadForm({ csrf, ...upload })}</div>`;
}
