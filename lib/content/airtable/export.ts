// Reads Airtable exports for the offline dry run: the API's JSON (one response, an array of responses, or an array of
// records; fields keyed by ID or by name) or a CSV downloaded from a grid view (headers are field names). Both become
// AirtableRecord[] keyed by field ID, so the same mapper runs on them as on live API responses.
import { type AirtableConfig, type FieldRef, fieldIds } from './config.ts';
import type { AirtableRecord } from './mapper.ts';

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(cells => cells.some(value => value.trim() !== ''));
}

/** Every field reference in the config, so export columns can be matched by name. */
function refs(config: AirtableConfig): FieldRef[] {
  return [
    config.sites.field,
    config.publish.status?.field,
    config.publish.consent,
    config.publish.archived,
    ...Object.values(config.fields),
    config.images.hero,
    config.images.card,
    config.images.gallery,
    config.order,
  ].filter((ref): ref is FieldRef => ref !== undefined);
}

const CHECKED = new Set(['checked', 'true', 'yes', '1', '✓', '✔']);

/** A CSV cell as the API would return it for the field's type. */
function csvValue(ref: FieldRef, value: string): unknown {
  if (value === '') return undefined;
  switch (ref.type) {
    case 'checkbox':
      return CHECKED.has(value.trim().toLowerCase());
    case 'number':
      return Number.isFinite(Number(value)) ? Number(value) : value;
    case 'list':
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    default:
      return value;
  }
}

export interface ExportResult {
  records: AirtableRecord[];
  /** Mapped fields the export has no column for (by ID or name). */
  missingColumns: string[];
}

/** CSV export -> records. Columns are matched to the config by field `name`; record ids are `csv-row-<n>`. */
export function recordsFromCsv(text: string, config: AirtableConfig): ExportResult {
  const [header = [], ...rows] = parseCsv(text);
  const byName = new Map(refs(config).flatMap(ref => (ref.name ? [[ref.name, ref] as const] : [])));
  const columns = header.map(name => byName.get(name.trim()) ?? refs(config).find(ref => ref.id === name.trim()));
  const seen = new Set(columns.filter(Boolean).map(ref => (ref as FieldRef).id));
  const records = rows.map((cells, index) => {
    const fields: Record<string, unknown> = {};
    columns.forEach((ref, column) => {
      const value = ref ? csvValue(ref, cells[column] ?? '') : undefined;
      if (ref && value !== undefined) fields[ref.id] = value;
    });
    return { id: `csv-row-${index + 2}`, fields };
  });
  return { records, missingColumns: missing(config, seen) };
}

function missing(config: AirtableConfig, seen: Set<string>): string[] {
  return refs(config)
    .filter(ref => !seen.has(ref.id))
    .map(ref => (ref.name ? `${ref.name} (${ref.id})` : ref.id))
    .filter((value, index, all) => all.indexOf(value) === index);
}

/** JSON export (API responses or records; fields by ID or name) -> records keyed by field ID. */
export function recordsFromJson(data: unknown, config: AirtableConfig): ExportResult {
  const pages = Array.isArray(data) ? data : [data];
  const raw = pages.flatMap(page =>
    page && typeof page === 'object' && Array.isArray((page as { records?: unknown }).records)
      ? (page as { records: unknown[] }).records
      : [page],
  );
  const byName = new Map(refs(config).flatMap(ref => (ref.name ? [[ref.name, ref.id] as const] : [])));
  const seen = new Set<string>();
  const records = raw.map((entry, index) => {
    const record = (entry ?? {}) as { id?: unknown; createdTime?: unknown; fields?: Record<string, unknown> };
    if (!record.fields || typeof record.fields !== 'object') throw new Error(`Record ${index + 1} has no "fields" object`);
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.fields)) {
      const id = /^fld[A-Za-z0-9]{14}$/.test(key) ? key : byName.get(key);
      if (id) {
        fields[id] = value;
        seen.add(id);
      }
    }
    return {
      id: typeof record.id === 'string' ? record.id : `json-record-${index + 1}`,
      ...(typeof record.createdTime === 'string' ? { createdTime: record.createdTime } : {}),
      fields,
    };
  });
  const wanted = new Set(fieldIds(config));
  return { records, missingColumns: records.length ? missing(config, new Set([...seen].filter(id => wanted.has(id)))) : [] };
}
