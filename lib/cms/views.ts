// HTML for the CMS screens: the branded shell (sidebar + top bar, as in the Credible Creators CMS, in PepTalk's
// getapeptalk.com branding) and the CMS's own pages (sign-in, 2FA, reset, users, account, media, sync, dashboard).
// The content editors themselves come from src/admin/views/ and are placed inside the same shell. Plain HTML strings,
// escaped with esc(); no inline styles or scripts (the CSP forbids both).
import { type CmsUser, can, MIN_PASSWORD, ROLES } from './auth.ts';

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

export interface Flash {
  text: string;
  kind?: 'ok' | 'warn' | 'error' | 'info';
  link?: { href: string; label: string };
  links?: { href: string; label: string }[];
}

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

const flashHtml = (flash?: Flash | null) => {
  if (!flash) return '';
  const links = [flash.link, ...(flash.links ?? [])]
    .filter(Boolean)
    .map(link => ` <a href="${esc(link?.href)}">${esc(link?.label)}</a>`)
    .join('');
  return `<div class="alert ${esc(flash.kind ?? 'ok')}" role="status">${esc(flash.text)}${links}</div>`;
};

const head = (title: string) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · PepTalk CMS</title>
<link rel="icon" href="/admin/assets/favicon.png">
<link rel="stylesheet" href="/admin/assets/admin.css">
<link rel="stylesheet" href="/admin/assets/cms.css">
<script src="/admin/assets/admin.js" defer></script>
</head>`;

interface NavItem {
  label: string;
  href: string;
  match: RegExp;
  show?: (user: CmsUser) => boolean;
}

/** The sidebar, grouped like the Credible CMS: one site, so content is pages, speakers and media. */
function nav(user: CmsUser, path: string): string {
  const groups: [string, NavItem[]][] = [
    ['Overview', [{ label: 'Dashboard', href: '/admin', match: /^\/admin\/?$/ }]],
    [
      'Content',
      [
        { label: 'Pages', href: '/admin/pages', match: /^\/admin\/(pages|legal)/ },
        { label: 'Edit on the site', href: '/admin/visual', match: /^\/admin\/visual/, show: u => can(u, 'edit_content') },
        { label: 'Speakers', href: '/admin/speakers', match: /^\/admin\/speakers/ },
        { label: 'Media', href: '/admin/media', match: /^\/admin\/media/ },
      ],
    ],
    ['Data', [{ label: 'Sync', href: '/admin/sync', match: /^\/admin\/sync/ }]],
    [
      'Settings',
      [
        { label: 'Users', href: '/admin/users', match: /^\/admin\/users/, show: u => can(u, 'manage_users') },
        { label: 'Style guide', href: '/admin/style-guide', match: /^\/admin\/style-guide/ },
        { label: 'Your account', href: '/admin/account', match: /^\/admin\/account/ },
      ],
    ],
  ];
  return groups
    .map(([label, items]) => {
      const links = items
        .filter(item => !item.show || item.show(user))
        .map(item => `<a href="${esc(item.href)}"${item.match.test(path) ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`)
        .join('');
      return links ? `<div class="nav-group"><p class="nav-label">${esc(label)}</p>${links}</div>` : '';
    })
    .join('');
}

/** A signed-in page: sidebar, top bar (user, role, sign out), flash and body. */
export function shell({
  title,
  body,
  user,
  path,
  csrf,
  flash,
  crumbs = [],
}: {
  title: string;
  body: string;
  user: CmsUser;
  path: string;
  csrf: string;
  flash?: Flash | null;
  crumbs?: [string, string?][];
}): string {
  const trail = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs
        .map(([label, href], i) =>
          href && i < crumbs.length - 1 ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`,
        )
        .join('<span class="sep">/</span>')}</nav>`
    : '';
  return `${head(title)}
<body class="cms">
<a class="skip" href="#main">Skip to content</a>
<aside class="cms-side">
  <a class="cms-brand" href="/admin"><img src="/admin/assets/peptalk.png" alt="PepTalk" width="123" height="32"><span>CMS</span></a>
  <nav aria-label="CMS">${nav(user, path)}</nav>
