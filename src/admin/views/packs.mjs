// Site pack review: what an uploaded pack contains, whether it can be imported, and the import options.
import { licenceStatus } from '../../sites/licences.mjs';
import { verificationStatus } from '../../sites/verification.mjs';
import { badge, check, csrfField, esc, problemsBox } from './html.mjs';
import { markdown } from './markdown.mjs';

/** The "Upload a site pack" card on the dashboard. */
export function uploadForm({ csrf, problems = [] }) {
  return `<section class="card" id="upload-pack"><h2>Upload a site pack</h2>
<p class="intro">A <code>&lt;slug&gt;.site-pack.zip</code> from the <code>/new-appearances-site --pack</code> skill, <code>npm run new-site -- … --pack</code>, <code>npm run assemble-site -- … --pack</code> or another checkout's "Download pack". You review it before anything is written.</p>
${problemsBox(problems, 'This pack cannot be used:')}
<form method="post" action="/packs" enctype="multipart/form-data">${csrfField(csrf)}
<div class="field"><label for="f-pack">Site pack (.zip, up to 15 MB)</label><input id="f-pack" type="file" name="pack" accept=".zip,application/zip" required></div>
<p><button class="btn primary" type="submit">Upload and review</button></p>
</form></section>`;
}

const row = (label, value) => `<tr><th scope="row">${esc(label)}</th><td>${value}</td></tr>`;

/**
 * @param {{ id: string, entry: { pack: object, filename: string }, csrf: string, collision: boolean, problems?: string[] }} options
 */
export function packReview({ id, entry, csrf, collision, problems = [] }) {
  const { pack, filename } = entry;
  const { manifest, site, og, verify } = pack;
  const base = `/packs/${id}`;
  const blocking = [...pack.problems, ...problems];
  const counts = (site.roles ?? [])
    .map(role => `${esc(role.label)}: <b>${(site.people ?? []).filter(person => person.role === role.key).length}</b>`)
    .join(' · ');
  const licences = licenceStatus(site);
  const checks = verificationStatus(site);
  const cards = Object.keys(og).length
    ? `<div class="og-cards">${Object.keys(og)
        .map(name => `<figure><img src="${esc(`${base}/og/${name}`)}" alt="" loading="lazy"><figcaption>${esc(name)}</figcaption></figure>`)
        .join('')}</div>`
    : '<small class="hint">None. Run <code>npm run og-cards</code> after import (needs Chrome).</small>';
  const collisionBox = collision
    ? `<div class="alert warn" role="status"><b>/${esc(site.slug)} already exists.</b> Tick "Replace existing site" to overwrite its content files and og cards. Its place in the site order, its live/inactive state and any licence approvals or checks this pack lacks are kept.</div>`
    : '';
  const disabled = blocking.length ? ' disabled' : '';
  return `<div class="page-head"><div><h1>Review site pack</h1><p class="sub">${esc(filename)} · nothing has been written yet</p></div>
<div class="head-actions"><a class="btn" href="${esc(`${base}/preview/${site.slug}`)}" target="_blank" rel="noopener">Preview the site</a></div></div>
${problemsBox(blocking, 'This pack cannot be imported until these are fixed (in the pack, then upload it again):')}
${collisionBox}
<section class="card"><h2>${esc(site.orgName ?? site.slug)} ${badge(manifest.mode === 'shell' ? 'Shell' : 'Populated', manifest.mode === 'shell' ? 'warn' : '')}</h2>
<div class="table-wrap"><table class="compact facts">
${row('Slug', `/${esc(site.slug)}`)}
${row('Platform', esc(site.platform ?? ''))}
${row('Made by', `${esc(manifest.generator ?? 'unknown')} · ${esc(manifest.createdAt ?? '')}`)}
${row('People', `${(site.people ?? []).length} (${counts})`)}
${row('Images', String(Object.keys(site.images ?? {}).length))}
${row('Licences', `${licences.approved}/${licences.total} licensed ${licences.approved < licences.total ? badge('expected for a new site', 'muted') : ''}`)}
${row('Verification', `${checks.verified}/${checks.total} pages and profiles verified`)}
</table></div>
<h3>Open Graph cards</h3>${cards}</section>
<section class="card"><h2>Verify list</h2>${verify.trim() ? `<div class="markdown">${markdown(verify)}</div><p class="hint">Copy this into the PR description; it is not stored in the site's content.</p>` : '<p class="intro">The pack has no verify.md.</p>'}</section>
<form method="post" action="${esc(`${base}/import`)}" class="card">${csrfField(csrf)}<h2>Import</h2>
<div class="checks">
${collision ? check({ label: 'Replace existing site', name: 'replace', hint: `Overwrites /${site.slug}` }) : ''}
${check({ label: 'Publish now', name: 'publish', hint: 'Leave unticked: new sites start inactive' })}
${check({ label: 'Make root', name: 'root', hint: 'Make / redirect here (needs Publish now)' })}
</div>
<p class="actions"><button class="btn primary" type="submit"${disabled}>Import site</button></p>
</form>
<form method="post" action="${esc(`${base}/discard`)}">${csrfField(csrf)}<button class="btn" type="submit">Discard this pack</button></form>`;
}
