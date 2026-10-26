// Read-only Airtable Web API client on fetch: list records with pagination, rate limiting and backoff.
// Facts it relies on (Airtable docs, read 2026-10-20):
// - POST https://api.airtable.com/v0/{baseId}/{tableId}/listRecords takes the list parameters as a JSON body; it
//   exists because URLs over 16,000 characters are refused (https://airtable.com/developers/web/api/list-records).
// - pageSize is at most 100; a response carries `offset` while more records exist; an expired iterator answers 422
//   LIST_RECORDS_ITERATOR_NOT_AVAILABLE and the listing restarts from the beginning (same page).
// - returnFieldsByFieldId: true keys `fields` by field ID (same page).
// - 5 requests per second per base; over it, 429 and "wait 30 seconds before subsequent requests will succeed"; no
//   Retry-After header is documented (https://airtable.com/developers/web/api/rate-limits).
// - 502/503 are transient and safe to retry with backoff; 401/403 are credentials (https://airtable.com/developers/web/api/errors).
// - Personal access tokens go in `Authorization: Bearer`; reading records needs the data.records:read scope
//   (https://airtable.com/developers/web/api/authentication, https://airtable.com/developers/web/api/scopes).
// The token is only ever placed in that header: it never appears in logs, errors or thrown messages.
import { ContentError } from '../errors.ts';
import type { AirtableRecord } from './mapper.ts';

export const API_ORIGIN = 'https://api.airtable.com';
/** 5 requests per second per base: keep a little under it. */
export const MIN_INTERVAL_MS = 220;
/** Airtable's documented penalty after a 429. */
export const RATE_LIMIT_WAIT_MS = 30_000;

export interface AirtableLogEvent {
  event: 'airtable.page' | 'airtable.retry' | 'airtable.restart' | 'airtable.record_skipped' | 'airtable.synced';
  [key: string]: unknown;
}

export interface ClientOptions {
  token: string;
  baseId: string;
  fetch?: typeof fetch;
  /** Injected so tests never wait for real. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (event: AirtableLogEvent) => void;
  /** Attempts per request for 429, 5xx and network errors (default 4). */
  attempts?: number;
  timeoutMs?: number;
}

export interface ListOptions {
  fields: string[];
  filterByFormula?: string;
  view?: string;
  maxPages: number;
}

interface ListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Structured JSON on stdout, the format Vercel's log drains parse. Never receives the token. */
export const jsonLog = (event: AirtableLogEvent): void => console.log(JSON.stringify(event));

/** `{ error: "NOT_FOUND" }` or `{ error: { type, message } }` -> a short, token-free description. */
async function errorText(response: Response): Promise<{ type: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: string | { type?: string; message?: string } };
    if (typeof body.error === 'string') return { type: body.error, message: body.error };
    return { type: body.error?.type ?? `HTTP_${response.status}`, message: body.error?.message ?? `HTTP ${response.status}` };
  } catch {
    return { type: `HTTP_${response.status}`, message: `HTTP ${response.status}` };
  }
}

export function createAirtableClient(options: ClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const log = options.log ?? jsonLog;
  const attempts = options.attempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 20_000;
  let nextSlot = 0;

  const throttle = async () => {
    const wait = nextSlot - now();
    if (wait > 0) await sleep(wait);
    nextSlot = Math.max(now(), nextSlot) + MIN_INTERVAL_MS;
  };

  const fail = (code: ConstructorParameters<typeof ContentError>[0], message: string, cause?: unknown) =>
    new ContentError(code, message, { provider: 'airtable', cause });

  /** One page, with retries. Returns the parsed body, or the 422 iterator signal so the caller can restart. */
  async function page(tableId: string, body: Record<string, unknown>): Promise<ListResponse | 'restart'> {
    const url = `${API_ORIGIN}/v0/${options.baseId}/${tableId}/listRecords`;
    for (let attempt = 1; ; attempt += 1) {
      await throttle();
      let response: Response;
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          // No fetch cache option: reads run inside the content layer's unstable_cache entries (lib/content/cached.ts),
          // where Next treats fetch as no-store; the tagged entry is the only cache.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt >= attempts)
          throw fail('unavailable', `Airtable unreachable after ${attempts} attempts (${(error as Error).name})`, error);
        const backoff = 1000 * 2 ** (attempt - 1);
        log({ event: 'airtable.retry', table: tableId, attempt, reason: (error as Error).name, waitMs: backoff });
        await sleep(backoff);
        continue;
      }
      if (response.ok) return (await response.json()) as ListResponse;
      const { type, message } = await errorText(response);
      if (response.status === 422 && type === 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE') return 'restart';
      if (response.status === 401 || response.status === 403)
        throw fail(
          'unauthorized',
          `Airtable refused the token (${response.status} ${type}): check its scopes (data.records:read) and base access`,
        );
      if (response.status === 404) throw fail('config', `Airtable base or table not found (404 ${type}): check baseId and tableId`);
      if (response.status === 422) throw fail('config', `Airtable rejected the request (422 ${type}): ${message}`);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= attempts)
        throw fail(
          response.status === 429 ? 'rate_limited' : 'unavailable',
          `Airtable answered ${response.status} ${type} after ${attempt} attempt(s)`,
        );
      const wait = response.status === 429 ? RATE_LIMIT_WAIT_MS : 1000 * 2 ** (attempt - 1);
      log({ event: 'airtable.retry', table: tableId, attempt, status: response.status, waitMs: wait });
      await sleep(wait);
      if (response.status === 429) nextSlot = now() + MIN_INTERVAL_MS;
    }
  }

  return {
    /** Every record of the table matching the options, across all pages. */
    async listRecords(tableId: string, list: ListOptions): Promise<AirtableRecord[]> {
      const base: Record<string, unknown> = { pageSize: 100, returnFieldsByFieldId: true, fields: list.fields };
      if (list.filterByFormula) base.filterByFormula = list.filterByFormula;
      if (list.view) base.view = list.view;
      for (let restarts = 0; restarts < 2; restarts += 1) {
        const records: AirtableRecord[] = [];
        let offset: string | undefined;
        let pages = 0;
        let restart = false;
        do {
          if (pages >= list.maxPages)
            throw fail(
              'invalid_content',
              `Airtable listing exceeded ${list.maxPages} pages; raise maxPages if the table really is that large`,
            );
          const started = now();
          const result = await page(tableId, offset ? { ...base, offset } : base);
          if (result === 'restart') {
            log({ event: 'airtable.restart', table: tableId, page: pages + 1 });
            restart = true;
            break;
          }
          if (!Array.isArray(result.records)) throw fail('invalid_content', 'Airtable response has no records array');
          records.push(...result.records);
          pages += 1;
          offset = typeof result.offset === 'string' ? result.offset : undefined;
          log({ event: 'airtable.page', table: tableId, page: pages, records: result.records.length, ms: now() - started });
        } while (offset);
        if (!restart) return records;
      }
      throw fail('unavailable', 'Airtable pagination kept expiring (LIST_RECORDS_ITERATOR_NOT_AVAILABLE)');
    },
  };
}

export type AirtableClient = ReturnType<typeof createAirtableClient>;
