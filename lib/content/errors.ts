// Typed content errors. Every provider failure surfaces as a ContentError with a stable `code`, never as an empty
// result: an empty roster or a missing site caused by an outage must fail the build (or keep the last good page under
// ISR), not publish a blank page. `null` is reserved for "this slug does not exist or is switched off".
export type ContentErrorCode =
  /** Provider misconfigured: missing env, bad config file, unknown provider. */
  | 'config'
  /** The source could not be reached or read (network, filesystem, upstream 5xx after retries). */
  | 'unavailable'
  /** Credentials rejected or lacking access (HTTP 401/403). */
  | 'unauthorized'
  /** The source kept rate limiting after the retries (HTTP 429). */
  | 'rate_limited'
  /** The source answered, but the content breaks the contract (schema, content rules, too many bad records). */
  | 'invalid_content';

export class ContentError extends Error {
  readonly code: ContentErrorCode;
  /** Which provider raised it (`json`, `airtable`, `cms`, `memory`). */
  readonly provider: string;
  /** Per-item problems (validation messages, skipped records), safe to log: never credentials. */
  readonly details: string[];

  constructor(code: ContentErrorCode, message: string, options: { provider: string; details?: string[]; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ContentError';
    this.code = code;
    this.provider = options.provider;
    this.details = options.details ?? [];
  }
}

export const isContentError = (error: unknown): error is ContentError => error instanceof ContentError;