</aside>
<div class="cms-main">
  <header class="cms-top">
    <span class="cms-title">${esc(title)}</span>
    <span class="cms-user">${esc(user.name || user.email)} <span class="badge accent">${esc(ROLE_LABELS[user.role])}</span>
      <form method="post" action="/admin/logout" class="inline"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn">Sign out</button></form>
    </span>
  </header>
  <main id="main" class="cms-body">
    ${trail}
    ${flashHtml(flash)}
    ${body}
  </main>
</div>
</body>
</html>
`;
}

/** A signed-out page (sign-in, reset): a centred card with the PepTalk logo. */
export function bare({ title, body, flash }: { title: string; body: string; flash?: Flash | null }): string {
  return `${head(title)}
<body class="cms cms-bare">
<main class="cms-card">
  <img class="cms-card-logo" src="/admin/assets/peptalk.png" alt="PepTalk" width="123" height="32">
  <h1>${esc(title)}</h1>
  ${flashHtml(flash)}
  ${body}
</main>
</body>
</html>
`;
}

export const field = (label: string, name: string, attrs = '', value = '', hint = '') =>
  `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" value="${esc(value)}" ${attrs}>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;

export function loginPage({ email = '', askCode = false, next = '' }: { email?: string; askCode?: boolean; next?: string }) {
  return `<form method="post" action="/admin/login" class="stack">
<input type="hidden" name="next" value="${esc(next)}">
${field('Email', 'email', 'type="email" autocomplete="username" required', email)}
${field('Password', 'password', 'type="password" autocomplete="current-password" required')}
${field('Authenticator code', 'code', `inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7"${askCode ? ' required autofocus' : ''}`, '', askCode ? 'Enter the 6-digit code from your authenticator app.' : 'Only once you have set up two-factor sign-in.')}
<button class="btn primary wide">Sign in</button>
<p class="center"><a href="/admin/forgot">Forgot your password?</a></p>
</form>`;
}

export const forgotPage = () => `<p>Enter your email and we’ll send you a link to set a new password. The link works once, for one hour.</p>
<form method="post" action="/admin/forgot" class="stack">
${field('Email', 'email', 'type="email" autocomplete="username" required')}
<button class="btn primary wide">Send reset link</button>
<p class="center"><a href="/admin/login">Back to sign in</a></p>
</form>`;

export const resetPage = (token: string) => `<form method="post" action="/admin/reset" class="stack">
<input type="hidden" name="token" value="${esc(token)}">
${field('New password', 'password', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`, '', `At least ${MIN_PASSWORD} characters.`)}
${field('Repeat new password', 'confirm', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`)}
<button class="btn primary wide">Set password</button>
</form>`;

export function totpPage({ qr, secret, csrf }: { qr: string; secret: string; csrf: string }) {
  return `<p>Two-factor sign-in is required for every CMS account. Scan the code with an authenticator app (Google Authenticator, 1Password, Microsoft Authenticator…), then enter the 6-digit code it shows.</p>
<div class="totp">
  <img src="${esc(qr)}" alt="QR code for your authenticator app" width="220" height="220">
  <p class="hint">Can’t scan it? Enter this key instead:<br><code class="key">${esc(secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
</div>
<form method="post" action="/admin/2fa" class="stack">
<input type="hidden" name="_csrf" value="${esc(csrf)}">
${field('6-digit code', 'code', 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus')}
<button class="btn primary wide">Turn on two-factor sign-in</button>
</form>`;
}

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }) : 'Never';

export function usersPage({ users, me, csrf }: { users: CmsUser[]; me: CmsUser; csrf: string }) {
  const token = `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
  const roleSelect = (value: string, name = 'role') =>
    `<select name="${name}">${ROLES.map(role => `<option value="${role}"${role === value ? ' selected' : ''}>${ROLE_LABELS[role]}</option>`).join('')}</select>`;
  const rows = users
    .map(user => {
      const self = user.id === me.id;
      const status = !user.active
        ? '<span class="badge muted">Deactivated</span>'
        : !user.hasPassword
          ? '<span class="badge warn">Invited</span>'
          : user.totpEnabled
            ? '<span class="badge ok">2FA on</span>'
            : !user.totpRequired
              ? '<span class="badge muted">2FA off</span>'
              : '<span class="badge warn">2FA pending</span>';
      return `<tr>
<td data-label="User"><b>${esc(user.name || user.email)}</b><br><small>${esc(user.email)}</small></td>
<td data-label="Role"><form method="post" action="/admin/users/${esc(user.id)}" class="inline">${token}${roleSelect(user.role)}<button class="btn">Save</button></form></td>
<td data-label="Status">${status}<br><small>Last sign-in: ${esc(when(user.lastLoginAt))}</small></td>
<td data-label="Actions"><div class="actions">
<form method="post" action="/admin/users/${esc(user.id)}/invite" class="inline">${token}<button class="btn">Email reset link</button></form>
${user.totpEnabled ? `<form method="post" action="/admin/users/${esc(user.id)}/reset-2fa" class="inline">${token}<button class="btn">Reset 2FA</button></form>` : ''}
${
  user.totpRequired
    ? `<form method="post" action="/admin/users/${esc(user.id)}/2fa-off" class="inline">${token}<button class="btn" title="They will sign in with email and password only">Turn off 2FA</button></form>`
    : `<form method="post" action="/admin/users/${esc(user.id)}/2fa-on" class="inline">${token}<button class="btn">Require 2FA</button></form>`
}
</div>
<details class="set-password"><summary>Set a password</summary>
<form method="post" action="/admin/users/${esc(user.id)}/password" class="stack narrow">${token}
${field('New password', 'password', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`, '', `At least ${MIN_PASSWORD} characters. They are signed out everywhere and use this password from now on.`)}
${field('Repeat password', 'confirm', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`)}
<button class="btn primary">Set password</button>
</form></details>
<div class="actions">
${self ? '' : `<form method="post" action="/admin/users/${esc(user.id)}/active" class="inline">${token}<input type="hidden" name="active" value="${user.active ? 'off' : 'on'}"><button class="btn${user.active ? ' danger' : ''}">${user.active ? 'Deactivate' : 'Reactivate'}</button></form>`}
</div></td>
</tr>`;
    })
    .join('');
  return `<div class="page-head"><div><h1>Users</h1><p class="sub">Owners manage users; editors edit content and run the sync; viewers can look but not change anything. Owners can set a user’s password and turn two-factor sign-in off for a user (they then sign in with email and password only).</p></div></div>
<table class="table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>
<section class="card" id="new-user"><h2>Add a user</h2>
<p class="hint">They get an email with a link to set their password, then set up two-factor sign-in the first time they sign in.</p>
<form method="post" action="/admin/users" class="grid2">${token}
${field('Name', 'name', 'autocomplete="off"')}
${field('Email', 'email', 'type="email" autocomplete="off" required')}
<label class="field"><span>Role</span>${roleSelect('editor')}</label>
<div class="field end"><button class="btn primary">Add user and send invite</button></div>
</form></section>`;
}

export function accountPage({ user, csrf }: { user: CmsUser; csrf: string }) {
  return `<div class="page-head"><div><h1>Your account</h1><p class="sub">${esc(user.email)} · ${esc(ROLE_LABELS[user.role])}</p></div></div>
<section class="card"><h2>Change password</h2>
<form method="post" action="/admin/account" class="stack narrow"><input type="hidden" name="_csrf" value="${esc(csrf)}">
${field('Current password', 'current', 'type="password" autocomplete="current-password" required')}
${field('New password', 'password', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`, '', `At least ${MIN_PASSWORD} characters. Changing it signs you out everywhere else.`)}
${field('Repeat new password', 'confirm', `type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required`)}
<button class="btn primary">Change password</button>
</form></section>
<section class="card"><h2>Two-factor sign-in</h2><p>${
    user.totpEnabled
      ? 'On. To move it to a new phone, ask an owner to reset it; you’ll set it up again at your next sign-in.'
      : user.totpRequired
        ? 'Not set up yet.'
        : 'Off for your account (an owner turned it off): you sign in with email and password only. You can still turn it on for yourself.</p><p><a class="btn" href="/admin/2fa">Set up two-factor sign-in</a>'
  }</p></section>`;
}

export interface DashboardData {
  sites: { slug: string; name: string; people: number; active: boolean; livePath: string }[];
  changes: { path: string; updatedAt: string; updatedBy: string | null }[];
  lastSync: { finishedAt: string | null; ok: boolean | null; summary: Record<string, unknown> } | null;
  user: CmsUser;
  deployHook: boolean;
}

export function dashboardPage(data: DashboardData) {
  const sites = data.sites
    .map(
      site => `<div class="tile">
<h3>${esc(site.name)} ${site.active ? '<span class="badge ok">Live</span>' : '<span class="badge muted">Inactive</span>'}</h3>
<p class="sub">${site.people} speakers</p>
<div class="actions"><a class="btn primary" href="/admin/visual">Edit on the site</a><a class="btn" href="/admin/pages">Edit pages</a><a class="btn" href="/admin/speakers">Speakers</a><a class="btn" href="${esc(site.livePath)}" target="_blank" rel="noopener">View live</a></div>
</div>`,
    )
    .join('');
  const changes = data.changes.length
    ? `<ul class="list">${data.changes
        .map(
          change =>
            `<li><code>${esc(change.path.replace(/^src\//, ''))}</code> <small>${esc(when(change.updatedAt))}${change.updatedBy ? ` · ${esc(change.updatedBy)}` : ''}</small></li>`,
        )
        .join('')}</ul>`
    : '<p class="hint">Nothing edited in the CMS yet: the site shows the content committed in Git.</p>';
  const sync = data.lastSync
    ? `<p>${data.lastSync.ok ? '<span class="badge ok">OK</span>' : '<span class="badge error">Failed</span>'} ${esc(when(data.lastSync.finishedAt))}</p><p class="hint">${esc(String(data.lastSync.summary.message ?? ''))}</p>`
    : '<p class="hint">Not run yet.</p>';
  return `<div class="page-head"><div><h1>Welcome${data.user.name ? `, ${esc(data.user.name.split(' ')[0])}` : ''}</h1><p class="sub">Edit the speaker network’s content, speakers and media. Saved changes go live within a minute.</p></div></div>
<div class="tiles">${sites}</div>
<div class="grid2">
<section class="card"><h2>Recent changes</h2>${changes}</section>
<section class="card"><h2>Airtable sync</h2>${sync}<a class="btn" href="/admin/sync">Open sync</a></section>
</div>
${data.deployHook ? '' : '<div class="alert warn"><p>New speakers and pages switched on or off need a rebuild. Set <code>VERCEL_DEPLOY_HOOK_URL</code> so the CMS starts one automatically.</p></div>'}`;
}

export interface MediaItem {
  id: string;
  fileName: string;
  alt: string;
  url: string;
  byteSize: number;
  createdAt: string;
}

export interface MediaImage {
  id: string;
  url: string;
  /** Uploaded through the CMS (else a Getty or licensed file referenced by URL). */
  upload: boolean;
  alt: string;
  usedBy: string[];
}

export function mediaPage({ images, csrf, canEdit, filter }: { images: MediaImage[]; csrf: string; canEdit: boolean; filter: string }) {
  const upload = canEdit
    ? `<section class="card"><h2>Upload an image</h2>
<p class="hint">PNG, JPG or WebP, up to 4 MB. Each upload gets an image id you can use in any image field (carousel, role tiles, event spaces, about). Use licensed images only.</p>
<form method="post" action="/admin/media" enctype="multipart/form-data" class="grid2"><input type="hidden" name="_csrf" value="${esc(csrf)}">
<label class="field"><span>Image</span><input type="file" name="file" accept="image/png,image/jpeg,image/webp" required></label>
${field('Alt text', 'alt', 'maxlength="200"', '', 'Describe what the picture shows.')}
<div class="field end"><button class="btn primary">Upload</button></div>
</form></section>`
    : '';
  const filters: [string, string][] = [
    ['', `All (${images.length})`],
    ['used', `In use (${images.filter(image => image.usedBy.length).length})`],
    ['unused', `Not used (${images.filter(image => !image.usedBy.length).length})`],
    ['uploads', `Uploads (${images.filter(image => image.upload).length})`],
  ];
  const shown = images.filter(image =>
    filter === 'used' ? image.usedBy.length > 0 : filter === 'unused' ? !image.usedBy.length : filter === 'uploads' ? image.upload : true,
  );
  const tabs = `<nav class="tabs" aria-label="Filter images">${filters
    .map(
      ([key, label]) =>
        `<a href="/admin/media${key ? `?show=${key}` : ''}"${key === filter ? ' aria-current="page"' : ''}>${esc(label)}</a>`,
    )
    .join('')}</nav>`;
  const grid = shown.length
    ? `<div class="media-grid">${shown
        .map(
          image => `<figure class="media-item"><a href="${esc(image.url)}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="${esc(image.alt || image.usedBy[0] || '')}" loading="lazy"></a>
<figcaption><code>${esc(image.id)}</code> ${image.upload ? '<span class="badge accent">Upload</span>' : ''}<br><small>${image.usedBy.length ? esc(image.usedBy.join(', ')) : 'Not used'}</small></figcaption></figure>`,
        )
        .join('')}</div>`
    : '<p class="hint">No images here.</p>';
  return `<div class="page-head"><div><h1>Media</h1><p class="sub">Every image on the site: speakers’ photos from Airtable and Getty, and uploads. Use an image’s id in any image field.</p></div></div>${upload}<section class="card">${tabs}${grid}</section>`;
}

export interface SyncRun {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  trigger: string;
  startedBy: string | null;
  summary: { message?: string; created?: number; updated?: number; removed?: number; skipped?: { name: string; problem: string }[] };
}

export function syncPage({
  runs,
  csrf,
  configured,
  canRun,
  table,
}: {
  runs: SyncRun[];
  csrf: string;
  configured: boolean;
  canRun: boolean;
  table: string;
}) {
  const runList = runs.length
    ? `<table class="table"><thead><tr><th>When</th><th>Result</th><th>Changes</th></tr></thead><tbody>${runs
        .map(run => {
          const skipped = run.summary.skipped?.length
            ? `<details><summary>${run.summary.skipped.length} skipped</summary><ul>${run.summary.skipped.map(item => `<li><b>${esc(item.name)}</b>: ${esc(item.problem)}</li>`).join('')}</ul></details>`
            : '';
          return `<tr><td data-label="When">${esc(when(run.finishedAt ?? run.startedAt))}<br><small>${esc(run.trigger)}${run.startedBy ? ` · ${esc(run.startedBy)}` : ''}</small></td>
<td data-label="Result">${run.ok === null ? '<span class="badge muted">Running</span>' : run.ok ? '<span class="badge ok">OK</span>' : '<span class="badge error">Failed</span>'}<br><small>${esc(run.summary.message ?? '')}</small></td>
<td data-label="Changes">${run.summary.created ?? 0} new · ${run.summary.updated ?? 0} updated · ${run.summary.removed ?? 0} removed${skipped}</td></tr>`;
        })
        .join('')}</tbody></table>`
    : '<p class="hint">No sync runs yet.</p>';
  const button =
    configured && canRun
      ? `<div class="actions"><form method="post" action="/admin/sync" class="inline"><input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="mode" value="preview"><button class="btn">Preview sync</button></form><form method="post" action="/admin/sync" class="inline"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn primary">Sync speakers now</button></form></div>`
      : configured
        ? ''
        : '<div class="alert warn"><p>The sync isn’t configured: set <code>AIRTABLE_TOKEN</code> on the server.</p></div>';
  return `<div class="page-head"><div><h1>Airtable sync</h1><p class="sub">Speakers come from the Airtable table <b>${esc(table)}</b>. Airtable owns them: each sync replaces the speakers on the site with the listed records (records marked Unlisted are hidden). Every record is checked against the content rules first; bad ones are skipped and listed here.</p></div>${button}</div>
<section class="card"><h2>Recent runs</h2>${runList}</section>`;
}

export function legalList(docs: { kind: string; title: string; edited: boolean }[]) {
  return `<div class="page-head"><div><h1>Legal pages</h1><p class="sub">Shared by every site. Markdown with a small safe subset: headings, lists, bold, italic, links and tables.</p></div></div>
<table class="table"><tbody>${docs
    .map(
      doc =>
        `<tr><td><b>${esc(doc.title)}</b> ${doc.edited ? '<span class="badge accent">Edited in CMS</span>' : ''}</td><td><a class="btn" href="/admin/legal/${esc(doc.kind)}">Edit</a></td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function legalEditor({
  kind,
  title,
  text,
  csrf,
  problems = [],
}: {
  kind: string;
  title: string;
  text: string;
  csrf: string;
  problems?: string[];
}) {
  const box = problems.length
    ? `<div class="alert error"><p>Nothing was saved:</p><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`
    : '';
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p class="sub">src/copy/legal/${esc(kind)}.md · frontmatter between the <code>---</code> lines; the rest is the page.</p></div><a class="btn" href="/spurs/${esc(kind)}" target="_blank" rel="noopener">View live</a></div>
${box}<form method="post" action="/admin/legal/${esc(kind)}" class="stack"><input type="hidden" name="_csrf" value="${esc(csrf)}">
<label class="field"><span>Markdown</span><textarea name="body" rows="30" class="mono">${esc(text)}</textarea></label>
<button class="btn primary">Save</button></form>`;
}

// ---- Pages ----

export function pagesList(pages: { slug: string; title: string; description: string; live: string | null }[], base: string) {
  const rows = pages
    .map(
      page => `<tr><td data-label="Page"><b>${esc(page.title)}</b><br><small>${esc(page.description)}</small></td>
<td data-label="Actions"><div class="actions"><a class="btn primary" href="/admin/pages/${esc(page.slug)}">Edit</a><a class="btn" href="/admin/visual/${esc(page.slug)}">Edit on the page</a>${page.live !== null ? `<a class="btn" href="${esc(base + page.live)}" target="_blank" rel="noopener">View</a>` : ''}</div></td></tr>`,
    )
    .join('');
  return `<div class="page-head"><div><h1>Pages</h1><p class="sub">Edit the site’s wording and images here, or click <b>Edit on the page</b> to change them on the live page itself. Empty fields use the standard wording, shown in grey. Saved changes go live within a minute.</p></div><a class="btn primary" href="/admin/visual">Edit on the site</a></div>
<table class="table"><tbody>${rows}
<tr><td data-label="Page"><b>Legal pages</b><br><small>Terms, privacy and accessibility statement.</small></td><td data-label="Actions"><div class="actions"><a class="btn primary" href="/admin/legal">Edit</a></div></td></tr>
</tbody></table>`;
}

export interface EditorField {
  path: string;
  label: string;
  kind?: string;
  hint?: string;
  placeholder?: string;
  options?: [string, string][];
  wide?: boolean;
  value: string | boolean;
}

function editorField(f: EditorField, images: Record<string, string>): string {
  const name = esc(f.path);
  const id = `f-${f.path.replace(/[^a-z0-9]/gi, '-')}`;
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  const placeholder = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const value = String(f.value);
  const wide = f.wide || f.kind === 'textarea' || f.kind === 'lines' ? ' wide' : '';
  if (f.kind === 'check')
    return `<label class="field check${wide}"><input type="checkbox" name="${name}"${f.value === true ? ' checked' : ''}> <span>${esc(f.label)}</span>${hint}</label>`;
  if (f.kind === 'textarea' || f.kind === 'lines') {
    const lines = Math.max(3, Math.min(10, (value || f.placeholder || '').split('\n').length + 1));
    return `<label class="field${wide}" for="${id}"><span>${esc(f.label)}</span><textarea id="${id}" name="${name}" rows="${lines}"${placeholder}>${esc(value)}</textarea>${hint}</label>`;
  }
  if (f.kind === 'select')
    return `<label class="field${wide}" for="${id}"><span>${esc(f.label)}</span><select id="${id}" name="${name}"><option value="">Default</option>${(
      f.options ?? []
    )
      .map(([key, label]) => `<option value="${esc(key)}"${key === value ? ' selected' : ''}>${esc(label)}</option>`)
      .join('')}</select>${hint}</label>`;
  if (f.kind === 'image') {
    const url = images[value];
    const thumb = url ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy">` : '';
    return `<label class="field image${wide}" for="${id}"><span>${esc(f.label)}</span><span class="image-pick">${thumb}<input id="${id}" name="${name}" value="${esc(value)}" list="image-ids" autocomplete="off"${placeholder}></span>${hint || '<small class="hint">An image id from Media.</small>'}</label>`;
  }
  const type = f.kind === 'color' ? 'color' : f.kind === 'url' ? 'url' : 'text';
  return `<label class="field${wide}" for="${id}"><span>${esc(f.label)}</span><input id="${id}" type="${type}" name="${name}" value="${esc(value)}"${placeholder}>${hint}</label>`;
}

export function pageEditor({
  title,
  description,
  action,
  live,
  visual,
  sections,
  images,
  csrf,
  canEdit,
  problems = [],
}: {
  title: string;
  description: string;
  action: string;
  live: string | null;
  /** The page editor's slug, for its "Edit on the page" button. */
  visual?: string;
  sections: { title: string; intro?: string; fields: EditorField[] }[];
  images: Record<string, string>;
  csrf: string;
  canEdit: boolean;
  problems?: string[];
}) {
  const box = problems.length
    ? `<div class="alert error"><p>Nothing was saved:</p><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`
    : '';
  const usesImages = sections.some(section => section.fields.some(f => f.kind === 'image'));
  const list = usesImages
    ? `<datalist id="image-ids">${Object.keys(images)
        .map(id => `<option value="${esc(id)}"></option>`)
        .join('')}</datalist>`
    : '';
  const body = sections
    .map(
      section =>
        `<section class="card"><h2>${esc(section.title)}</h2>${section.intro ? `<p class="hint">${esc(section.intro)}</p>` : ''}${
          section.fields.length ? `<div class="grid2">${section.fields.map(f => editorField(f, images)).join('')}</div>` : ''
        }</section>`,
    )
    .join('');
  const save = canEdit
    ? '<div class="savebar"><button class="btn primary">Save changes</button></div>'
    : '<p class="hint">Your role can look but not change anything.</p>';
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p class="sub">${esc(description)}</p></div><div class="actions">${visual && canEdit ? `<a class="btn primary" href="/admin/visual/${esc(visual)}">Edit on the page</a>` : ''}${live !== null ? `<a class="btn" href="${esc(live)}" target="_blank" rel="noopener">View live</a>` : ''}</div></div>
${box}<form method="post" action="${esc(action)}" class="stack"><input type="hidden" name="_csrf" value="${esc(csrf)}">${list}
<fieldset${canEdit ? '' : ' disabled'}>${body}</fieldset>${save}</form>`;
}

// ---- Speakers ----

export interface SpeakerRow {
  slug: string;
  name: string;
  role: string;
  line: string;
  formats: string[];
  featured: boolean;
  hidden: boolean;
  image: string | null;
  live: string;
}

export function speakersPage({
  speakers,
  roles,
  role,
  lastSync,
}: {
  speakers: SpeakerRow[];
  roles: [string, string][];
  role: string;
  lastSync: string | null;
}) {
  const tabs = `<nav class="tabs" aria-label="Filter by role">${[['', 'All'] as [string, string], ...roles]
    .map(([key, label]) => {
      const count = key ? speakers.filter(s => s.role === label).length : speakers.length;
      return `<a href="/admin/speakers${key ? `?role=${esc(key)}` : ''}"${key === role ? ' aria-current="page"' : ''}>${esc(label)} (${count})</a>`;
    })
    .join('')}</nav>`;
  const roleLabel = roles.find(([key]) => key === role)?.[1];
  const shown = roleLabel ? speakers.filter(s => s.role === roleLabel) : speakers;
  const rows = shown
    .map(
      s => `<tr>
<td data-label="Speaker"><span class="who">${s.image ? `<img class="avatar" src="${esc(s.image)}" alt="" loading="lazy">` : '<span class="avatar"></span>'}<span><b>${esc(s.name)}</b><br><small><code>${esc(s.slug)}</code></small></span></span></td>
<td data-label="Role">${esc(s.role)}<br><small>${esc(s.line)}</small></td>
<td data-label="Formats"><small>${esc(s.formats.join(', '))}</small></td>
<td data-label="Status">${s.hidden ? '<span class="badge muted">Hidden</span>' : '<span class="badge ok">Live</span>'} ${s.featured ? '<span class="badge accent">Featured</span>' : ''}</td>
<td data-label="Profile">${s.hidden ? '' : `<a class="btn" href="${esc(s.live)}" target="_blank" rel="noopener">View</a>`}</td>
</tr>`,
    )
    .join('');
  return `<div class="page-head"><div><h1>Speakers</h1><p class="sub">Speakers come from Airtable. To change one, edit it in Airtable, then run a sync. Last sync: ${esc(when(lastSync))}.</p></div><a class="btn primary" href="/admin/sync">Open sync</a></div>
<section class="card">${tabs}<table class="table"><thead><tr><th>Speaker</th><th>Role</th><th>Formats</th><th>Status</th><th>Profile</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

// ---- Style guide ----

export interface Swatch {
  name: string;
  hex: string;
  note: string;
}

export function styleGuidePage({
  name,
  marks,
  swatches,
  editor,
}: {
  name: string;
  marks: { label: string; url: string }[];
  swatches: Swatch[];
  editor: string;
}) {
  const sw = swatches
    .map(
      s =>
        `<div class="swatch"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="${esc(s.hex)}" stroke="#d9dce6"/></svg><div><b>${esc(s.name)}</b><br><code>${esc(s.hex)}</code><br><small>${esc(s.note)}</small></div></div>`,
    )
    .join('');
  return `<div class="page-head"><div><h1>Style guide</h1><p class="sub">The ${esc(name)} brand as the site uses it: marks, colours, type and components. Brand colours and shapes can be changed below.</p></div></div>
<section class="card"><h2>Marks</h2><div class="marks">${marks.map(m => `<figure><span class="mark-box"><img src="${esc(m.url)}" alt="${esc(m.label)}"></span><figcaption><small>${esc(m.label)}</small></figcaption></figure>`).join('')}</div>
<p class="hint">Use the club’s own files, unmodified: no redrawing, recolouring or stretching.</p></section>
<section class="card"><h2>Colours</h2><div class="swatches">${sw}</div></section>
<section class="card"><h2>Typography</h2>
<div class="type-sample"><p class="sg-display sg-h1">Book a Spurs legend for your next event.</p><small class="hint">Display: Outfit, 800 · headings</small>
<p class="sg-display sg-h2">Five ways to book.</p><small class="hint">Display: Outfit, 700 · section headings</small>
<p class="sg-body">Body text is Outfit at 16–18px with comfortable line spacing. Keep sentences short and plain, and lead with what the reader can do.</p><small class="hint">Body: Outfit, 400</small>
<p class="sg-eyebrow">Eyebrow · small caps label</p><small class="hint">Eyebrows: Outfit, 700, uppercase, wide tracking</small></div></section>
<section class="card"><h2>Components</h2>
<div class="sg-row"><span class="sg-btn sg-cta">Check availability</span><span class="sg-btn sg-navy">See profile</span><span class="sg-btn sg-ghost">Explore profile</span></div>
<p class="hint">Yellow is kept for the one action that matters on each screen (Check availability). Navy buttons for everything else.</p>
<div class="sg-row"><span class="sg-pill">Limited availability</span><span class="sg-pill sg-signal">Available</span></div></section>
${editor}`;
}
