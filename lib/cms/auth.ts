// CMS sign-in, the same model as the Credible Creators CMS: email + password (bcrypt), an authenticator code (TOTP)
// required for everyone once enrolled, and three roles. Sessions are a signed cookie (HMAC-SHA256 with AUTH_SECRET),
// re-checked against the database on every request, so deactivating a user, resetting their 2FA or changing their
// password ends their sessions at once (session_version). Repeated failures lock an email and an address for 15 min.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import { sql } from './db.ts';

export type Role = 'owner' | 'editor' | 'viewer';
export type Permission = 'edit_content' | 'manage_users' | 'run_sync' | 'view';

/** What each role may do: owners everything; editors content, media and sync; viewers read-only. */
export const PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['view', 'edit_content', 'run_sync', 'manage_users'],
  editor: ['view', 'edit_content', 'run_sync'],
  viewer: ['view'],
};
export const ROLES: Role[] = ['owner', 'editor', 'viewer'];
export const can = (user: Pick<CmsUser, 'role'> | null, permission: Permission): boolean =>
  Boolean(user && PERMISSIONS[user.role]?.includes(permission));

export interface CmsUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  totpEnabled: boolean;
  /** False when an owner turned two-factor sign-in off for this user (db/migrations/002_totp_optional.sql). */
  totpRequired: boolean;
  active: boolean;
  hasPassword: boolean;
  sessionVersion: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export const SESSION_COOKIE = 'pt_cms';
/** Sessions last 12 hours; there is no "remember me". */
export const SESSION_TTL_S = 12 * 60 * 60;
const ISSUER = 'PepTalk Appearances CMS';
const BCRYPT_COST = 12;
export const MIN_PASSWORD = 12;

const secret = (): string => {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters) for the CMS.');
  return value;
};
const hmac = (value: string): string => createHmac('sha256', secret()).update(value).digest('base64url');
const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// ---- Users ----

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_required?: boolean;
  active: boolean;
  session_version: number;
  created_at: string;
  last_login_at: string | null;
}
const toUser = (row: UserRow): CmsUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  totpEnabled: row.totp_enabled,
  totpRequired: row.totp_required !== false,
  active: row.active,
  hasPassword: Boolean(row.password_hash),
  sessionVersion: row.session_version,
  createdAt: String(row.created_at),
  lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
});
const rowById = async (id: string): Promise<UserRow | null> =>
  ((await sql().query('SELECT * FROM cms_users WHERE id = $1', [id])) as UserRow[])[0] ?? null;
const rowByEmail = async (email: string): Promise<UserRow | null> =>
  ((await sql().query('SELECT * FROM cms_users WHERE email = $1', [normaliseEmail(email)])) as UserRow[])[0] ?? null;

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();
export const validEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

export const getUser = async (id: string): Promise<CmsUser | null> => {
  const row = await rowById(id);
  return row ? toUser(row) : null;
};
export const listUsers = async (): Promise<CmsUser[]> =>
  ((await sql().query('SELECT * FROM cms_users ORDER BY created_at')) as UserRow[]).map(toUser);

export async function createUser(input: { email: string; name: string; role: Role; createdBy: string }): Promise<CmsUser> {
  const email = normaliseEmail(input.email);
  if (!validEmail(email)) throw new UserError('Enter a valid email address.');
  if (await rowByEmail(email)) throw new UserError('A user with that email already exists.');
  const rows = (await sql().query('INSERT INTO cms_users (id, email, name, role, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *', [
    randomUUID(),
    email,
    input.name.trim().slice(0, 120),
    input.role,
    input.createdBy,
  ])) as UserRow[];
  return toUser(rows[0]);
}

export class UserError extends Error {}

const ownersLeft = async (excluding: string): Promise<number> =>
  Number(
    (
      (await sql().query("SELECT count(*)::int AS n FROM cms_users WHERE role = 'owner' AND active AND id <> $1", [excluding])) as {
        n: number;
      }[]
    )[0].n,
  );

/** Role, name and active changes; never leaves the CMS without an active owner, and nobody deactivates themselves. */
export async function updateUser(actor: CmsUser, id: string, change: { role?: Role; active?: boolean; name?: string }): Promise<void> {
  const target = await rowById(id);
  if (!target) throw new UserError('That user no longer exists.');
  if (change.active === false && id === actor.id) throw new UserError('You can’t deactivate yourself.');
  const losesOwner = target.role === 'owner' && target.active && ((change.role && change.role !== 'owner') || change.active === false);
  if (losesOwner && (await ownersLeft(id)) === 0) throw new UserError('Keep at least one active owner.');
  await sql().query(
    `UPDATE cms_users SET role = coalesce($2, role), active = coalesce($3, active), name = coalesce($4, name),
       session_version = session_version + CASE WHEN $3 = false OR ($2 IS NOT NULL AND $2 <> role) THEN 1 ELSE 0 END
     WHERE id = $1`,
    [id, change.role ?? null, change.active ?? null, change.name?.trim().slice(0, 120) ?? null],
  );
}

