// Parses the shared legal documents (src/copy/legal/*.md): YAML-style frontmatter, title, and the "Last update" line.
import type { LegalDoc, LegalKind } from './types.ts';

export const LEGAL_KINDS: readonly LegalKind[] = ['terms', 'privacy'];
export const isLegalKind = (value: string): value is LegalKind => (LEGAL_KINDS as readonly string[]).includes(value);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// "Last update: 03 June 2025" / "Last updated: …" on a line of its own.
const LAST_UPDATED = /^\s*Last updated?\s*:\s*(.+?)\s*$/im;

/** Flat `key: value` frontmatter (no nesting, which the legal files never use). */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: text.slice(match[0].length) };
}

export function parseLegal(kind: LegalKind, text: string): LegalDoc {
  const { meta, body } = parseFrontmatter(text);
  const updated = LAST_UPDATED.exec(body);
  return {
    kind,
    title: meta.title || (kind === 'terms' ? 'Terms' : 'Privacy Policy'),
    lastUpdated: updated ? updated[1] : null,
    body: (updated ? body.replace(updated[0], '') : body).trim(),
    meta,
  };
}
