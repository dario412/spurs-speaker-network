// Licences tab: approve pictures and marks. Saves go through the normal validated save path (licences.json only).
import { applyLicenceForm } from '../forms-entries.mjs';
import { licencesPage } from '../views/licences.mjs';
import { afterSave, siteCrumbs, siteOr404 } from './common.mjs';

const unapprovedOnly = ctx => ctx.url.searchParams.get('show') === 'unapproved';

const page = (ctx, site, problems = []) => ({
  title: `${site.orgName} licences`,
  crumbs: siteCrumbs(site, ['Licences']),
  body: licencesPage({ site, csrf: ctx.csrf, unapprovedOnly: unapprovedOnly(ctx), problems }),
});

export const showLicences = ctx => page(ctx, siteOr404(ctx.content.snapshot(), ctx.params.slug));

export async function saveLicences(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const { licences } = applyLicenceForm(site, ctx.form);
  const next = { ...site, licences };
  const result = await ctx.content.saveSite(snap, next, { message: `content(${site.slug}): update licence approvals` });
  const back = `/sites/${site.slug}/licences${unapprovedOnly(ctx) ? '?show=unapproved' : ''}`;
  return afterSave(result, back, problems => page(ctx, next, problems));
}
