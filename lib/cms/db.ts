// The CMS database: Neon Postgres over HTTP (@neondatabase/serverless), one tagged-template `sql` per process.
// DATABASE_URL comes from the Vercel Neon integration (pooled). No ORM: the tables are few and the queries plain
// (db/migrations/*.sql, applied by scripts/db-migrate.mjs before every build).
import { type NeonQueryFunction, neon } from '@neondatabase/serverless';

type Env = Record<string, string | undefined>;

let client: NeonQueryFunction<false, false> | undefined;

/** True when a database is configured: the CMS (and CONTENT_PROVIDER=cms) need one. */
export const databaseConfigured = (env: Env = process.env): boolean => Boolean(env.DATABASE_URL);

/** The shared query function; throws when DATABASE_URL is unset (callers check databaseConfigured() first). */
export function sql(): NeonQueryFunction<false, false> {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set: the CMS needs its database (docs/cms.md).');
  client = neon(url);
  return client;
}
