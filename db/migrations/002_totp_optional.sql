-- Two-factor sign-in stays required by default; an owner can turn it off for a single user (Users → Turn off 2FA).
ALTER TABLE cms_users ADD COLUMN IF NOT EXISTS totp_required boolean NOT NULL DEFAULT true;
