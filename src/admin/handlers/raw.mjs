// Raw JSON editors for site.json, people.json, images.json, licences.json, verification.json and registry.json. Same rules as the forms: parse,
// validate the resulting site (or registry), write nothing on problems, write the canonical format on success.

import { emptyLicences } from '../../sites/licences.mjs';
import { formatJson } from '../../sites/store.mjs';
import { emptyVerification } from '../../sites/verification.mjs';
import { isKey, REGISTRY_PATH, siteFile } from '../content.mjs';
import { HttpError } from '../http.mjs';
import { RAW_FILES, rawEditor } from '../views/raw.mjs';
import { afterSave, siteCrumbs } from './common.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SHAPES = {
  site: [isObject, 'must be a JSON object'],
  people: [Array.isArray, 'must be a JSON array of people'],
  images: [isObject, 'must be a JSON object of id → URL'],
  licences: [isObject, 'must be a JSON object with "images" and "marks"'],
  verification: [isObject, 'must be a JSON object with "pages" and "people"'],
};
const EMPTY = { licences: emptyLicences, verification: emptyVerification };

/** Current text of a site file; the optional files read as empty ("nothing approved or checked yet") when absent. */
const currentText = (ctx, slug, file) => ctx.content.text(siteFile(slug, file)) ?? (EMPTY[file] ? formatJson(EMPTY[file]()) : undefined);

function parse(text, file) {
  try {
    const value = JSON.parse(text);
    const [ok, message] = file === 'registry' ? [isObject, 'must be a JSON object'] : SHAPES[file];
    return ok(value) ? { value } : { problems: [`${file}.json ${message}`] };
  } catch (error) {
    return { problems: [`${file}.json is not valid JSON: ${error.message}`] };
  }
}

/** Resolves `/sites/:slug/raw/:file`, allowing sites whose files do not parse (that is what this editor is for). */
function target(ctx, snap) {
  const { slug, file } = ctx.params;
  if (!RAW_FILES.includes(file)) throw new HttpError(404, `Unknown file "${file}".`);
  if (!snap.registry.order.includes(slug)) throw new HttpError(404, `"${slug}" is not in registry.json.`);
  return { slug, file, site: snap.find(slug) };
}

const page = (ctx, { site, slug, file, value, problems }) => ({
  title: `${slug ?? 'registry'} ${file}.json`,
  crumbs: site ? siteCrumbs(site, [`${file}.json`]) : [[slug ? `${slug} ${file}.json` : 'registry.json']],
  body: rawEditor({ site, slug, file, value, csrf: ctx.csrf, problems }),
});

export function showRaw(ctx) {
  const snap = ctx.content.snapshot();
  const { slug, file, site } = target(ctx, snap);
  const value = currentText(ctx, slug, file);
  if (value === undefined) throw new HttpError(404, `src/sites/${slug}/${file}.json does not exist.`);
  return page(ctx, { site, slug, file, value });
}

export async function saveRaw(ctx) {
  const snap = ctx.content.snapshot();
  const { slug, file, site } = target(ctx, snap);
  const value = ctx.form.get('json') ?? '';
  const render = problems => page(ctx, { site, slug, file, value, problems });
  const parsed = parse(value, file);
  if (parsed.problems) return { status: 422, ...render(parsed.problems) };

  // The other files come from storage as they are now; a site that could not be read needs them to parse.
  const parts = {};
  for (const name of RAW_FILES) {
    if (name === file) parts[name] = parsed.value;
    else {
      const other = parse(currentText(ctx, slug, name) ?? '', name);
      if (other.problems) return { status: 422, ...render([`Fix ${name}.json first: ${other.problems[0]}`]) };
      parts[name] = other.value;
    }
  }
  if (parts.site.slug !== slug) return { status: 422, ...render([`site.json slug must stay "${slug}" (the folder name)`]) };
  const { people, images, licences, verification } = parts;
  const candidate = { ...parts.site, people, images, licences, verification };
  const result = await ctx.content.saveSite(snap, candidate, { registry: snap.registry, message: `content(${slug}): edit ${file}.json` });
  return afterSave(result, `/sites/${slug}/raw/${file}`, render);
}

export function showRegistry(ctx) {
  return page(ctx, { file: 'registry', value: ctx.content.text(REGISTRY_PATH) ?? '' });
}

export async function saveRegistryRaw(ctx) {
  const snap = ctx.content.snapshot();
  const value = ctx.form.get('json') ?? '';
  const render = problems => page(ctx, { file: 'registry', value, problems });
  const parsed = parse(value, 'registry');
  if (parsed.problems) return { status: 422, ...render(parsed.problems) };
  const registry = parsed.value;
  const problems = [];
  if (!Array.isArray(registry.order) || !registry.order.every(isKey)) problems.push('registry: order must be a list of site slugs');
  if (registry.rootSite !== undefined && typeof registry.rootSite !== 'string')
    problems.push('registry: rootSite must be a slug, or left out for the landing page at /');
  if (!isObject(registry.redirects ?? {})) problems.push('registry: redirects must be an object');
  if (problems.length) return { status: 422, ...render(problems) };
  const result = await ctx.content.saveRegistry(snap, registry, 'content: edit registry.json');
  return afterSave(result, '/registry', render);
}
