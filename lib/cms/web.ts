// The CMS web app at /admin (app/admin/[[...path]]/route.ts): sign-in, 2FA, users, account, dashboard, media, the
// Airtable sync, legal pages, and every content editor from the local admin (src/admin/handlers/, the same forms,
// validation and save path), with the database as storage instead of files.
//
// Security model: everything except sign-in, password reset and the static assets needs a valid session (signed
// cookie, re-checked against the user row on every request); a signed-in user without 2FA can only reach the 2FA
// setup. Every POST must come from this origin and carry the session's form token. Roles decide what may change.
// Pages are never cached and always noindex (lib/proxy/decide.ts → admin branch).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { saveLicences, showLicences } from '../../src/admin/handlers/licences.mjs';
import {
  confirmDeletePerson,
  createPerson,
  editPerson,
  listPeople,
  removePerson,
  savePerson,
  setPersonActive,
} from '../../src/admin/handlers/people.mjs';
import { saveRaw, saveRegistryRaw, showRaw, showRegistry } from '../../src/admin/handlers/raw.mjs';
import {
  createSite,
  editSite,
  makeLandingRoot,
  makeRoot,
  move,
  saveSiteSettings,
  setActive,
  showDashboard,
} from '../../src/admin/handlers/sites.mjs';
import { saveChecklist, showChecklist, showVerification } from '../../src/admin/handlers/verification.mjs';
import { HttpError } from '../../src/admin/http.mjs';
import { parseLegal } from '../content/legal.ts';
import {
  type CmsUser,
  can,
  completeReset,
  confirmTotp,
  createReset,
  createUser,
  csrfOk,
  csrfToken,
  getUser,
  listUsers,
  type Permission,
  passwordProblem,
  ROLES,
  type Role,
  resetTotp,
  resetUser,
  SESSION_COOKIE,
  SESSION_TTL_S,
  sessionCookie,
  sessionUser,
  setPassword,
  signIn,
  signValue,
  startTotp,
  UserError,
  unsignValue,
  updateUser,
  validEmail,
} from './auth.ts';
import { loadContentFiles, recentChanges, saveContentFiles } from './content-files.ts';
import { buildShape, cmsContent } from './editor.ts';
import { resetEmail, sendMail } from './mail.ts';
import { deleteMedia, listMedia, saveMedia } from './media.ts';
import { tagsFor, triggerRebuild } from './publish.ts';
import { airtableSyncConfigured, latestRuns, runSpursSync, SYNC_TABLE_NAME } from './sync.ts';
import {
  accountPage,
  bare,
  dashboardPage,
  type Flash,
  forgotPage,
  legalEditor,
  legalList,
  loginPage,
  mediaPage,
  resetPage,
  shell,
  syncPage,
  totpPage,
  usersPage,
} from './views.ts';

export interface CmsDeps {
  /** next/cache revalidateTag, injected so this module stays free of Next.js imports. */
  revalidate: (tag: string) => void;
}

const FLASH_COOKIE = 'pt_cms_flash';
const PREFIX = '/admin';
const LEGAL_KINDS = ['terms', 'privacy', 'accessibility'] as const;

// ---- Responses ----

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE, ...headers } });
const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, ...NO_STORE });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
};
const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const flashCookie = (flash: Flash) => cookie(FLASH_COOKIE, signValue(JSON.stringify(flash)), 60);
const readCookie = (request: Request, name: string): string | undefined =>
  (request.headers.get('cookie') ?? '')
    .split(';')
    .map(part => part.trim().split('='))
    .find(([key]) => key === name)?.[1];

/** Only local paths after sign-in (no open redirects). */
const safeNext = (next: string) => (/^\/admin(\/[a-z0-9/_-]*)?(\?[a-z0-9=&_-]*)?$/i.test(next) && !next.startsWith('//') ? next : PREFIX);

const clientAddress = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';

// ---- The local admin's screens, mounted under /admin ----