/** Clears a user's authenticator: they enrol again at their next sign-in. Ends their sessions. */
export const resetTotp = async (id: string): Promise<void> => {
  await sql().query('UPDATE cms_users SET totp_secret = NULL, totp_enabled = false, session_version = session_version + 1 WHERE id = $1', [
    id,
  ]);
};

/**
 * Owners only: two-factor sign-in on or off for one user. Off clears their authenticator, so they sign in with email
 * and password alone; on makes them set it up again before they can do anything else.
 */
export const setTotpRequired = async (id: string, required: boolean): Promise<void> => {
  if (required) await sql().query('UPDATE cms_users SET totp_required = true WHERE id = $1', [id]);
  else await sql().query('UPDATE cms_users SET totp_required = false, totp_secret = NULL, totp_enabled = false WHERE id = $1', [id]);
};

/** Two-factor sign-in still has to be set up before this user can use the CMS. */
export const needsTotp = (user: Pick<CmsUser, 'totpEnabled' | 'totpRequired'>): boolean => !user.totpEnabled && user.totpRequired;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(password)) return 'Choose a less predictable password.';
  return null;
}

export async function setPassword(id: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem);
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await sql().query('UPDATE cms_users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1', [id, hash]);
}

// ---- Lockout ----

const WINDOW = "interval '15 minutes'";
const MAX_FAILURES = 8;

async function lockedOut(keys: string[]): Promise<boolean> {
  const rows = (await sql().query(
    `SELECT key, count(*)::int AS n FROM cms_login_attempts WHERE key = ANY($1) AND NOT ok AND created_at > now() - ${WINDOW} GROUP BY key`,
    [keys],
  )) as { key: string; n: number }[];
  return rows.some(row => row.n >= MAX_FAILURES);
}
async function record(keys: string[], ok: boolean): Promise<void> {
  for (const key of keys) await sql().query('INSERT INTO cms_login_attempts (key, ok) VALUES ($1, $2)', [key, ok]);
  await sql().query("DELETE FROM cms_login_attempts WHERE created_at < now() - interval '1 day'");
}

// ---- TOTP ----

const totpFor = (secretBase32: string, label: string) =>
  new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) });
const validCode = (secretBase32: string, label: string, code: string): boolean =>
  /^\d{6}$/.test(code) && totpFor(secretBase32, label).validate({ token: code, window: 1 }) !== null;

/** A fresh enrolment secret for the signed-in user (kept until confirmed), with the otpauth:// URI for the QR code. */
export async function startTotp(user: CmsUser): Promise<{ secret: string; uri: string }> {
  const row = await rowById(user.id);
  let base32 = row?.totp_secret;
  if (!base32 || row?.totp_enabled) {
    base32 = new OTPAuth.Secret({ size: 20 }).base32;
    await sql().query('UPDATE cms_users SET totp_secret = $2, totp_enabled = false WHERE id = $1', [user.id, base32]);
  }
  return { secret: base32, uri: totpFor(base32, user.email).toString() };
}

/** Confirms enrolment with a code from the app. */
export async function confirmTotp(user: CmsUser, code: string): Promise<boolean> {
  const row = await rowById(user.id);
  if (!row?.totp_secret || !validCode(row.totp_secret, row.email, code.replace(/\s+/g, ''))) return false;
  await sql().query('UPDATE cms_users SET totp_enabled = true WHERE id = $1', [user.id]);
  return true;
}

// ---- Sign-in ----

let dummy: Promise<string> | undefined;
const dummyHash = (): Promise<string> => {
  dummy ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);
  return dummy;
};

export type SignIn = { ok: true; user: CmsUser } | { ok: false; error: 'invalid' | 'code' | 'locked' };

/**
 * Checks email, password and (once enrolled) the authenticator code. The error never says which part was wrong,
 * except "code", which only appears after a correct password (so the form can ask for the code).
 */
