// Shared handler helpers. Handlers return `{ title, body, status?, crumbs? }` to render, or `{ redirect, flash }`.
import { licenceStatus } from '../../sites/licences.mjs';
import { verificationStatus } from '../../sites/verification.mjs';
import { HttpError } from '../http.mjs';

/** The stored site named in the URL, or a 404. The router has already checked the slug pattern. */
export function siteOr404(snap, slug) {
  const site = snap.find(slug);
  if (!site) throw new HttpError(404, `There is no readable site "${slug}" in registry.json.`);
  return site;
}

export function flashFor(saved) {
  if (saved.unchanged) return { text: 'No changes to save.', kind: 'info' };
  return { text: saved.message, link: saved.link, kind: 'ok' };
}

/**
 * Turns a save attempt into a response: redirect with a flash on success (POST/redirect/GET), or re-render via
 * `onProblems` with status 422 so the user's input is kept and nothing has been written.
 */
export function afterSave(result, redirect, onProblems) {
  if (result.problems) return { status: 422, ...onProblems(result.problems) };
  return { redirect, flash: flashFor(result.saved) };
}

/**
 * Activating (or creating a published site) never waits for licences or verification; it says what is outstanding.
 * Wraps `afterSave` so the success flash becomes a warning when the saved site is live with gaps.
 */
export function afterPublish(result, redirect, onProblems, site) {
  const response = afterSave(result, redirect, onProblems);
  if (!response.redirect || result.saved.unchanged || site.active === false) return response;
  const licences = licenceStatus(site);
  const checks = verificationStatus(site);
  const gaps = [];
  const links = [];
  if (licences.approved < licences.total) {
    gaps.push(`${licences.total - licences.approved} unlicensed assets`);
    links.push({ href: `/sites/${site.slug}/licences?show=unapproved`, label: 'Review licences' });
  }
  if (checks.verified < checks.total) {
    gaps.push(`${checks.total - checks.verified} unverified pages or profiles`);
    links.push({ href: `/sites/${site.slug}/verification?show=incomplete`, label: 'Review checklists' });
  }
  if (!gaps.length) return response;
  return {
    ...response,
    flash: { ...response.flash, kind: 'warn', text: `Published with ${gaps.join(' and ')}. ${response.flash.text}`, links },
  };
}

export const siteCrumbs = (site, ...rest) => [[site.orgName ?? site.slug, `/sites/${site.slug}`], ...rest];
