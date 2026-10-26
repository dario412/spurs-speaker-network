// People: the roster table, the person editor and the delete confirmation.
import { licenceAssets } from '../../sites/licences.mjs';
import { verificationEntries } from '../../sites/verification.mjs';
import { FORMAT_KEYS, formatLabel, PERSON_LISTS, PERSON_PAIRS, PERSON_STRINGS, PERSON_TEXTS } from '../schema.mjs';
import { action, area, badge, check, csrfField, esc, field, imageInput, imageList, problemsBox, section, select, thumb } from './html.mjs';
import { siteHeader } from './layout.mjs';
import { licenceBadge } from './licences.mjs';
import { checklistHref, verificationBadge } from './verification.mjs';

const labelOf = (list, key) => list?.find(item => item.key === key)?.label ?? key;

function addForm({ site, csrf, values = {}, problems = [] }) {
  return `<section class="card" id="add-person"><h2>Add a person</h2>
${problemsBox(problems)}
<form method="post" action="/sites/${esc(site.slug)}/people">${csrfField(csrf)}<input type="hidden" name="_form" value="add">
<div class="grid">${field({ label: 'Slug', name: 'slug', value: values.slug, placeholder: 'harry-kane', required: true })}${field({ label: 'Name', name: 'name', value: values.name, required: true })}</div>
<p><button class="btn primary" type="submit">Continue</button> <small class="hint">Opens the full editor; nothing is saved until the profile is complete.</small></p>
</form></section>`;
}

/** Link to the person's verification checklist with its progress; hidden people have none (they are not built). */
function checklistLink(site, person) {
  const entry = verificationEntries(site).find(e => e.group === 'people' && e.key === person.slug);
  if (!entry) return '';
  return `<a class="btn" href="${esc(checklistHref(site, entry))}">Checklist ${entry.stale ? entry.checked : entry.done}/${entry.total} ${verificationBadge(entry.state)}</a>`;
}

/** @param {{ site: object, csrf: string, add?: object }} options */
export function peopleList({ site, csrf, add = {} }) {
  const featured = new Set(site.featured ?? []);
  const base = `/sites/${site.slug}/people`;
  // Hidden people are not built, so they have no checklist and no verification badge.
  const checks = new Map(
    verificationEntries(site)
      .filter(e => e.group === 'people')
      .map(e => [e.key, e]),
  );
  const verify = person => {
    const entry = checks.get(person.slug);
    return entry ? `<a href="${esc(checklistHref(site, entry))}">${verificationBadge(entry.state)}</a>` : '';
  };
  const rows = site.people
    .map(person => {
      const active = person.active !== false;
      const href = `${base}/${person.slug}`;
      return `<tr>
<td class="pic">${thumb(site.images[person.card])}</td>
<td data-label="Name"><a href="${esc(href)}"><b>${esc(person.name)}</b></a><br><small>${esc(person.slug)}</small></td>
<td data-label="Role">${esc(person.roleLabel)}</td>
<td data-label="Era">${esc(labelOf(site.eras, person.era))}</td>
<td data-label="Status">${active ? badge('Visible', 'ok') : badge('Hidden', 'muted')} ${featured.has(person.slug) ? badge('Featured', 'accent') : ''}</td>
<td data-label="Verified">${verify(person)}</td>
<td data-label="Actions"><div class="actions"><a class="btn" href="${esc(href)}">Edit</a>${action({ href: `${href}/active`, csrf, label: active ? 'Hide' : 'Show', fields: { active: active ? 'off' : 'on' } })}</div></td>
</tr>`;
    })
    .join('\n');
  return `${siteHeader(site, 'People')}
${problemsBox(add.listProblems ?? [])}
<div class="table-wrap"><table class="people"><thead><tr><th><span class="visually-hidden">Photo</span></th><th>Name</th><th>Role</th><th>Era</th><th>Status</th><th>Verified</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
${addForm({ site, csrf, ...add })}`;
}

/**
 * @param {{ site: object, person: object, csrf: string, problems?: string[], creating?: boolean, extra?: object }} options
 * `extra` re-displays the "add image" fields after a failed save.
 */
