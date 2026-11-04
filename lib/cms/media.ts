// The CMS media library, as in the Credible Creators CMS: uploads stored in the database and served from this site
// (/api/media/<id>), so every image has a stable https URL the content (images.json) and the image optimizer can use.
// Only PNG, JPEG and WebP (checked from the bytes, not the file name), at most 4 MB. No SVG: it can carry script.
import { randomBytes } from 'node:crypto';
import { sql } from './db.ts';
import type { MediaItem } from './views.ts';

export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MEDIA_PATH = '/api/media/';

/** The image type from its first bytes, or null. */
export function sniffImage(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  return null;
}

/** Media ids double as image ids in images.json: `m-` plus 10 random characters. */
export const MEDIA_ID = /^m-[a-z0-9]{10}$/;
const newId = () => `m-${Array.from(randomBytes(10), byte => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]).join('')}`;

export async function saveMedia(
  file: File,
  alt: string,
  userEmail: string,
  origin: string,
): Promise<{ id: string; url: string } | { problem: string }> {
  if (file.size === 0) return { problem: 'That file is empty.' };
  if (file.size > MAX_MEDIA_BYTES) return { problem: 'Images can be at most 4 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { problem: 'Upload a PNG, JPEG or WebP image.' };
  const id = newId();
  await sql().query(
    'INSERT INTO cms_media (id, file_name, mime_type, alt, byte_size, data, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, file.name.slice(0, 200), type, alt.trim().slice(0, 200), bytes.length, Buffer.from(bytes).toString('base64'), userEmail],
  );
  return { id, url: `${origin}${MEDIA_PATH}${id}` };
}

export async function deleteMedia(id: string): Promise<void> {
  await sql().query('DELETE FROM cms_media WHERE id = $1', [id]);
}

export async function listMedia(): Promise<MediaItem[]> {
  const rows = (await sql().query(
    'SELECT id, file_name, alt, byte_size, created_at FROM cms_media ORDER BY created_at DESC LIMIT 200',
  )) as {
    id: string;
    file_name: string;
    alt: string;
    byte_size: number;
    created_at: string;
  }[];
  return rows.map(row => ({
    id: row.id,
    fileName: row.file_name,
    alt: row.alt,
    byteSize: row.byte_size,
    createdAt: String(row.created_at),
    url: `${MEDIA_PATH}${row.id}`,
  }));
}

export async function readMedia(id: string): Promise<{ type: string; bytes: Buffer } | null> {
  if (!MEDIA_ID.test(id)) return null;
  const rows = (await sql().query('SELECT mime_type, data FROM cms_media WHERE id = $1', [id])) as { mime_type: string; data: string }[];
  return rows[0] ? { type: rows[0].mime_type, bytes: Buffer.from(rows[0].data, 'base64') } : null;
}
