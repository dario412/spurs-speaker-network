// Applies db/migrations/*.sql in name order (each once, recorded in cms_migrations), then makes sure the first owner
// exists. Runs before every build (package.json "build"); without DATABASE_URL it does nothing, so CI and local builds
// that don't use the CMS are unaffected. Usage: node scripts/db-migrate.mjs
//
// The first owner is ADMIN_EMAIL with no password: they set one through "Forgot password" on /admin/login (an
// emailed, single-use link), so no password is ever stored in an environment variable or printed.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log(JSON.stringify({ service: 'appearances', event: 'db_migrate.skipped', reason: 'no DATABASE_URL' }));
  process.exit(0);
}
const sql = neon(url);
const dir = new URL('../db/migrations/', import.meta.url);

await sql.query('CREATE TABLE IF NOT EXISTS cms_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
const done = new Set((await sql.query('SELECT name FROM cms_migrations')).map(row => row.name));
const applied = [];
for (const name of readdirSync(dir)
  .filter(file => file.endsWith('.sql'))
  .sort()) {
  if (done.has(name)) continue;
  const text = readFileSync(new URL(name, dir), 'utf8');
  // One statement per query (the HTTP driver runs a single statement); the files use `;` only at statement ends.
  const statements = text
    .split(/;\s*$/m)
    .map(part => part.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  await sql.transaction(tx => [
    ...statements.map(statement => tx.query(statement)),
    tx.query('INSERT INTO cms_migrations (name) VALUES ($1)', [name]),
  ]);
  applied.push(name);
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
let owner = 'unchanged';
if (email) {
  const rows = await sql.query('SELECT id FROM cms_users WHERE email = $1', [email]);
  if (!rows.length) {
    await sql.query("INSERT INTO cms_users (id, email, name, role) VALUES ($1, $2, '', 'owner')", [randomUUID(), email]);
    owner = 'created';
  }
}
console.log(JSON.stringify({ service: 'appearances', event: 'db_migrate.done', applied, owner }));