export function personEditor({ site, person, csrf, problems = [], creating = false, extra = {} }) {
  const base = `/sites/${site.slug}/people`;
  const formAction = creating ? base : `${base}/${person.slug}`;
  const strings = PERSON_STRINGS.map(([key, label, hint]) => field({ label, name: key, value: person[key], hint })).join('');
  const texts = PERSON_TEXTS.map(([key, label]) => area({ label, name: key, value: person[key], rows: 3, cls: 'span2' })).join('');
  const lists = PERSON_LISTS.map(([key, label]) =>
    area({
      label,
      name: key,
      value: (person[key] ?? []).join('\n'),
      rows: key === 'bio' ? 8 : 4,
      hint: 'One per line',
      cls: key === 'bio' ? 'span2' : '',
    }),
  ).join('');
  const pairs = PERSON_PAIRS.map(([key, label, hint]) =>
    area({
      label,
      name: key,
      value: (person[key] ?? []).map(pair => pair.join(' | ')).join('\n'),
      rows: 5,
      hint: `value | caption per line. ${hint}`,
    }),
  ).join('');
  const formats = FORMAT_KEYS.map(key =>
    check({ label: formatLabel(key), name: 'formats', value: key, checked: person.formats?.includes(key) }),
  ).join('');
  // Licence status beside each thumbnail: a reminder, never a blocker.
  const statuses = new Map(
    licenceAssets(site)
      .filter(asset => asset.kind === 'image')
      .map(asset => [asset.id, asset.status]),
  );
  const licence = id => (statuses.has(id) ? licenceBadge(statuses.get(id)) : '');
  const images = [
    imageInput({ label: 'Hero', name: 'hero', value: person.hero, images: site.images, licence: licence(person.hero) }),
    imageInput({ label: 'Card (shows the face)', name: 'card', value: person.card, images: site.images, licence: licence(person.card) }),
    ...[0, 1, 2].map(i =>
      imageInput({
        label: `Gallery ${i + 1}`,
        name: `gallery.${i}`,
        value: person.gallery?.[i],
        images: site.images,
        licence: licence(person.gallery?.[i]),
      }),
    ),
  ].join('');
  const slugField = creating
    ? field({ label: 'Slug', name: 'slug', value: person.slug, required: true })
    : field({
        label: 'Slug',
        name: 'slug-display',
        value: person.slug,
        readonly: true,
        hint: 'Fixed once created: featured lists, checklists and URLs link to it',
      });
  const title = creating ? `New person: ${person.name || person.slug}` : person.name;
  return `${siteHeader(site, 'People')}
<div class="page-head"><h2>${esc(title)}</h2>${creating ? '' : `<div class="head-actions">${checklistLink(site, person)}<a class="btn" href="/preview/${esc(site.slug)}/legends/${esc(person.slug)}" target="_blank" rel="noopener">Preview profile</a><a class="btn danger" href="${esc(`${base}/${person.slug}/delete`)}">Delete…</a></div>`}</div>
${problemsBox(problems)}
<form method="post" action="${esc(formAction)}" class="editor">${csrfField(csrf)}<input type="hidden" name="_form" value="person">
${imageList(site.images)}
${section(
  'identity',
  'Identity',
  `<div class="grid">${slugField}${select({ label: 'Role', name: 'role', value: person.role, options: (site.roles ?? []).map(r => [r.key, r.label]) })}${select({ label: 'Era', name: 'era', value: person.era, options: (site.eras ?? []).map(e => [e.key, e.label]) })}${strings}${texts}</div>
<div class="checks">${check({ label: 'Visible on the site', name: 'active', checked: person.active !== false })}${check({ label: 'Limited availability (current role)', name: 'limited', checked: person.limited === true, hint: 'Always on for current players' })}</div>`,
)}
${section(
  'images',
  'Images',
  `<div class="grid">${images}</div><h3>Add an image to images.json</h3><div class="grid">${field({ label: 'Image id', name: 'newImage.id', value: extra.newId, placeholder: '2206513784' })}${field({ label: 'Image URL', name: 'newImage.url', value: extra.newUrl, placeholder: 'https://media.gettyimages.com/id/…', cls: 'span2' })}</div>`,
  'Getty comps or licensed files only, and never reuse an image across people.',
)}
${section('profile', 'Profile', `<div class="grid">${lists}${pairs}${area({ label: 'Official profiles elsewhere (sameAs)', name: 'sameAs', value: (person.sameAs ?? []).join('\n'), rows: 4, cls: 'span2', hint: 'One https URL per line, up to 10: their page on the organisation’s site, Wikipedia, Wikidata, verified social accounts. Only pages that are definitely about this person; they tie the profile to them for search engines.' })}</div>`)}
${section('formats', 'Booking formats', `<div class="checks columns">${formats}</div>`)}
<div class="savebar"><button class="btn primary" type="submit">${creating ? 'Create person' : 'Save person'}</button><a class="btn" href="${esc(base)}">Cancel</a></div>
</form>`;
}

/** @param {{ site: object, person: object, csrf: string, blockers: string[] }} options */
export function deletePerson({ site, person, csrf, blockers }) {
  const base = `/sites/${site.slug}/people`;
  const body = blockers.length
    ? `<div class="alert error"><p><b>${esc(person.name)} can’t be deleted yet:</b></p><ul>${blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div><p><a class="btn" href="${esc(`${base}/${person.slug}`)}">Back to ${esc(person.name)}</a></p>`
    : `<p>This removes <b>${esc(person.name)}</b> (${esc(person.slug)}) from people.json. Their images stay in images.json. Hiding them instead keeps the profile for later.</p>
<div class="actions">${action({ href: `${base}/${person.slug}/delete`, csrf, label: `Delete ${person.name}`, cls: 'danger', fields: { confirm: 'yes' } })}${action({ href: `${base}/${person.slug}/active`, csrf, label: 'Hide instead', fields: { active: 'off' } })}<a class="btn" href="${esc(`${base}/${person.slug}`)}">Cancel</a></div>`;
  return `${siteHeader(site, 'People')}<section class="card"><h2>Delete ${esc(person.name)}?</h2>${body}</section>`;
}