export async function signIn(emailInput: string, password: string, code: string, address: string): Promise<SignIn> {
  const email = normaliseEmail(emailInput);
  const keys = [`email:${email}`, `ip:${address}`];
  if (await lockedOut(keys)) return { ok: false, error: 'locked' };
  const row = await rowByEmail(email);
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails have accounts.
  const hash = row?.password_hash ?? (await dummyHash());
  const passwordOk = (await bcrypt.compare(password, hash)) && Boolean(row?.password_hash) && Boolean(row?.active);
  if (!passwordOk || !row) {
    await record(keys, false);
    return { ok: false, error: 'invalid' };
  }
  if (row.totp_enabled) {
    const clean = code.replace(/\s+/g, '');
    if (!clean) return { ok: false, error: 'code' };
    if (!row.totp_secret || !validCode(row.totp_secret, row.email, clean)) {
      await record(keys, false);
      return { ok: false, error: 'code' };
    }
  }
  await record(keys, true);
  await sql().query('UPDATE cms_users SET last_login_at = now() WHERE id = $1', [row.id]);
  return { ok: true, user: toUser(row) };
}

// ---- Sessions ----

interface SessionPayload {
  uid: string;
  v: number;
  exp: number;
  sid: string;
}

export function sessionCookie(user: CmsUser, now = Date.now()): string {
  const payload: SessionPayload = {
    uid: user.id,
    v: user.sessionVersion,
    exp: Math.floor(now / 1000) + SESSION_TTL_S,
    sid: randomBytes(12).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

/** The session's payload when the signature and expiry are good (the user is checked separately). */
export function readSession(cookie: string | undefined, now = Date.now()): SessionPayload | null {
  if (!cookie) return null;
  const [body, signature] = cookie.split('.');
  if (!body || !signature || !sameText(signature, hmac(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    return payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}

/** The signed-in, active user for a session cookie, or null (expired, tampered, deactivated, or signed out elsewhere). */
export async function sessionUser(cookie: string | undefined): Promise<{ user: CmsUser; sid: string } | null> {
  const payload = readSession(cookie);
  if (!payload) return null;
  const user = await getUser(payload.uid);
  if (!user?.active || user.sessionVersion !== payload.v) return null;
  return { user, sid: payload.sid };
}

/** The form token for a session: forms carry it, and every POST must match (with the same-origin check). */
export const csrfToken = (sid: string): string => hmac(`csrf:${sid}`);
export const csrfOk = (sid: string, token: string): boolean => Boolean(token) && sameText(token, csrfToken(sid));

/** A short signed value for one-off cookies (flash messages): `value.signature`. */
export const signValue = (value: string): string => `${Buffer.from(value).toString('base64url')}.${hmac(`flash:${value}`)}`;
export function unsignValue(signed: string | undefined): string | null {
  if (!signed) return null;
  const [body, signature] = signed.split('.');
  if (!body || !signature) return null;
  const value = Buffer.from(body, 'base64url').toString('utf8');
  return sameText(signature, hmac(`flash:${value}`)) ? value : null;
}

// ---- Password reset ----

const RESET_TTL = "interval '1 hour'";
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * A reset token for an active user (single use, one hour), or null when the email has no account or a link was sent
 * in the last two minutes. The caller answers the same either way, so the form never reveals which emails exist.
 */
export async function createReset(emailInput: string): Promise<{ token: string; user: CmsUser } | null> {
  const row = await rowByEmail(emailInput);
  if (!row?.active) return null;
  const recent = (await sql().query("SELECT 1 FROM cms_password_resets WHERE user_id = $1 AND created_at > now() - interval '2 minutes'", [
    row.id,
  ])) as unknown[];
  if (recent.length) return null;
  const token = randomBytes(32).toString('base64url');
  await sql().query(`INSERT INTO cms_password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + ${RESET_TTL})`, [
    randomUUID(),
    row.id,
    tokenHash(token),
  ]);
  return { token, user: toUser(row) };
}

/** The user a reset token belongs to, while it is unused and unexpired. */
export async function resetUser(token: string): Promise<CmsUser | null> {
  if (!token || token.length > 100) return null;
  const rows = (await sql().query(
    'SELECT u.* FROM cms_password_resets r JOIN cms_users u ON u.id = r.user_id WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.active',
    [tokenHash(token)],
  )) as UserRow[];
  return rows[0] ? toUser(rows[0]) : null;
}

/** Sets the new password and spends the token (and any other open tokens for that user). */
export async function completeReset(token: string, password: string): Promise<CmsUser | null> {
  const user = await resetUser(token);
  if (!user) return null;
  await setPassword(user.id, password);
  await sql().query('UPDATE cms_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  return user;
}
