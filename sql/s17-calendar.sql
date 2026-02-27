-- Sprint 17: Calendar System
-- Schema: tenant_vutler on Vaultbrix

SET search_path TO tenant_vutler;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('confirmed', 'tentative', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rsvp_status AS ENUM ('pending', 'accepted', 'declined', 'maybe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Calendar events (enhanced from existing calendar_events if needed)
CREATE TABLE IF NOT EXISTS calendar_events_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    location VARCHAR(500),
    status event_status DEFAULT 'confirmed',
    recurrence_rule VARCHAR(255),
    recurrence_end TIMESTAMPTZ,
    color VARCHAR(7) DEFAULT '#0066ff',
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event attendees
CREATE TABLE IF NOT EXISTS event_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events_v2(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    user_type VARCHAR(16) DEFAULT 'human',
    rsvp rsvp_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- Event reminders
CREATE TABLE IF NOT EXISTS event_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events_v2(id) ON DELETE CASCADE,
    minutes_before INTEGER NOT NULL DEFAULT 15,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cal_events_workspace ON calendar_events_v2(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_start ON calendar_events_v2(start_time);
CREATE INDEX IF NOT EXISTS idx_cal_events_end ON calendar_events_v2(end_time);
CREATE INDEX IF NOT EXISTS idx_cal_events_created_by ON calendar_events_v2(created_by);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_event ON event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent ON event_reminders(sent) WHERE NOT sent;

-- Grants
GRANT ALL ON calendar_events_v2 TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON event_attendees TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON event_reminders TO "tenant_vutler_service.vaultbrix-prod";
