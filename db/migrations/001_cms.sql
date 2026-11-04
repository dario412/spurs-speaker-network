-- The CMS (lib/cms/, /admin): users and sign-in, content saved from the editor, media uploads and Airtable sync runs.
-- Content rows overlay the JSON files in the repository by path (src/sites/<slug>/site.json …, src/copy/legal/<kind>.md):
-- a path with no row reads the committed file, so an empty database serves exactly what is in Git.

CREATE TABLE IF NOT EXISTS cms_users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  password_hash text,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  totp_secret   text,
  totp_enabled  boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  -- Bumped on password change, 2FA reset and deactivation: every session signed with an older value stops working.
  session_version integer NOT NULL DEFAULT 1,
  created_by    text REFERENCES cms_users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS cms_password_resets (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES cms_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_password_resets_user ON cms_password_resets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cms_content_files (
  path       text PRIMARY KEY,
  body       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS cms_media (
  id         text PRIMARY KEY,
  file_name  text NOT NULL,
  mime_type  text NOT NULL,
  alt        text NOT NULL DEFAULT '',
  byte_size  integer NOT NULL,
  data       text NOT NULL, -- base64
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_sync_runs (
  id          text PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok          boolean,
  trigger     text NOT NULL,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by  text
);

-- Sign-in attempts, for the per-email and per-address lockout (lib/cms/auth.ts).
CREATE TABLE IF NOT EXISTS cms_login_attempts (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL,
  ok         boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_login_attempts_key ON cms_login_attempts (key, created_at DESC);

CREATE TABLE IF NOT EXISTS cms_migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
