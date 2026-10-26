// People: list, add (via the full editor), edit, show/hide, delete with a confirmation step.
import { validateSite } from '../../../scripts/validate-content.mjs';
import { applyPersonForm, personTemplate, readNewPerson } from '../forms-entries.mjs';
import { HttpError } from '../http.mjs';
import { deletePerson, peopleList, personEditor } from '../views/people.mjs';
import { afterSave, siteCrumbs, siteOr404 } from './common.mjs';

const personOr404 = (site, key) => {
  const person = site.people.find(p => p.slug === key);
  if (!person) throw new HttpError(404, `There is no person "${key}" on ${site.slug}.`);
  return person;
};

const listPage = (ctx, site, add) => ({
  title: `${site.orgName} people`,
  crumbs: siteCrumbs(site, ['People']),
  body: peopleList({ site, csrf: ctx.csrf, add }),
});

const editorPage = (ctx, site, person, extra = {}) => ({
  title: person.name || 'New person',
  crumbs: siteCrumbs(site, ['People', `/sites/${site.slug}/people`], [person.name || 'New person']),
  body: personEditor({ site, person, csrf: ctx.csrf, ...extra }),
});

export function listPeople(ctx) {
  return listPage(ctx, siteOr404(ctx.content.snapshot(), ctx.params.slug));
}

export function editPerson(ctx) {
  const site = siteOr404(ctx.content.snapshot(), ctx.params.slug);
  return editorPage(ctx, site, personOr404(site, ctx.params.key));
}

/** Writes `site` with `person` in place (or appended) and images.json updated, after validating the whole site. */
async function persist(ctx, snap, site, person, images, { creating, message }) {
  const people = creating ? [...site.people, person] : site.people.map(p => (p.slug === person.slug ? person : p));
  return ctx.content.saveSite(snap, { ...site, people, images }, { message });
}

/**
 * POST /sites/:slug/people handles both the mini "Add a person" form and the full editor in create mode.
 * The mini form never saves: it opens the editor with a template and the validator's list of missing fields.
 */
export async function createPerson(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  if (ctx.form.get('_form') !== 'person') {
    const { slug, name, errors } = readNewPerson(ctx.form, site);
    if (errors.length) return { status: 422, ...listPage(ctx, site, { values: { slug, name }, problems: errors }) };
    const person = personTemplate({ slug, name }, site);
    const problems = validateSite({ ...site, people: [...site.people, person] });
    return editorPage(ctx, site, person, { creating: true, problems });
  }
  const { slug, name, errors: slugErrors } = readNewPerson(ctx.form, site);
  const base = personTemplate({ slug, name }, site);
  const { person, images, errors } = applyPersonForm(base, ctx.form, site);
  const extra = { newId: ctx.form.get('newImage.id'), newUrl: ctx.form.get('newImage.url') };
  const render = problems => editorPage(ctx, { ...site, images }, person, { creating: true, problems, extra });
  if (slugErrors.length || errors.length) return { status: 422, ...render([...slugErrors, ...errors]) };
  const result = await persist(ctx, snap, site, person, images, { creating: true, message: `content(${site.slug}): add ${person.slug}` });
  return afterSave(result, `/sites/${site.slug}/people/${person.slug}`, render);
}

export async function savePerson(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const stored = personOr404(site, ctx.params.key);
  const { person, images, errors } = applyPersonForm(stored, ctx.form, site);
  const extra = { newId: ctx.form.get('newImage.id'), newUrl: ctx.form.get('newImage.url') };
  const render = problems => editorPage(ctx, { ...site, images }, person, { problems, extra });
  if (errors.length) return { status: 422, ...render(errors) };
  const result = await persist(ctx, snap, site, person, images, { message: `content(${site.slug}): update ${person.slug}` });
  return afterSave(result, `/sites/${site.slug}/people/${person.slug}`, render);
}

export async function setPersonActive(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const person = { ...personOr404(site, ctx.params.key) };
  const on = ctx.form.get('active') === 'on';
  if (on) delete person.active;
  else person.active = false;
  const result = await persist(ctx, snap, site, person, site.images, {
    message: `content(${site.slug}): ${on ? 'show' : 'hide'} ${person.slug}`,
  });
  return afterSave(result, `/sites/${site.slug}/people`, problems => listPage(ctx, site, { listProblems: problems }));
}

/** Why a person cannot be deleted yet. A featured link would otherwise point at a missing profile. */
function blockersFor(site, person) {
  const blockers = [];
  if (site.featured?.includes(person.slug))
    blockers.push('They are featured on the homepage. Untick them under Site settings → Featured first.');
  return blockers;
}

export function confirmDeletePerson(ctx) {
  const site = siteOr404(ctx.content.snapshot(), ctx.params.slug);
  const person = personOr404(site, ctx.params.key);
  return {
    title: `Delete ${person.name}`,
    crumbs: siteCrumbs(site, ['People', `/sites/${site.slug}/people`], [person.name]),
    body: deletePerson({ site, person, csrf: ctx.csrf, blockers: blockersFor(site, person) }),
  };
}

export async function removePerson(ctx) {
  const snap = ctx.content.snapshot();
  const site = siteOr404(snap, ctx.params.slug);
  const person = personOr404(site, ctx.params.key);
  const blockers = blockersFor(site, person);
  if (blockers.length || ctx.form.get('confirm') !== 'yes') return { status: 409, ...confirmDeletePerson(ctx) };
  const next = { ...site, people: site.people.filter(p => p.slug !== person.slug) };
  const result = await ctx.content.saveSite(snap, next, { message: `content(${site.slug}): remove ${person.slug}` });
  return afterSave(result, `/sites/${site.slug}/people`, problems => ({
    title: `Delete ${person.name}`,
    crumbs: siteCrumbs(site, ['People', `/sites/${site.slug}/people`], [person.name]),
    body: deletePerson({ site, person, csrf: ctx.csrf, blockers: problems }),
  }));
}
