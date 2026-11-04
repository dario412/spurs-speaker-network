// A one-time link to set a CMS password, for when email isn't configured (no RESEND_API_KEY) or an owner wants to
// hand a link over directly. Usage: npm run cms:invite -- <email> [https://host]
// Needs DATABASE_URL (vercel env pull). The link works once, for 72 hours; it is the same kind of token the "Forgot
// password" email carries (stored only as a SHA-256 hash). Treat the printed link like a password.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const [email, origin = 'https://spurs-speaker-network.vercel.app'] = process.argv.slice(2);
if (!email || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=… npm run cms:invite -- <email> [https://host]');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const [user] = await sql.query('SELECT id, active FROM cms_users WHERE email = $1', [email.trim().toLowerCase()]);
if (!user?.active) {
  console.error(`No active CMS user ${email}. Add them in /admin/users first (or set ADMIN_EMAIL and run the migration).`);
  process.exit(1);
}
const token = randomBytes(32).toString('base64url');
await sql.query("INSERT INTO cms_password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '72 hours')", [
  randomUUID(),
  user.id,
  createHash('sha256').update(token).digest('hex'),
]);
console.log(`${origin.replace(/\/+$/, '')}/admin/reset?token=${token}`);
