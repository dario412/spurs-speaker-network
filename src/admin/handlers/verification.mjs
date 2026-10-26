// Verification tab: progress for every built page and visible profile, and one checklist per entry.
// Saves go through the normal validated save path (verification.json only).
import { normaliseVerification, verificationEntries } from '../../sites/verification.mjs';
import { applyChecklistForm } from '../forms-entries.mjs';
import { HttpError } from '../http.mjs';
import { checklistPage, entrySegment, verificationList } from '../views/verification.mjs';
import { afterSave, siteCrumbs, siteOr404 } from './common.mjs';

const incompleteOnly = ctx => ctx.url.searchParams.get('show') === 'incomplete';
const listCrumbs = site => siteCrumbs(site, ['Verification', `/sites/${site.slug}/verification`]);

export function showVerification(ctx) {
  const site = siteOr404(ctx.content.snapshot(), ctx.params.slug);
  return {
    title: `${site.orgName} verification`,
    crumbs: siteCrumbs(site, ['Verification']),
    body: verificationList({ site, csrf: ctx.csrf, incompleteOnly: incompleteOnly(ctx) }),
  };
}

/** The entry named by `/verification/:group/:key`; only pages and people that are built have one. */
function entryOr404(site, group, key) {
  const entry = verificationEntries(site).find(e => e.group === group && entrySegment(e) === key);
  if (!entry) throw new HttpError(404, `Nothing to verify at ${group}/${key}: it does not exist or is not built (switched off or hidden).`);
  return entry;
}

const page = (ctx, site, entry, problems = []) => ({
  title: `Verify ${entry.label}`,
  crumbs: [...listCrumbs(site), [entry.label]],
  body: checklistPage({ site, entry, csrf: ctx.csrf, problems }),
});

export function showChecklist(ctx) {
  const site = siteOr404(ctx.content.snapshot(), ctx.params.slug);
  return page(ctx, site, entryOr404(site, ctx.params.group, ctx.params.key));
}

export async function saveChecklist(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const entry = entryOr404(site, ctx.params.group, ctx.params.key);
  const verification = normaliseVerification(site.verification);
  const record = applyChecklistForm(entry, ctx.form);
  if (record) verification[entry.group][entry.key] = record;
  else delete verification[entry.group][entry.key];
  const next = { ...site, verification };
  const result = await ctx.content.saveSite(snap, next, { message: `content(${site.slug}): verify ${entry.group}/${entry.key}` });
  return afterSave(result, `/sites/${site.slug}/verification/${entry.group}/${entrySegment(entry)}`, problems =>
    page(ctx, site, entry, problems),
  );
}
