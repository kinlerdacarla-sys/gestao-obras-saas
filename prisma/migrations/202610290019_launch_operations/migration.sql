ALTER TABLE invitation_deliveries ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN last_error_code text;
ALTER TABLE invitation_deliveries ADD CONSTRAINT invitation_attempts_nonnegative CHECK (attempts >= 0);
CREATE TABLE platform_invitations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  ciphertext text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  sent_at timestamptz,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_invitation_delivery_idx ON platform_invitations(sent_at, expires_at);
CREATE TABLE platform_controls (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
