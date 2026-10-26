// Verification tab: the progress list and the per-page / per-profile checklist form.
// Missing checks never block publishing; this is where they get done.
import { PAGES, verificationEntries, verificationStatus } from '../../sites/verification.mjs';
import { badge, csrfField, esc, problemsBox } from './html.mjs';
import { siteHeader } from './layout.mjs';

const STATES = {
  verified: ['Verified', 'ok'],
  progress: ['In progress', 'warn'],
  none: ['Not started', 'muted'],
  changed: ['Changed', 'error'],
};
export const verificationBadge = state => badge(...STATES[state]);
const GROUP_LABELS = { pages: 'Page', people: 'Profile' };

/** URL segment for an entry: page paths (`ways-to-book`, `home`) or the person's slug. */
export function entrySegment(entry) {
  if (entry.group !== 'pages') return entry.key;
  const path = PAGES.find(([key]) => key === entry.key)[2];
  return path ? path.slice(1) : 'home';
}
export const checklistHref = (site, entry) => `/sites/${site.slug}/verification/${entry.group}/${entrySegment(entry)}`;
const progress = entry => `${entry.stale ? entry.checked : entry.done}/${entry.total}`;

/** @param {{ site: object, csrf: string, incompleteOnly: boolean }} options */
export function verificationList({ site, incompleteOnly }) {
  const base = `/sites/${site.slug}/verification`;
  const { total, verified, stale } = verificationStatus(site);
  const entries = verificationEntries(site).filter(entry => !incompleteOnly || entry.state !== 'verified');
  const filter = `<nav class="tabs sub" aria-label="Filter"><a href="${esc(base)}"${incompleteOnly ? '' : ' aria-current="page"'}>All (${total})</a><a href="${esc(base)}?show=incomplete"${incompleteOnly ? ' aria-current="page"' : ''}>Incomplete only (${total - verified})</a></nav>`;
  const rows = entries
    .map(
      entry => `<tr>
<td data-label="Page or profile"><a href="${esc(checklistHref(site, entry))}"><b>${esc(entry.label)}</b></a><br><small>${esc(entry.path)}</small></td>
<td data-label="Type">${esc(GROUP_LABELS[entry.group])}</td>
<td data-label="Progress">${progress(entry)}</td>
<td data-label="Status">${verificationBadge(entry.state)}</td>
<td data-label="Actions"><div class="actions"><a class="btn${entry.state === 'verified' ? '' : ' primary'}" href="${esc(checklistHref(site, entry))}">Checklist</a><a class="btn" href="/preview${esc(entry.path)}" target="_blank" rel="noopener">Preview</a></div></td>
</tr>`,
    )
    .join('\n');
  const table = entries.length
    ? `<div class="table-wrap"><table class="people"><thead><tr><th>Page or profile</th><th>Type</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<section class="card"><p class="intro">Everything built on this site is verified.</p></section>';
  return `${siteHeader(site, 'Verification')}
<div class="page-head"><div><h2>Verification</h2><p class="sub">${verified} of ${total} pages and profiles verified${stale ? ` · ${stale} changed since verification` : ''}. Only pages that are built count: switched-off pages and hidden people are left out. Missing checks never block publishing.</p></div></div>
${filter}
${table}`;
}

/** @param {{ site: object, entry: object, csrf: string, problems?: string[] }} options */
export function checklistPage({ site, entry, csrf, problems = [] }) {
  const href = checklistHref(site, entry);
  const items = entry.checklist
    .map(([key, label, help]) => {
      const tick = entry.record?.items?.[key];
      const when = tick ? ` <small class="hint">checked ${esc(tick.checkedAt)}</small>` : '';
      return `<li class="checklist-item"><label class="check"><input type="checkbox" name="item" value="${esc(key)}"${tick ? ' checked' : ''}><span><b>${esc(label)}</b>${when}<br><small class="hint">${esc(help)}</small></span></label><input type="text" name="note.${esc(key)}" value="${esc(tick?.note ?? '')}" placeholder="Note (optional): source, who confirmed…" aria-label="Note for ${esc(label)}"></li>`;
    })
    .join('');
  const stale = entry.stale
    ? `<div class="alert warn" role="status"><b>Changed since verification.</b> The content has changed since these ticks were made, so they count as not verified. Review the page, then re-confirm: saving stamps the checklist against the content as it is now.</div>`
    : '';
  return `${siteHeader(site, 'Verification')}
<div class="page-head"><div><h2>${esc(entry.label)} ${verificationBadge(entry.state)}</h2><p class="sub">${esc(GROUP_LABELS[entry.group])} · ${esc(entry.path)} · ${progress(entry)} checked</p></div><div class="head-actions"><a class="btn" href="/preview${esc(entry.path)}" target="_blank" rel="noopener">Preview this page</a>${entry.group === 'people' ? `<a class="btn" href="/sites/${esc(site.slug)}/people/${esc(entry.key)}">Edit profile</a>` : ''}</div></div>
${stale}
${problemsBox(problems)}
<form method="post" action="${esc(href)}" class="editor">${csrfField(csrf)}
<section class="card"><ul class="checklist">${items}</ul></section>
<div class="savebar"><button class="btn primary" type="submit">${entry.stale ? 'Re-confirm and save' : 'Save checklist'}</button><button class="btn" type="submit" name="all" value="on">Check all and save</button><a class="btn" href="/sites/${esc(site.slug)}/verification">Back to list</a></div>
</form>`;
}
