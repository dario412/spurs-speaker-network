// Wording overrides: every VOCAB key with its default as the placeholder. Empty means "use the default".
import { VOCAB_KEYS, vocabDefault } from '../schema.mjs';
import { area, field, section } from './html.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const NO_DEFAULT = '(no shared default: the page builds its own text)';

/** @param {{ raw: Record<string, string>, jsonKeys: Set<string> }} options */
export function wordingSection(site, { raw, jsonKeys }) {
  const vocab = site.vocab ?? {};
  const rows = VOCAB_KEYS.map(key => {
    const name = `vocab.${key}`;
    const fallback = vocabDefault(key);
    const stored = vocab[key];
    if (jsonKeys.has(key)) {
      const value = raw[name] ?? (stored === undefined ? '' : pretty(stored));
      return area({
        label: key,
        name,
        value,
        rows: 4,
        placeholder: fallback == null ? NO_DEFAULT : pretty(fallback),
        hint: 'JSON',
        cls: 'span2 mono',
      });
    }
    const placeholder = fallback == null ? NO_DEFAULT : String(fallback);
    const value = stored == null ? '' : String(stored);
    return placeholder.length > 70 || value.length > 70
      ? area({ label: key, name, value, rows: 2, placeholder, cls: 'span2' })
      : field({ label: key, name, value, placeholder });
  }).join('');
  return section(
    'wording',
    'Wording',
    `<div class="grid">${rows}</div>`,
    'Override any wording for this site. The grey text is the default; clear a field to go back to it. Values are trusted HTML.',
  );
}
