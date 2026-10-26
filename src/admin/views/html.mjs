// Form and markup helpers for admin views. Every value placed in markup goes through esc(); helpers take raw values.

export const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const idFor = name => `f-${String(name).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
const hintFor = hint => (hint ? `<small class="hint">${esc(hint)}</small>` : '');
const attr = (name, value) =>
  value === undefined || value === null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;

export function field({ label, name, value, placeholder, hint, type = 'text', list, readonly, required, cls = '' }) {
  return `<div class="field ${cls}"><label for="${idFor(name)}">${esc(label)}</label><input id="${idFor(name)}" type="${type}" name="${esc(name)}" value="${esc(value)}"${attr('placeholder', placeholder)}${attr('list', list)}${attr('readonly', readonly)}${attr('required', required)}>${hintFor(hint)}</div>`;
}

export function area({ label, name, value, placeholder, hint, rows = 4, cls = '' }) {
  return `<div class="field ${cls}"><label for="${idFor(name)}">${esc(label)}</label><textarea id="${idFor(name)}" name="${esc(name)}" rows="${rows}"${attr('placeholder', placeholder)}>${esc(value)}</textarea>${hintFor(hint)}</div>`;
}

export function check({ label, name, checked, value = 'on', hint }) {
  return `<label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(value)}"${attr('checked', Boolean(checked))}><span>${esc(label)}${hint ? ` <small class="hint">${esc(hint)}</small>` : ''}</span></label>`;
}

/** @param {{ options: [string, string][] }} options value/label pairs */
export function select({ label, name, value, options, hint, cls = '' }) {
  const opts = options.map(
    ([v, text]) => `<option value="${esc(v)}"${attr('selected', String(v) === String(value ?? ''))}>${esc(text)}</option>`,
  );
  // Keep an unexpected stored value selectable instead of silently replacing it with the first option.
  if (value && !options.some(([v]) => String(v) === String(value)))
    opts.unshift(`<option value="${esc(value)}" selected>${esc(value)} (not recognised)</option>`);
  return `<div class="field ${cls}"><label for="${idFor(name)}">${esc(label)}</label><select id="${idFor(name)}" name="${esc(name)}">${opts.join('')}</select>${hintFor(hint)}</div>`;
}

/**
 * A colour picker plus a text field. Without JavaScript both are submitted; the server keeps whichever changed from
 * `<name>.was` (text wins if both did), so plain forms work and an invalid typed value still reaches the validator.
 */
export function colour({ label, name, value }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000';
  return `<div class="field colour"><label for="${idFor(name)}">${esc(label)}</label><span class="colour-pair"><input type="color" name="${esc(name)}.picker" value="${esc(hex.toLowerCase())}" aria-label="${esc(label)} picker" data-pair="${idFor(name)}"><input id="${idFor(name)}" type="text" name="${esc(name)}" value="${esc(value)}" placeholder="#rrggbb" spellcheck="false"></span><input type="hidden" name="${esc(name)}.was" value="${esc(value)}"></div>`;
}

export const thumb = url =>
  url
    ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<span class="thumb empty">No image</span>';

/** Image id input with a live thumbnail (admin.js updates it from the `image-ids` datalist). */
/** `licence` (optional) is a status badge shown beside the thumbnail, e.g. from views/licences.mjs licenceBadge(). */
export function imageInput({ label, name, value, images, hint, licence = '' }) {
  return `<div class="field image"><label for="${idFor(name)}">${esc(label)}</label><span class="image-pair">${thumb(images?.[value])}${licence}<input id="${idFor(name)}" type="text" name="${esc(name)}" value="${esc(value)}" list="image-ids" data-thumb placeholder="image id" spellcheck="false"></span>${hintFor(hint)}</div>`;
}

export const imageList = images =>
  `<datalist id="image-ids">${Object.entries(images ?? {})
    .map(([id, url]) => `<option value="${esc(id)}" data-url="${esc(url)}"></option>`)
    .join('')}</datalist>`;

export const csrfField = token => `<input type="hidden" name="_csrf" value="${esc(token)}">`;

/** A one-button POST form (state changes are never links). */
export function action({ href, csrf, label, fields = {}, cls = '', disabled = false, title }) {
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`)
    .join('');
  return `<form class="inline" method="post" action="${esc(href)}">${csrfField(csrf)}${hidden}<button class="btn ${cls}" type="submit"${attr('disabled', disabled)}${attr('title', title)}>${esc(label)}</button></form>`;
}

export function problemsBox(problems = [], heading = 'Nothing was saved. Fix these and try again:') {
  if (!problems.length) return '';
  return `<div class="alert error" role="alert"><p><b>${esc(heading)}</b></p><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
}

export const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;

export const section = (id, title, body, intro = '') =>
  `<section class="card" id="${esc(id)}"><h2>${esc(title)}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ''}${body}</section>`;
