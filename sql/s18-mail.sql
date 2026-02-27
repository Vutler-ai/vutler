-- Sprint 18: Mail System
-- Schema: tenant_vutler on Vaultbrix

SET search_path TO tenant_vutler;

-- Mailboxes (one per agent + one per human)
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    owner_id VARCHAR(64) NOT NULL,
    owner_type VARCHAR(16) DEFAULT 'agent',
    email_address VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email threads
CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    mailbox_id UUID REFERENCES mailboxes(id),
    subject VARCHAR(1000),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 1,
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    labels TEXT[] DEFAULT '{}',
    assigned_agent_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual emails
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    message_id_header VARCHAR(500),
    in_reply_to VARCHAR(500),
    references_header TEXT,
    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    to_addresses JSONB NOT NULL DEFAULT '[]',
    cc_addresses JSONB DEFAULT '[]',
    bcc_addresses JSONB DEFAULT '[]',
    subject VARCHAR(1000),
    body_text TEXT,
    body_html TEXT,
    attachments JSONB DEFAULT '[]',
    direction VARCHAR(8) NOT NULL DEFAULT 'inbound',
    postal_message_id VARCHAR(255),
    raw_headers JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email routing rules
CREATE TABLE IF NOT EXISTS email_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    match_field VARCHAR(32) NOT NULL,
    match_pattern VARCHAR(500) NOT NULL,
    action VARCHAR(32) NOT NULL DEFAULT 'assign_agent',
    target_agent_id VARCHAR(64),
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mailboxes_owner ON mailboxes(owner_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(email_address);
CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox ON email_threads(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_msg ON email_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_archived ON email_threads(is_archived);
CREATE INDEX IF NOT EXISTS idx_email_threads_agent ON email_threads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_msg_id ON email_messages(message_id_header);
CREATE INDEX IF NOT EXISTS idx_email_messages_from ON email_messages(from_address);
CREATE INDEX IF NOT EXISTS idx_email_routing_workspace ON email_routing_rules(workspace_id);

-- Grants
GRANT ALL ON mailboxes TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON email_threads TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON email_messages TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON email_routing_rules TO "tenant_vutler_service.vaultbrix-prod";
