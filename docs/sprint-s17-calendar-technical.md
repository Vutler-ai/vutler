# Sprint S17 — Vutler Calendar — Technical Specification

## Overview

Native calendar system for Vutler enabling agents and humans to create, manage, and share events. Supports meetings, deadlines, reminders, and sprint events. Agents can autonomously create events and post reminders to chat via the agentBus. No external calendar dependencies (no CalDAV, no Infomaniak).

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Express API │────▶│  PostgreSQL   │
│  /calendar   │◀────│  :3001       │◀────│  (vaultbrix)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │  Redis       │
                    │  agentBus    │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         Reminder Cron            Agent Workers
         (heartbeat.js)           (create/modify)
```

**Key files:**
- `api/calendar.js` — REST endpoints
- `services/calendarManager.js` — business logic, reminder scheduling
- `frontend/calendar.html` — day/week/month view SPA panel
- `migrations/s17-calendar.sql` — schema migration

## Database Schema

```sql
-- S17: Calendar System

CREATE TYPE event_type AS ENUM ('meeting', 'deadline', 'reminder', 'sprint');
CREATE TYPE attendee_role AS ENUM ('organizer', 'required', 'optional');
CREATE TYPE attendee_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');
CREATE TYPE reminder_method AS ENUM ('chat', 'agentbus');

CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    event_type      event_type NOT NULL DEFAULT 'meeting',
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    all_day         BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule VARCHAR(255),          -- iCal RRULE format (FREQ=WEEKLY;BYDAY=MO,WE)
    recurrence_end  TIMESTAMPTZ,
    location        VARCHAR(500),
    color           VARCHAR(7) DEFAULT '#6366f1',
    created_by_id   VARCHAR(64) NOT NULL,
    created_by_type assignee_type NOT NULL, -- reuse from S16 or create if S17 runs first
    source_task_id  UUID,                   -- link to S16 task if applicable
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_attendees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    attendee_id     VARCHAR(64) NOT NULL,
    attendee_type   assignee_type NOT NULL,
    role            attendee_role NOT NULL DEFAULT 'required',
    status          attendee_status NOT NULL DEFAULT 'pending',
    responded_at    TIMESTAMPTZ,
    UNIQUE(event_id, attendee_id, attendee_type)
);

CREATE TABLE event_reminders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    minutes_before  INTEGER NOT NULL DEFAULT 15,
    method          reminder_method NOT NULL DEFAULT 'chat',
    target_channel  VARCHAR(64),           -- RC channel for chat reminders
    sent            BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_workspace ON events(workspace_id);
CREATE INDEX idx_events_time ON events(workspace_id, start_time, end_time);
CREATE INDEX idx_events_type ON events(workspace_id, event_type);
CREATE INDEX idx_events_creator ON events(created_by_id, created_by_type);
CREATE INDEX idx_attendees_event ON event_attendees(event_id);
CREATE INDEX idx_attendees_person ON event_attendees(attendee_id, attendee_type);
CREATE INDEX idx_reminders_pending ON event_reminders(sent, event_id) WHERE sent = FALSE;
```

## API Endpoints

Base: `http://localhost:3001/api/calendar`  
Auth: `X-Auth-Token` + `X-User-Id`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/calendar/events` | List events (query: start, end, type, attendee) |
| `POST` | `/api/calendar/events` | Create event |
| `GET` | `/api/calendar/events/:id` | Get event detail with attendees |
| `PUT` | `/api/calendar/events/:id` | Update event |
| `DELETE` | `/api/calendar/events/:id` | Delete event |
| `POST` | `/api/calendar/events/:id/rsvp` | RSVP (accept/decline/tentative) |
| `GET` | `/api/calendar/upcoming` | Next N events for current user/agent |
| `GET` | `/api/calendar/agenda` | Daily agenda (used by agent heartbeat) |

### Request/Response Examples

**POST /api/calendar/events**
```json
// Request
{
  "title": "Sprint S17 Review",
  "event_type": "meeting",
  "start_time": "2026-03-01T14:00:00+01:00",
  "end_time": "2026-03-01T15:00:00+01:00",
  "attendees": [
    { "id": "agent_andrea", "type": "agent", "role": "required" },
    { "id": "user_lopez", "type": "human", "role": "organizer" }
  ],
  "reminders": [
    { "minutes_before": 15, "method": "chat", "target_channel": "GENERAL" }
  ]
}
// Response 201
{
  "id": "...",
  "title": "Sprint S17 Review",
  "event_type": "meeting",
  "start_time": "2026-03-01T14:00:00+01:00",
  "attendees": [...],
  "reminders": [...]
}
```

**GET /api/calendar/events?start=2026-03-01&end=2026-03-31&attendee_id=agent_andrea**

**GET /api/calendar/upcoming?limit=5**

## Frontend Panel

**File:** `frontend/calendar.html`

### Component Structure
```
calendar.html
├── CalendarApp
│   ├── CalendarToolbar
│   │   ├── ViewToggle (day | week | month)
│   │   ├── DateNavigator (< today >)
│   │   ├── FilterDropdown (event type, attendee)
│   │   └── NewEventButton
│   ├── MonthView
│   │   └── DayCell[] (click to create, events as colored bars)
│   ├── WeekView
│   │   └── TimeGrid (7 columns, 24h rows, events as positioned blocks)
│   ├── DayView
│   │   └── TimeGrid (single column, 24h, detailed event blocks)
│   ├── MiniAgenda (sidebar: upcoming events list)
│   └── EventModal
│       ├── TitleInput
│       ├── TypeSelector
│       ├── DateTimePickers (start/end)
│       ├── AllDayToggle
│       ├── RecurrenceSelector
│       ├── AttendeeSelector (humans + agents picker)
│       ├── ReminderConfig
│       ├── LocationInput
│       └── ColorPicker
```

### UI Details
- **Month view:** Grid calendar, events as colored bars spanning days. Click day to create.
- **Week view:** 7-column time grid (08:00–22:00 visible, scroll for full 24h). Events as positioned blocks.
- **Day view:** Single-column time grid. Detailed event info visible.
- **Color coding:** meeting=indigo, deadline=red, reminder=amber, sprint=green.
- **Agent events:** 🤖 indicator on agent-created events.
- **No external libs:** Pure CSS grid + vanilla JS date handling (or lightweight date-fns from existing node_modules).

## Integration Points

### Redis agentBus
- **Channel:** `agents:calendar` — calendar event notifications
- **Events:**
  - `calendar.event_created` — new event with attendees
  - `calendar.event_updated` — modifications
  - `calendar.reminder` — fired by reminder cron
  - `calendar.rsvp` — attendee response

### Reminder System (heartbeat.js extension)
- Extend existing `services/heartbeat.js` with a reminder check interval (every 60s)
- Query: `SELECT * FROM event_reminders WHERE sent = FALSE AND event start - minutes_before <= NOW()`
- For `method = 'chat'`: post message to RC channel via RC API
- For `method = 'agentbus'`: publish to agent's direct channel
- Mark `sent = TRUE` after delivery

### Snipara / Agent Tools
- `vutler_calendar_list` — agents query their upcoming events
- `vutler_calendar_create` — agents create events
- `vutler_calendar_agenda` — daily agenda for morning briefings

### S16 Tasks Integration
- Tasks with `due_date` can auto-create deadline events (optional, via metadata flag)
- `events.source_task_id` links back to task

## Migration Script

```sql
-- File: migrations/s17-calendar.sql
BEGIN;

