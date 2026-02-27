-- Sprint 9.1 — JWT Auth tables
-- Run as superuser or role with CREATE privileges on tenant_vutler schema

CREATE TABLE tenant_vutler.users_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, workspace_id)
);

CREATE TABLE tenant_vutler.auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  refresh_token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_auth_email ON tenant_vutler.users_auth(email);
CREATE INDEX idx_auth_sessions_user ON tenant_vutler.auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token ON tenant_vutler.auth_sessions(refresh_token);

GRANT ALL ON TABLE tenant_vutler.users_auth TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON TABLE tenant_vutler.auth_sessions TO "tenant_vutler_service.vaultbrix-prod";
