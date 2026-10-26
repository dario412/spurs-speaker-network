// Dashboard and site-level actions: create, activate/deactivate, make root (a site or the landing page), reorder, edit settings.

import { shellSite } from '../../sites/scaffold.mjs';
import { withoutRoot, withSite } from '../../sites/store.mjs';
import { siteFile } from '../content.mjs';
import { applySiteForm, readNewSite } from '../forms.mjs';
import { jsonVocabKeys } from '../schema.mjs';
import { dashboard } from '../views/dashboard.mjs';
import { siteEditor } from '../views/site.mjs';
import { afterPublish, afterSave, siteCrumbs, siteOr404 } from './common.mjs';

const dashboardPage = (ctx, snap, extra = {}) => ({
  title: 'Sites',
  crumbs: [],
  body: dashboard({ registry: snap.registry, sites: snap.sites, csrf: ctx.csrf, ...extra }),
});

export const showDashboard = ctx => dashboardPage(ctx, ctx.content.snapshot());

export async function createSite(ctx) {
  const snap = ctx.content.snapshot();
  const { values, options, errors } = readNewSite(ctx.form);
  if (!errors.length && snap.registry.order.includes(values.slug)) errors.push(`"${values.slug}" is already in the registry`);
  else if (!errors.length && ctx.content.text(siteFile(values.slug, 'site')) !== undefined)
    errors.push(`src/sites/${values.slug}/ already exists but is not in the registry; add it there with the registry editor`);
  if (errors.length) return { status: 422, ...dashboardPage(ctx, snap, { newSite: { values, problems: errors } }) };

  const { slug, ...shell } = shellSite(options);
  // New sites start private: built and deployed only once someone activates them.
  const site = values.publish ? { slug, ...shell } : { slug, active: false, ...shell };
  const result = await ctx.content.saveSite(snap, site, {
    registry: withSite(snap.registry, slug),
    message: `content(${slug}): add shell site${values.publish ? '' : ' (inactive)'}`,
  });
  return afterPublish(result, `/sites/${slug}`, problems => dashboardPage(ctx, snap, { newSite: { values, problems } }), site);
}

export async function setActive(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const on = ctx.form.get('active') === 'on';
  // `active` sits next to `slug` so the switch is the first thing a reviewer sees in the diff.
  const { slug, active: _, ...rest } = site;
  const next = on ? { slug, ...rest } : { slug, active: false, ...rest };
  const result = await ctx.content.saveSite(snap, next, {
    registry: snap.registry,
    message: `content(${site.slug}): ${on ? 'activate' : 'deactivate'} site`,
  });
  return afterPublish(result, '/', problems => dashboardPage(ctx, snap, { problems }), next);
}

export async function makeRoot(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const result = await ctx.content.saveRegistry(
    snap,
    { ...snap.registry, rootSite: site.slug },
    `content: make ${site.slug} the root site`,
  );
  return afterSave(result, '/', problems => dashboardPage(ctx, snap, { problems }));
}

/** No root site: `/` serves the PepTalk landing page (and `/all` answers 301 to it). */
export async function makeLandingRoot(ctx) {
  const snap = ctx.content.snapshot();
  if (!snap.registry.rootSite) return { redirect: '/', flash: { text: 'The landing page is already the root.', kind: 'info' } };
  const result = await ctx.content.saveRegistry(snap, withoutRoot(snap.registry), 'content: make the landing page the root (no root site)');
  return afterSave(result, '/', problems => dashboardPage(ctx, snap, { problems }));
}

export async function move(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const order = [...snap.registry.order];
  const from = order.indexOf(site.slug);
  const to = from + (ctx.form.get('direction') === 'up' ? -1 : 1);
  if (to < 0 || to >= order.length) return { redirect: '/', flash: { text: 'Already at the end of the list.', kind: 'info' } };
  [order[from], order[to]] = [order[to], order[from]];
  const result = await ctx.content.saveRegistry(snap, { ...snap.registry, order }, `content: reorder sites (${site.slug})`);
  return afterSave(result, '/', problems => dashboardPage(ctx, snap, { problems }));
}

const editorPage = (ctx, site, snap, extra = {}) => ({
  title: site.orgName,
  crumbs: siteCrumbs(site, ['Settings']),
  body: siteEditor({ site, csrf: ctx.csrf, jsonKeys: jsonVocabKeys(snap.sites), ...extra }),
});

export function editSite(ctx) {
  const snap = ctx.content.snapshot();
  return editorPage(ctx, siteOr404(snap, ctx.params.slug), snap);
}

export async function saveSiteSettings(ctx) {
  const snap = ctx.content.snapshot();
  const stored = siteOr404(snap, ctx.params.slug);
  const { site, errors, raw } = applySiteForm(stored, ctx.form, { jsonKeys: jsonVocabKeys(snap.sites) });
  const render = problems => editorPage(ctx, site, snap, { problems, raw });
  if (errors.length) return { status: 422, ...render(errors) };
  const result = await ctx.content.saveSite(snap, site, { message: `content(${site.slug}): update site settings` });
  return afterSave(result, `/sites/${site.slug}`, render);
}
