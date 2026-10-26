// A fake Airtable API for tests: serves test/fixtures/airtable/records.json page by page through a mocked fetch and
// records every request. Tests never call the real API.
import { readFileSync } from 'node:fs';
import type { AirtableRecord } from '../../../lib/content/airtable/mapper.ts';

export const FIXTURE_DIR = new URL('./', import.meta.url);
export const TOKEN = 'patFIXTURE.secret-token-value-0123456789';

export const fixtureJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), 'utf8'));
export const fixturePages = (): { records: AirtableRecord[]; offset?: string }[] =>
  fixtureJson('records.json') as { records: AirtableRecord[]; offset?: string }[];

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Replies in order; when they run out, serves the fixture pages by offset. */
export function mockAirtable(replies: (Response | Error | (() => Response))[] = []) {
  const calls: Call[] = [];
  const pages = fixturePages();
  const queue = [...replies];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(input), method: init?.method ?? 'GET', headers: { ...(init?.headers as Record<string, string>) }, body });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (next) return typeof next === 'function' ? next() : next;
    const index = body.offset ? pages.findIndex(page => page.offset === body.offset) + 1 : 0;
    return Response.json(pages[index] ?? { records: [] });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const airtableError = (status: number, error: unknown) => Response.json({ error }, { status });