DO $$ BEGIN CREATE TYPE event_type AS ENUM ('meeting', 'deadline', 'reminder', 'sprint');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE attendee_role AS ENUM ('organizer', 'required', 'optional');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE attendee_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE reminder_method AS ENUM ('chat', 'agentbus');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Ensure assignee_type exists (may come from S16)
DO $$ BEGIN CREATE TYPE assignee_type AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables (full CREATE TABLE statements as in schema section above)

COMMIT;
```

## Test Plan

1. **Unit tests** (`tests/calendar.test.js`):
   - CRUD events, attendees, reminders
   - Date range queries return correct events
   - Recurrence rule parsing
   - Reminder trigger logic

2. **Integration tests**:
   - Create event with agent attendee → agentBus notification received
   - Reminder fires at correct time → chat message posted to RC
   - Agent creates event via API → appears in human's calendar

3. **Frontend tests** (manual):
   - Navigate month/week/day views
   - Create event via click + modal
   - Drag to resize event duration (week/day view)
   - View switches preserve date context

4. **Edge cases**:
   - All-day events spanning multiple days
   - Timezone handling (Europe/Zurich)
   - Overlapping events display

## Story Breakdown

| # | Story | Points |
|---|-------|--------|
| 1 | Database migration: types, tables, indexes | 2 |
| 2 | API: Events CRUD (create, read, update, delete) | 5 |
| 3 | API: List events with date range, type, attendee filters | 3 |
| 4 | API: Attendee management + RSVP | 3 |
| 5 | API: Upcoming/agenda endpoints | 2 |
| 6 | Service: calendarManager.js — event logic, validation | 3 |
| 7 | Service: Reminder cron in heartbeat.js — poll + fire | 5 |
| 8 | Service: agentBus integration for calendar events | 2 |
| 9 | Frontend: Month view | 5 |
| 10 | Frontend: Week view with time grid | 5 |
| 11 | Frontend: Day view | 3 |
| 12 | Frontend: Event creation/edit modal | 5 |
| 13 | Frontend: View navigation + date picker | 2 |
| 14 | Agent tools: calendar_list, calendar_create, calendar_agenda | 3 |
| 15 | Recurrence support (basic: daily, weekly, monthly) | 3 |
| 16 | Tests + documentation | 3 |

**Total: 54 story points**

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| `assignee_type` enum from S16 | If S17 runs before S16, type doesn't exist | Migration creates it if not exists |
| heartbeat.js modifications | Could affect existing heartbeat behavior | Isolate reminder check in separate function |
| Time zones | JS Date inconsistencies | Store all times as TIMESTAMPTZ; frontend converts to Europe/Zurich |
| Recurrence | Complex to implement fully (iCal RRULE) | MVP: daily/weekly/monthly only; expand later |
| No external calendar sync | Users may want Google Calendar | Out of scope; can add CalDAV export later |
| Frontend calendar rendering | Complex CSS layout | Week/day views are hardest; ship month view first |
