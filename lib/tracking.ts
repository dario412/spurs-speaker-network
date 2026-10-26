// The tracking slot (off by default): Google Tag Manager and/or a GA4 tag, per site through site.json → tracking
// ({ gtmId?, ga4Id? }), with TRACKING_GTM_ID as a global fallback for sites that set none. One shared external script
// (public/tracking.js, added by components/document.tsx only for a site with tags) loads them, optionally only after
// consent (site.json → consent.required), and the proxy adds the Google hosts to the CSP only for those sites.
// Pure helpers here, used by the build manifest, the proxy, the validator, the root layout and the tests. Hosts: https://developers.google.com/tag-platform/security/guides/csp
import type { Site } from './content/types.ts';

type Env = Record<string, string | undefined>;

export interface Tracking {
  gtmId?: string;
  ga4Id?: string;
}

export const GTM_ID = /^GTM-[A-Z0-9]{4,10}$/;
export const GA4_ID = /^G-[A-Z0-9]{4,12}$/;

/** Problems with a site.json `tracking` value (undefined is fine: no tracking). */
export function trackingProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ['tracking must be { gtmId?, ga4Id? }'];
  const problems: string[] = [];
  for (const [key, id] of Object.entries(value)) {
    if (key === 'gtmId') {
      if (typeof id !== 'string' || !GTM_ID.test(id)) problems.push('tracking.gtmId must look like GTM-XXXXXXX');
    } else if (key === 'ga4Id') {
      if (typeof id !== 'string' || !GA4_ID.test(id)) problems.push('tracking.ga4Id must look like G-XXXXXXXXXX');
    } else problems.push(`tracking.${key} is not a tracking setting (gtmId, ga4Id)`);
  }
  return problems;
}

/** Problems with a site.json `consent` value. */
export function consentProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ['consent must be { required }'];
  return Object.entries(value).flatMap(([key, flag]) =>
    key !== 'required'
      ? [`consent.${key} is not a consent setting (required)`]
      : typeof flag !== 'boolean'
        ? ['consent.required must be true or false']
        : [],
  );
}

/** TRACKING_GTM_ID when it is a valid container id; anything else is ignored and logged once at build. */
export function envGtmId(env: Env = process.env): string | undefined {
  const raw = env.TRACKING_GTM_ID?.trim();
  if (!raw) return undefined;
  if (GTM_ID.test(raw)) return raw;
  console.error(
    JSON.stringify({ service: 'appearances', event: 'tracking.invalid', message: 'TRACKING_GTM_ID is not a GTM-… id; ignored' }),
  );
  return undefined;
}

/** The tags a site loads: its own `tracking`, else the TRACKING_GTM_ID fallback, else none (null). */
export function siteTracking(site: Pick<Site, 'tracking'>, fallbackGtmId: string | undefined): Tracking | null {
  const own: Tracking = {
    ...(site.tracking?.gtmId ? { gtmId: site.tracking.gtmId } : {}),
    ...(site.tracking?.ga4Id ? { ga4Id: site.tracking.ga4Id } : {}),
  };
  if (own.gtmId || own.ga4Id) return own;
  return fallbackGtmId ? { gtmId: fallbackGtmId } : null;
}

export const consentRequired = (site: Pick<Site, 'consent'>): boolean => site.consent?.required === true;

/** The only origin tag scripts load from; public/tracking.js's Trusted Types default policy allows nothing else. */
export const TAG_SCRIPT_ORIGIN = 'https://www.googletagmanager.com';

/** CSP sources added for a site with tracking (Google's tag-platform CSP guide: GTM plus GA4 without Ads features). */
export const TRACKING_CSP = {
  script: [TAG_SCRIPT_ORIGIN],
  connect: [TAG_SCRIPT_ORIGIN, 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.google.com'],
  img: [TAG_SCRIPT_ORIGIN, 'https://*.google-analytics.com'],
} as const;

export const CONSENT_COOKIE = 'pa_consent';
/** Six months (182 days), then the banner asks again. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
