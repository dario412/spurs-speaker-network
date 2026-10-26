// The enquiry form's fields, shared by the form (components/site/components.tsx) and the endpoint (lib/enquiry/handler.ts),
// so the server checks exactly what the form asks for: the same names, required fields, lengths and choices.
// Pure functions of the submitted fields and the site's render context; nothing here logs or stores anything.
import type { SiteContext } from '../render/context.ts';

/** The endpoint (app/api/enquiry/route.ts): the only path the proxy lets POST through. */
export const ENQUIRY_PATH = '/api/enquiry';
/** Request header the proxy sets to the site whose own domain the form was posted on; removed on every other host. */
export const SITE_HEADER = 'x-appearances-site';

/** The confirmation under "Thanks, we're on it": forwarding on, or the concept build (nothing sent or stored). */
export const SENT_LIVE = 'The PepTalk bookings team will reply within one working day.';
export const SENT_CONCEPT =
  'In the live service the PepTalk bookings team would reply within one working day. This concept preview does not send or store your details.';

export const AUDIENCE_SIZES = ['Under 50', '50–250', '250–500', '500+'] as const;
export const DEFAULT_AUDIENCE_SIZE = '250–500';

/** maxLength of each free-text field (also set on the inputs). */
export const FIELD_LIMITS = { name: 120, email: 254, company: 160, brief: 4000 } as const;

/** Hidden fields: the site, the time the page's form was ready (set by the behaviour script), and the honeypot. */
export const SITE_FIELD = 'site';
export const STARTED_FIELD = 't';
/** A field people never see or fill (off-screen, no tab stop); bots that fill every input do. */
export const HONEYPOT_FIELD = 'website';

/** WHATWG "valid email address" (what `<input type="email">` accepts). */
const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface EnquiryFields {
  name: string;
  email: string;
  company: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  who: string;
  where: string;
  format: string;
  size: string;
  /** A person's slug on this site, or empty ("not sure yet"). */
  legend: string;
  brief: string;
}

export type FieldError = { field: keyof EnquiryFields; problem: 'required' | 'invalid' | 'too-long' };

const validDate = (value: string): boolean => {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/** Checks submitted fields against the site's form. Returns the clean fields, or the problems (field names only). */
export function checkEnquiry(
  form: URLSearchParams,
  ctx: Pick<SiteContext, 'v' | 'FORMATS' | 'bySlug'>,
): { ok: true; fields: EnquiryFields } | { ok: false; errors: FieldError[] } {
  const value = (name: keyof EnquiryFields) => (form.get(name) ?? '').trim();
  const fields: EnquiryFields = {
    name: value('name'),
    email: value('email'),
    company: value('company'),
    date: value('date'),
    who: value('who'),
    where: value('where'),
    format: value('format'),
    size: value('size'),
    legend: value('legend'),
    brief: value('brief'),
  };
  const errors: FieldError[] = [];
  for (const field of ['name', 'email', 'company'] as const) if (!fields[field]) errors.push({ field, problem: 'required' });
  for (const [field, max] of Object.entries(FIELD_LIMITS) as [keyof typeof FIELD_LIMITS, number][])
    if (fields[field].length > max) errors.push({ field, problem: 'too-long' });
  if (fields.email && !EMAIL.test(fields.email)) errors.push({ field: 'email', problem: 'invalid' });
  if (fields.date && !validDate(fields.date)) errors.push({ field: 'date', problem: 'invalid' });
  const choice = (field: keyof EnquiryFields, options: readonly string[]) => {
    if (!options.includes(fields[field])) errors.push({ field, problem: fields[field] ? 'invalid' : 'required' });
  };
  choice('who', ctx.v.whoOptions);
  choice('where', ctx.v.whereOptions);
  choice(
    'format',
    Object.values(ctx.FORMATS).map(format => format.title),
  );
  choice('size', AUDIENCE_SIZES);
  if (fields.legend && !Object.hasOwn(ctx.bySlug, fields.legend)) errors.push({ field: 'legend', problem: 'invalid' });
  return errors.length ? { ok: false, errors } : { ok: true, fields };
}
