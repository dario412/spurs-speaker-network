// Content-Security-Policy for prerendered (static) pages. See docs/architecture.md, "Rendering and CSP".
// A nonce only exists per request, and Next.js's inline bootstrap scripts (the RSC payload) differ per page, so a static
// page can't carry a nonce, and the proxy can't know per-page hashes. Scripts are therefore 'self' plus inline; every
// other directive stays as strict as before: no third-party scripts, no inline styles, no plugins, no <base>, no
// framing, forms only to this origin, and images only from this origin and the content's hosts.
// What 'unsafe-inline' gives up, and why that's acceptable here: the HTML is generated at build time from reviewed
// content and never echoes the request, React escapes every value, and the JSON-LD block escapes `<`, so there is no
// path for injected markup to reach a page. Trusted Types close the client-side route (DOM XSS), and the framework's
// script files carry SRI hashes (experimental.sri). Revisit if a page ever renders request data or user content.
//
// Tracking (lib/tracking.ts, off by default) widens the policy only for a site that loads tags: Google's tag hosts in
// script-src, connect-src and img-src, and a Trusted Types `default` policy instead of none. That policy is created by
// public/tracking.js and lets a string become a script URL only on https://www.googletagmanager.com, and never lets a
// string become HTML or script, so innerHTML and eval still throw.
// The enquiry form posts to /api/enquiry on this origin, so form-action and connect-src stay 'self'.
import { TRACKING_CSP } from '../tracking.ts';

export function buildCsp({
  imageHosts,
  dev = false,
  tracking = false,
}: {
  imageHosts: string[];
  dev?: boolean;
  tracking?: boolean;
}): string {
  const extra = (hosts: readonly string[]) => (tracking ? hosts.map(host => ` ${host}`).join('') : '');
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${extra(TRACKING_CSP.script)}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    `img-src 'self' ${imageHosts.join(' ')}${extra(TRACKING_CSP.img)}`,
    "font-src 'self'",
    `connect-src 'self'${extra(TRACKING_CSP.connect)}`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    // Trusted Types with no policy: DOM sinks that turn strings into HTML or script (innerHTML, eval, script.src)
    // throw, so client code can't create markup from strings either. Off in `next dev`, whose tooling needs eval.
    ...(dev ? [] : ["require-trusted-types-for 'script'", tracking ? 'trusted-types default' : "trusted-types 'none'"]),
  ].join('; ');
}
