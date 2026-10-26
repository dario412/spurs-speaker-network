// Licences tab: every picture and mark with where it is used, its licence status, a tick and a note.
// Missing approvals never block anything; this screen is where they get cleared.
import { imageUses, licenceAssets, licenceStatus } from '../../sites/licences.mjs';
import { assetKey } from '../forms-entries.mjs';
import { badge, csrfField, esc, problemsBox, thumb } from './html.mjs';
import { siteHeader } from './layout.mjs';

export const STATUS_LABELS = { licensed: 'Licensed', missing: 'Not licensed', stale: 'Changed since approval' };
const STATUS_KINDS = { licensed: 'ok', missing: 'warn', stale: 'error' };
export const licenceBadge = status => badge(STATUS_LABELS[status], STATUS_KINDS[status]);

const MARK_USES = { crest: ['Crest: navigation, badges and footer'], wordmark: ['Wordmark: navigation'] };
const MARK_NAMES = { crest: 'Crest', wordmark: 'Wordmark' };
const hostOf = url => (URL.canParse(url) ? new URL(url).host : url);

function row(asset, uses) {
  const key = assetKey(asset);
  const approved = asset.status === 'licensed';
  const used = asset.kind === 'mark' ? MARK_USES[asset.id] : (uses.get(asset.id) ?? []);
  const stale = asset.status === 'stale' ? `<br><small>Approved file: ${esc(hostOf(asset.entry.url))}</small>` : '';
  const when = approved && asset.entry.approvedAt ? `<br><small>${esc(asset.entry.approvedAt)}</small>` : '';
  return `<tr>
<td class="pic">${thumb(asset.url)}</td>
<td data-label="Asset"><b>${esc(asset.kind === 'mark' ? MARK_NAMES[asset.id] : asset.id)}</b><br><small>${asset.kind === 'mark' ? 'Mark' : 'Image'}</small></td>
<td data-label="Used on">${used.length ? used.map(esc).join('<br>') : '<small>Not used on any page</small>'}</td>
<td data-label="Host"><small>${esc(hostOf(asset.url))}</small></td>
<td data-label="Status">${licenceBadge(asset.status)}${stale}${when}</td>
<td data-label="Licensed"><input type="hidden" name="row" value="${esc(key)}"><input type="hidden" name="was.${esc(key)}" value="${approved ? 'on' : ''}"><label class="check"><input type="checkbox" name="approve" value="${esc(key)}" data-row-check${approved ? ' checked' : ''}><span class="visually-hidden">Licensed</span></label></td>
<td data-label="Note"><input type="text" name="note.${esc(key)}" value="${esc(asset.entry?.note ?? '')}" placeholder="Getty licence #… / club archive" aria-label="Licence note for ${esc(asset.id)}"></td>
</tr>`;
}

/** @param {{ site: object, csrf: string, unapprovedOnly: boolean, problems?: string[] }} options */
export function licencesPage({ site, csrf, unapprovedOnly, problems = [] }) {
  const base = `/sites/${site.slug}/licences`;
  const { total, approved, missing, stale } = licenceStatus(site);
  const assets = licenceAssets(site).filter(asset => !unapprovedOnly || asset.status !== 'licensed');
  const uses = imageUses(site);
  const action = unapprovedOnly ? `${base}?show=unapproved` : base;
  const filter = `<nav class="tabs sub" aria-label="Filter"><a href="${esc(base)}"${unapprovedOnly ? '' : ' aria-current="page"'}>All (${total})</a><a href="${esc(base)}?show=unapproved"${unapprovedOnly ? ' aria-current="page"' : ''}>Unapproved only (${total - approved})</a></nav>`;
  const rows = assets.map(asset => row(asset, uses)).join('\n');
  const table = assets.length
    ? `<div class="table-wrap"><table class="people licences"><thead><tr><th><span class="visually-hidden">Preview</span></th><th>Asset</th><th>Used on</th><th>Host</th><th>Status</th><th><label class="check"><input type="checkbox" data-check-all hidden><span>Licensed</span></label></th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<section class="card"><p class="intro">${unapprovedOnly ? 'Everything on this site is licensed.' : 'This site has no pictures or marks yet.'}</p></section>`;
  return `${siteHeader(site, 'Licences')}
<div class="page-head"><div><h2>Licences</h2><p class="sub">${approved} of ${total} assets licensed · ${missing.length} not licensed · ${stale.length} changed since approval. Missing approvals never block publishing; they raise alerts until cleared.</p></div></div>
${filter}
${problemsBox(problems)}
<form method="post" action="${esc(action)}" class="editor">${csrfField(csrf)}
${table}
${assets.length ? `<div class="savebar"><button class="btn primary" type="submit">Save licences</button><button class="btn" type="submit" name="all" value="on">Approve all shown (${assets.length})</button><span>Ticking records that the file at its current URL is licensed. Notes are saved with the approval.</span></div>` : ''}
</form>`;
}
