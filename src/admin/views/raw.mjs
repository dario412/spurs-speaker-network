// Raw JSON editor: the escape hatch for anything the forms do not cover (roles, eras, formats, FAQ overrides…).
import { csrfField, esc, problemsBox } from './html.mjs';
import { siteHeader } from './layout.mjs';

export const RAW_FILES = ['site', 'people', 'images', 'licences', 'verification'];

/**
 * @param {{ site?: object, slug?: string, file: string, value: string, csrf: string, problems?: string[] }} options
 * Without `site` (registry, or a site whose files do not parse) only a plain heading is shown.
 */
export function rawEditor({ site, slug, file, value, csrf, problems = [] }) {
  const action = slug ? `/sites/${slug}/raw/${file}` : '/registry';
  const tabs = slug
    ? `<nav class="tabs sub" aria-label="Files">${RAW_FILES.map(
        name => `<a href="/sites/${esc(slug)}/raw/${name}"${name === file ? ' aria-current="page"' : ''}>${name}.json</a>`,
      ).join('')}</nav>`
    : '';
  const head = site
    ? siteHeader(site, 'Raw JSON')
    : `<div class="page-head"><div><h1>${esc(slug ? `${slug}: ${file}.json` : 'registry.json')}</h1><p class="sub">${slug ? 'This site’s files could not be read; fix them here.' : 'Site order, the root site and old-slug redirects.'}</p></div></div>`;
  return `${head}
${tabs}
${problemsBox(problems)}
<form method="post" action="${esc(action)}" class="editor">${csrfField(csrf)}
<section class="card"><p class="intro">Edits the whole file. It is parsed, validated and rewritten in the canonical format (2-space JSON) before saving.</p>
<textarea class="raw" name="json" rows="32" spellcheck="false" aria-label="${esc(file)}.json">${esc(value)}</textarea></section>
<div class="savebar"><button class="btn primary" type="submit">Save ${esc(file)}.json</button></div>
</form>`;
}
