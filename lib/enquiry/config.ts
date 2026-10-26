// Enquiry forwarding configuration: ENQUIRY_WEBHOOK_URL (and ENQUIRY_WEBHOOK_SECRET, read by the handler).
// The form reads this at build time (pages are prerendered: whether the behaviour script sends the form, and which
// confirmation it shows), the endpoint at request time. So after setting or removing the URL, redeploy.
type Env = Record<string, string | undefined>;

/** ENQUIRY_WEBHOOK_URL when it is an https URL (http only for localhost, for local testing); otherwise null. */
export function webhookUrl(env: Env): string | null {
  const raw = env.ENQUIRY_WEBHOOK_URL?.trim();
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.toString() : null;
}

/** Forwarding is on. */
export const forwardingEnabled = (env: Env = process.env): boolean => webhookUrl(env) !== null;
