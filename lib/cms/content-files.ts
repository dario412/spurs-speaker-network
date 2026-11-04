// Content saved from the CMS: one row per content file, keyed by repo-relative path (src/sites/<slug>/site.json …,
// src/sites/registry.json, src/copy/legal/<kind>.md). A path without a row reads the committed file, so the database
// only ever holds what an editor (or the Airtable sync) changed.
import { sql } from './db.ts';

/** Paths the CMS may store: content files only, never code. */
export const CONTENT_PATH =
  /^(?:src\/sites\/registry\.json|src\/sites\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:site|people|images|licences|verification)\.json|src\/copy\/legal\/(?:terms|privacy|accessibility)\.md)$/;

/** Every saved file, as path → body. */
export async function loadContentFiles(): Promise<Map<string, string>> {
  const rows = (await sql().query('SELECT path, body FROM cms_content_files')) as { path: string; body: string }[];
  return new Map(rows.map(row => [row.path, row.body]));
}

/** Writes files in one transaction (all or nothing); refuses any path that is not a content file. */
export async function saveContentFiles(files: Record<string, string>, userEmail: string | null): Promise<void> {
  const entries = Object.entries(files);
  for (const [path] of entries) if (!CONTENT_PATH.test(path)) throw new Error(`Not a content file: ${path}`);
  if (!entries.length) return;
  await sql().transaction(tx =>
    entries.map(([path, body]) =>
      tx.query(
        `INSERT INTO cms_content_files (path, body, updated_at, updated_by) VALUES ($1, $2, now(), $3)
         ON CONFLICT (path) DO UPDATE SET body = EXCLUDED.body, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [path, body, userEmail],
      ),
    ),
  );
}

/** When each saved file last changed, and by whom (the dashboard's "recent changes"). */
export async function recentChanges(limit = 10): Promise<{ path: string; updatedAt: string; updatedBy: string | null }[]> {
  const rows = (await sql().query('SELECT path, updated_at, updated_by FROM cms_content_files ORDER BY updated_at DESC LIMIT $1', [
    limit,
  ])) as {
    path: string;
    updated_at: string;
    updated_by: string | null;
  }[];
  return rows.map(row => ({ path: row.path, updatedAt: String(row.updated_at), updatedBy: row.updated_by }));
}
