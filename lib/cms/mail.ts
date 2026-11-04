// Outgoing CMS email (password reset links) through Resend's REST API, as the Credible Creators CMS does.
// RESEND_API_KEY and AUTH_EMAIL_FROM ("PepTalk <no-reply@…>", a sender on a domain verified in Resend). Without them
// nothing is sent: the reset form still answers the same way, and the event is logged so an owner can set the
// password for the user instead (Users → Set password).
type Env = Record<string, string | undefined>;

export const mailConfigured = (env: Env = process.env): boolean => Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM);

export async function sendMail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn(JSON.stringify({ service: 'appearances', event: 'cms.mail_skipped', reason: 'RESEND_API_KEY or AUTH_EMAIL_FROM unset' }));
    return false;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error(JSON.stringify({ service: 'appearances', event: 'cms.mail_failed', status: response.status }));
    return false;
  }
  return true;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** The reset email: one link, valid for an hour. */
export function resetEmail(link: string): { subject: string; text: string; html: string } {
  const subject = 'Reset your PepTalk CMS password';
  const text = `Someone asked to reset the password for your PepTalk CMS account.\n\nSet a new password (the link works once, for one hour):\n${link}\n\nIf this wasn't you, ignore this email: your password stays the same.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2a2b32;max-width:520px">
<p style="font-size:20px;font-weight:bold;color:#3971c0;margin:0 0 16px">PepTalk CMS</p>
<p>Someone asked to reset the password for your PepTalk CMS account.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#3971c0;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Set a new password</a></p>
<p style="color:#6b6d78;font-size:14px">The link works once, for one hour. If this wasn’t you, ignore this email: your password stays the same.</p>
</div>`;
  return { subject, text, html };
}