type Handler = (ctx: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
const CONTENT_ROUTES: [string, string, Handler][] = [
  ['GET', '/', showDashboard],
  ['POST', '/sites', createSite],
  ['GET', '/registry', showRegistry],
  ['POST', '/registry', saveRegistryRaw],
  ['GET', '/sites/:slug', editSite],
  ['POST', '/sites/:slug', saveSiteSettings],
  ['POST', '/sites/:slug/active', setActive],
  ['POST', '/sites/:slug/root', makeRoot],
  ['POST', '/root/landing', makeLandingRoot],
  ['POST', '/sites/:slug/move', move],
  ['GET', '/sites/:slug/licences', showLicences],
  ['POST', '/sites/:slug/licences', saveLicences],
  ['GET', '/sites/:slug/verification', showVerification],
  ['GET', '/sites/:slug/verification/:group/:key', showChecklist],
  ['POST', '/sites/:slug/verification/:group/:key', saveChecklist],
  ['GET', '/sites/:slug/raw/:file', showRaw],
  ['POST', '/sites/:slug/raw/:file', saveRaw],
  ['GET', '/sites/:slug/people', listPeople],
  ['POST', '/sites/:slug/people', createPerson],
  ['GET', '/sites/:slug/people/:key', editPerson],
  ['POST', '/sites/:slug/people/:key', savePerson],
  ['POST', '/sites/:slug/people/:key/active', setPersonActive],
  ['GET', '/sites/:slug/people/:key/delete', confirmDeletePerson],
  ['POST', '/sites/:slug/people/:key/delete', removePerson],
];
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function matchContent(method: string, local: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
  let allowed = false;
  for (const [routeMethod, pattern, handler] of CONTENT_ROUTES) {
    const found = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`).exec(local);
    if (!found) continue;
    const params = { ...found.groups };
    if (!Object.values(params).every(value => KEY.test(value))) return null;
    if (routeMethod === method) return { handler, params };
    allowed = true;
  }
  return allowed ? 'method' : null;
}

/** Local admin paths in links, forms and redirects → /admin paths; "Preview" links → the live page. */
export function mountPath(path: string): string {
  if (path === '/preview' || path.startsWith('/preview/')) {
    const live = path.slice('/preview'.length) || '/';
    return live === '/all' ? '/all' : live;
  }
  if (path.startsWith('/assets/')) return `${PREFIX}${path}`;
  if (path === '/' || path.startsWith('/?')) return `${PREFIX}/content${path.slice(1)}`;
  if (path.startsWith(PREFIX)) return path;
  return `${PREFIX}${path}`;
}
const mountHtml = (body: string) => body.replace(/\b(href|action)="(\/[^"]*)"/g, (_, attr, path) => `${attr}="${mountPath(path)}"`);

// ---- The app ----

interface Session {
  user: CmsUser;
  csrf: string;
}

export async function handleCms(request: Request, deps: CmsDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || PREFIX;
  const method = request.method === 'HEAD' ? 'GET' : request.method;
  try {
    return await route(request, url, path, method, deps);
  } catch (error) {
    if (error instanceof HttpError)
      return html(
        bare({
          title: error.status === 404 ? 'Not found' : 'Not allowed',
          body: `<p>${String(error.message)}</p><p><a href="/admin">Back to the CMS</a></p>`,
        }),
        error.status,
      );
    console.error(JSON.stringify({ service: 'appearances', event: 'cms.request_failed', path, message: (error as Error).message }));
    return html(
      bare({
        title: 'Something went wrong',
        body: '<p>The request failed. Try again; if it keeps happening, check the server log.</p><p><a href="/admin">Back to the CMS</a></p>',
      }),
      500,
    );
  }
}

async function route(request: Request, url: URL, path: string, method: string, deps: CmsDeps): Promise<Response> {
  if (method !== 'GET' && method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, POST', ...NO_STORE } });
  // State changes only from this origin (before reading any body).
  if (method === 'POST') {
    const origin = request.headers.get('origin');
    if (!origin || new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-origin request refused.');
  }

  if (path.startsWith(`${PREFIX}/assets/`)) return asset(path.slice(`${PREFIX}/assets/`.length));
  const flash = readFlash(request);
  const clearFlash: Record<string, string> = flash ? { 'Set-Cookie': cookie(FLASH_COOKIE, '', 0) } : {};

  // ---- Signed out ----
  if (path === `${PREFIX}/login`) {
    if (method === 'GET')
      return html(bare({ title: 'Sign in', body: loginPage({ next: url.searchParams.get('next') ?? '' }), flash }), 200, clearFlash);
    const form = await request.formData();
    const email = String(form.get('email') ?? '');
    const result = await signIn(email, String(form.get('password') ?? ''), String(form.get('code') ?? ''), clientAddress(request));
    if (!result.ok) {
      const text =
        result.error === 'locked'
          ? 'Too many attempts. Wait 15 minutes and try again.'
          : result.error === 'code'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Email or password not recognised.';
      return html(
        bare({
          title: 'Sign in',
          body: loginPage({ email, askCode: result.error === 'code', next: String(form.get('next') ?? '') }),
          flash: { text, kind: 'error' },
        }),
        result.error === 'locked' ? 429 : 401,
      );
    }
    const next = result.user.totpEnabled ? safeNext(String(form.get('next') ?? '')) : `${PREFIX}/2fa`;
    return redirect(next, [cookie(SESSION_COOKIE, sessionCookie(result.user), SESSION_TTL_S)]);
  }
  if (path === `${PREFIX}/forgot`) {
    if (method === 'GET') return html(bare({ title: 'Reset your password', body: forgotPage() }));
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (validEmail(email.toLowerCase())) {
      const reset = await createReset(email);
      if (reset) {
        const mail = resetEmail(`${url.origin}${PREFIX}/reset?token=${reset.token}`);
        await sendMail({ to: reset.user.email, ...mail });
      }
    }
    return redirect(`${PREFIX}/login`, [
      flashCookie({ text: 'If that email has an account, a reset link is on its way. It works once, for one hour.', kind: 'info' }),
    ]);
  }
  if (path === `${PREFIX}/reset`) {
    if (method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      if (!(await resetUser(token)))
        return html(
          bare({
            title: 'Link expired',
            body: '<p>This reset link has expired or was already used.</p><p><a href="/admin/forgot">Send a new link</a></p>',
          }),
          410,
        );
      return html(bare({ title: 'Set a new password', body: resetPage(token) }));
    }
    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const password = String(form.get('password') ?? '');
    const problem = password !== String(form.get('confirm') ?? '') ? 'The two passwords don’t match.' : passwordProblem(password);
    if (problem) return html(bare({ title: 'Set a new password', body: resetPage(token), flash: { text: problem, kind: 'error' } }), 422);
    if (!(await completeReset(token, password)))
      return html(
        bare({
          title: 'Link expired',
          body: '<p>This reset link has expired or was already used.</p><p><a href="/admin/forgot">Send a new link</a></p>',
        }),
        410,
      );
    return redirect(`${PREFIX}/login`, [flashCookie({ text: 'Password set. Sign in with it now.', kind: 'ok' })]);
  }

  // ---- Signed in ----
  const found = await sessionUser(readCookie(request, SESSION_COOKIE));
  if (!found) {
    if (method === 'POST') return redirect(`${PREFIX}/login`);
    return redirect(`${PREFIX}/login?next=${encodeURIComponent(path + url.search)}`);
  }
  const session: Session = { user: found.user, csrf: csrfToken(found.sid) };
  let form: FormData | null = null;
  if (method === 'POST') {
    form = await request.formData();
    if (!csrfOk(found.sid, String(form.get('_csrf') ?? '')))
      throw new HttpError(403, 'Missing or invalid form token. Reload the page and try again.');
  }
  if (path === `${PREFIX}/logout` && method === 'POST') return redirect(`${PREFIX}/login`, [cookie(SESSION_COOKIE, '', 0)]);

  // Two-factor sign-in is required before anything else.
  if (!session.user.totpEnabled || path === `${PREFIX}/2fa`) {
    if (session.user.totpEnabled) return redirect(PREFIX);
    if (method === 'POST' && path === `${PREFIX}/2fa`) {
      if (await confirmTotp(session.user, String(form?.get('code') ?? '')))
        return redirect(PREFIX, [flashCookie({ text: 'Two-factor sign-in is on. Welcome to the CMS.', kind: 'ok' })]);
      const setup = await startTotp(session.user);
      return html(
        bare({
          title: 'Set up two-factor sign-in',
          body: totpPage({ ...setup, qr: await QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }), csrf: session.csrf }),
          flash: { text: 'That code didn’t match. Try the newest code in your app.', kind: 'error' },
        }),
        422,
      );
    }
    if (path !== `${PREFIX}/2fa`) return redirect(`${PREFIX}/2fa`);
    const setup = await startTotp(session.user);
    return html(
      bare({
        title: 'Set up two-factor sign-in',
        body: totpPage({ ...setup, qr: await QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }), csrf: session.csrf }),
        flash,
      }),
      200,
      clearFlash,
    );
  }

  const need = (permission: Permission) => {
    if (!can(session.user, permission)) throw new HttpError(403, 'Your role can’t do that. Ask an owner.');
  };
  const saved = { paths: [] as string[] };
  const content = await cmsContent(session.user.email, saved);
  const snap = content.snapshot();
  const sites = snap.sites
    .filter((site: { broken?: unknown }) => !site.broken)
    .map((site: { slug: string; orgName?: string; short?: string }) => ({
      slug: site.slug,
      name: site.short ?? site.orgName ?? site.slug,
    }));
  const page = (title: string, body: string, status = 200, crumbs: [string, string?][] = []) =>
    html(
      shell({
        title,
        body: mountHtml(body),
        user: session.user,
        path,
        csrf: session.csrf,
        flash,
        sites,
        crumbs: crumbs.map(([label, href]) => [label, href ? mountPath(href) : undefined]),
      }),
      status,
      clearFlash,
    );
  const done = async (to: string, message: Flash) => redirect(to, [flashCookie(await afterSave(message))]);

  /** Refresh what changed; rebuild when the set of pages or image hosts did. */
  const afterSave = async (message: Flash): Promise<Flash> => {
    if (!saved.paths.length) return message;
    for (const tag of tagsFor(saved.paths)) deps.revalidate(tag);
    const changedShape = buildShape(snap) !== buildShape((await cmsContent(session.user.email, { paths: [] })).snapshot());
    if (!changedShape) return { ...message, text: `${message.text} Live within a minute.` };
    const started = await triggerRebuild(saved.paths.join(', '));
    return started
      ? {
          ...message,
          kind: message.kind === 'error' ? 'error' : 'warn',
          text: `${message.text} This adds or removes pages, so the site is rebuilding: about two minutes.`,
        }
      : { ...message, kind: 'warn', text: `${message.text} This adds or removes pages: they appear after the next deploy.` };
  };

  // Dashboard
  if (path === PREFIX && method === 'GET') {
    const runs = await latestRuns(1);
    return page(
      'Dashboard',
      dashboardPage({
        user: session.user,
        sites: snap.sites
          .filter((site: { broken?: unknown }) => !site.broken)
          .map((site: { slug: string; short?: string; orgName?: string; people: unknown[]; active?: boolean }) => ({
            slug: site.slug,
            name: site.short ?? site.orgName ?? site.slug,
            people: site.people.length,
            active: site.active !== false,
            livePath: `/${site.slug}`,
          })),
        changes: await recentChanges(8),
        lastSync: runs[0] ? { finishedAt: runs[0].finishedAt, ok: runs[0].ok, summary: runs[0].summary } : null,
        deployHook: Boolean(process.env.VERCEL_DEPLOY_HOOK_URL),
      }),
    );
  }

  // Users (owners)
  if (path === `${PREFIX}/users` || path.startsWith(`${PREFIX}/users/`)) {
    need('manage_users');
    if (path === `${PREFIX}/users` && method === 'GET')
      return page('Users', usersPage({ users: await listUsers(), me: session.user, csrf: session.csrf }));
    if (path === `${PREFIX}/users` && method === 'POST') {
      const role = String(form?.get('role')) as Role;
      if (!ROLES.includes(role)) throw new HttpError(422, 'Choose a role.');
      try {
        const user = await createUser({
          email: String(form?.get('email') ?? ''),
          name: String(form?.get('name') ?? ''),
          role,
          createdBy: session.user.id,
        });
        const invite = await createReset(user.email);
        const sent = invite
          ? await sendMail({ to: user.email, ...resetEmail(`${url.origin}${PREFIX}/reset?token=${invite.token}`) })
          : false;
        return redirect(`${PREFIX}/users`, [
          flashCookie({
            text: sent
              ? `Added ${user.email} and emailed them a link to set their password.`
              : `Added ${user.email}. Email isn’t configured, so send them a reset link once it is (or set their password).`,
            kind: sent ? 'ok' : 'warn',
          }),
        ]);
      } catch (error) {
        if (error instanceof UserError) return redirect(`${PREFIX}/users`, [flashCookie({ text: error.message, kind: 'error' })]);
        throw error;
      }
    }
    const action = /^\/admin\/users\/([0-9a-f-]{36})(?:\/(active|reset-2fa|invite))?$/.exec(path);
    if (!action || method !== 'POST') throw new HttpError(404, 'Not found.');
    const [, id, verb] = action;
    const target = await getUser(id);
    if (!target) throw new HttpError(404, 'That user no longer exists.');
    try {
      if (!verb) {
        const role = String(form?.get('role')) as Role;
        if (!ROLES.includes(role)) throw new UserError('Choose a role.');
        await updateUser(session.user, id, { role });
        return redirect(`${PREFIX}/users`, [flashCookie({ text: `${target.email} is now ${role}.`, kind: 'ok' })]);
      }
      if (verb === 'active') {
        const active = form?.get('active') === 'on';
        await updateUser(session.user, id, { active });
        return redirect(`${PREFIX}/users`, [
          flashCookie({ text: `${target.email} ${active ? 'reactivated' : 'deactivated and signed out'}.`, kind: 'ok' }),
        ]);
      }
      if (verb === 'reset-2fa') {
        await resetTotp(id);
        return redirect(`${PREFIX}/users`, [
          flashCookie({ text: `Two-factor sign-in reset for ${target.email}. They set it up again at their next sign-in.`, kind: 'ok' }),
        ]);
      }
      const invite = await createReset(target.email);
      const sent = invite
        ? await sendMail({ to: target.email, ...resetEmail(`${url.origin}${PREFIX}/reset?token=${invite.token}`) })
        : false;
      return redirect(`${PREFIX}/users`, [
        flashCookie({
          text: sent
            ? `Reset link emailed to ${target.email}.`
            : invite
              ? 'Email isn’t configured, so no link was sent.'
              : 'A link was sent in the last two minutes; wait a moment.',
          kind: sent ? 'ok' : 'warn',
        }),
      ]);
    } catch (error) {
      if (error instanceof UserError) return redirect(`${PREFIX}/users`, [flashCookie({ text: error.message, kind: 'error' })]);
      throw error;
    }
  }

  // Account
  if (path === `${PREFIX}/account`) {
    if (method === 'GET') return page('Your account', accountPage({ user: session.user, csrf: session.csrf }));
    const password = String(form?.get('password') ?? '');
    const check = await signIn(session.user.email, String(form?.get('current') ?? ''), '', clientAddress(request)).catch(() => null);
    // signIn asks for the code when 2FA is on; a correct current password reaches that step (error "code").
    const currentOk = check && (check.ok || check.error === 'code');
    const problem = !currentOk
      ? 'Your current password is not right.'
      : password !== String(form?.get('confirm') ?? '')
        ? 'The two new passwords don’t match.'
        : passwordProblem(password);
    if (problem) return redirect(`${PREFIX}/account`, [flashCookie({ text: problem, kind: 'error' })]);
    await setPassword(session.user.id, password);
    const fresh = await getUser(session.user.id);
    return redirect(`${PREFIX}/account`, [
      flashCookie({ text: 'Password changed. Other sessions are signed out.', kind: 'ok' }),
      ...(fresh ? [cookie(SESSION_COOKIE, sessionCookie(fresh), SESSION_TTL_S)] : []),
    ]);
  }

  // Media
  if (path === `${PREFIX}/media` || path.startsWith(`${PREFIX}/media/`)) {
    if (method === 'GET' && path === `${PREFIX}/media`)
      return page(
        'Media library',
        mediaPage({ items: await listMedia(), csrf: session.csrf, sites, canEdit: can(session.user, 'edit_content') }),
      );
    need('edit_content');
    if (path === `${PREFIX}/media` && method === 'POST') {
      const file = form?.get('file');
      const slug = String(form?.get('site') ?? '');
      const site = snap.find(slug);
      if (!(file instanceof File) || !site)
        return redirect(`${PREFIX}/media`, [flashCookie({ text: 'Choose an image and a site.', kind: 'error' })]);
      const origin = process.env.PUBLIC_ORIGIN?.replace(/\/+$/, '') || url.origin;
      const result = await saveMedia(file, String(form?.get('alt') ?? ''), session.user.email, origin);
      if ('problem' in result) return redirect(`${PREFIX}/media`, [flashCookie({ text: result.problem, kind: 'error' })]);
      const saving = await content.saveSite(
        snap,
        { ...site, images: { ...site.images, [result.id]: result.url } },
        { registry: undefined, message: `content(${slug}): add image ${result.id}` },
      );
      if (saving.problems) {
        await deleteMedia(result.id);
        return redirect(`${PREFIX}/media`, [flashCookie({ text: `Not added: ${saving.problems.join('; ')}`, kind: 'error' })]);
      }
      return done(`${PREFIX}/media`, {
        text: `Uploaded. Use image id ${result.id} in any image field of ${site.short ?? slug}.`,
        kind: 'ok',
      });
    }
    throw new HttpError(404, 'Not found.');
  }

  // Airtable sync
  if (path === `${PREFIX}/sync`) {
    if (method === 'GET')
      return page(
        'Airtable sync',
        syncPage({
          runs: await latestRuns(15),
          csrf: session.csrf,
          configured: airtableSyncConfigured(),
          canRun: can(session.user, 'run_sync'),
          table: SYNC_TABLE_NAME,
        }),
      );
    need('run_sync');
    const dryRun = form?.get('mode') === 'preview';
    const result = await runSpursSync({ trigger: dryRun ? 'preview' : 'button', startedBy: session.user.email, dryRun });
    for (const tag of result.tags) deps.revalidate(tag);
    if (result.rebuild) await triggerRebuild('airtable sync');
    return redirect(`${PREFIX}/sync`, [
      flashCookie({ text: result.message, kind: result.ok ? (result.rebuild ? 'warn' : 'ok') : 'error' }),
    ]);
  }

  // Legal pages
  if (path === `${PREFIX}/legal` && method === 'GET') {
    const overlay = await loadContentFiles();
    const docs = await Promise.all(
      LEGAL_KINDS.map(async kind => {
        const file = `src/copy/legal/${kind}.md`;
        const text = overlay.get(file) ?? (await readFile(join(/*turbopackIgnore: true*/ process.cwd(), file), 'utf8').catch(() => ''));
        return { kind, title: parseLegal(kind, text).title, edited: overlay.has(file) };
      }),
    );
    return page('Legal pages', legalList(docs));
  }
  const legal = /^\/admin\/legal\/(terms|privacy|accessibility)$/.exec(path);
  if (legal) {
    const kind = legal[1] as (typeof LEGAL_KINDS)[number];
    const filePath = `src/copy/legal/${kind}.md`;
    const current = (await readFile(join(/*turbopackIgnore: true*/ process.cwd(), filePath), 'utf8').catch(() => '')) as string;
    const overlay = await loadContentFiles();
    const text = overlay.get(filePath) ?? current;
    if (method === 'GET')
      return page(parseLegal(kind, text).title, legalEditor({ kind, title: parseLegal(kind, text).title, text, csrf: session.csrf }), 200, [
        ['Legal pages', '/admin/legal'],
        [parseLegal(kind, text).title],
      ]);
    need('edit_content');
    const body = String(form?.get('body') ?? '').replace(/\r\n/g, '\n');
    const problems: string[] = [];
    if (!body.trim()) problems.push('The page can’t be empty.');
    if (body.length > 200_000) problems.push('That’s too long for a legal page.');
    if (/\((?:verify|tbc)\b|\bTODO\b|\bTBC\b|lorem ipsum/i.test(body)) problems.push('Remove review notes (TODO, TBC, “verify”) first.');
    if (problems.length)
      return page(
        parseLegal(kind, text).title,
        legalEditor({ kind, title: parseLegal(kind, body).title, text: body, csrf: session.csrf, problems }),
        422,
      );
    await saveContentFiles({ [filePath]: body.endsWith('\n') ? body : `${body}\n` }, session.user.email);
    saved.paths.push(filePath);
    return done(`${PREFIX}/legal/${kind}`, { text: 'Saved.', kind: 'ok' });
  }

  // The content editors (src/admin)
  const local = path === `${PREFIX}/content` ? '/' : path.slice(PREFIX.length);
  const match = matchContent(method, local);
  if (match === 'method') throw new HttpError(405, 'Method not allowed.');
  if (!match) throw new HttpError(404, 'Not found.');
  if (method === 'POST') need('edit_content');
  const localUrl = new URL(local + url.search, url.origin);
  const result = (await match.handler({
    content,
    csrf: session.csrf,
    params: match.params,
    url: localUrl,
    form: form ? toSearchParams(form) : undefined,
    files: {},
    pending: null,
  })) as {
    title?: string;
    body?: string;
    crumbs?: [string, string?][];
    status?: number;
    redirect?: string;
    flash?: Flash;
    download?: unknown;
  };
  if (result.redirect)
    return done(
      mountPath(result.redirect),
      result.flash
        ? {
            ...result.flash,
            link: result.flash.link ? { ...result.flash.link, href: mountPath(result.flash.link.href) } : undefined,
            links: result.flash.links?.map(link => ({ ...link, href: mountPath(link.href) })),
          }
        : { text: 'Saved.', kind: 'ok' },
    );
  return page(result.title ?? 'CMS', result.body ?? '', result.status ?? 200, [['All sites', '/'], ...(result.crumbs ?? [])]);
}

/** The local admin reads forms as URLSearchParams-like objects (get / getAll). */
function toSearchParams(form: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of form) if (typeof value === 'string') params.append(key, value);
  return params;
}

function readFlash(request: Request): Flash | null {
  const value = unsignValue(readCookie(request, FLASH_COOKIE));
  if (!value) return null;
  try {
    return JSON.parse(value) as Flash;
  } catch {
    return null;
  }
}

const ASSETS: Record<string, [string, string]> = {
  'admin.css': ['src/admin/public/admin.css', 'text/css; charset=utf-8'],
  'admin.js': ['src/admin/public/admin.js', 'text/javascript; charset=utf-8'],
  'cms.css': ['lib/cms/cms.css', 'text/css; charset=utf-8'],
  'peptalk.png': ['public/peptalk/logo.png', 'image/png'],
  'favicon.png': ['public/peptalk/favicon.png', 'image/png'],
  'recoleta-alt-500.woff2': ['public/fonts/recoleta-alt-500.woff2', 'font/woff2'],
  'sofia-pro-300.woff2': ['public/fonts/sofia-pro-300.woff2', 'font/woff2'],
  'sofia-pro-500.woff2': ['public/fonts/sofia-pro-500.woff2', 'font/woff2'],
  'sofia-pro-700.woff2': ['public/fonts/sofia-pro-700.woff2', 'font/woff2'],
};

async function asset(name: string): Promise<Response> {
  const entry = ASSETS[name];
  if (!entry) return new Response('Not found', { status: 404, headers: NO_STORE });
  const body = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), entry[0]));
  return new Response(body, {
    headers: { 'Content-Type': entry[1], 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
