# Sprint S16 — Vutler Tasks (Kanban) — Technical Specification

## Overview

Task management system integrated into Vutler, providing Kanban-style project tracking with bidirectional agent↔human assignment. Tasks can be created from chat messages, managed via API, and synchronized in real-time through the existing Redis agentBus. Bridges the internal A2A task queue with user-facing task management.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Express API │────▶│  PostgreSQL   │
│  /tasks SPA  │◀────│  :3001       │◀────│  (vaultbrix)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │  Redis       │
                    │  agentBus    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         A2A Queue   Agent Workers  Chat Bridge
```

**Key files:**
- `api/tasks.js` — REST endpoints
- `services/taskManager.js` — business logic, A2A bridge
- `frontend/tasks.html` — Kanban + list view SPA panel
- `migrations/s16-tasks.sql` — schema migration

## Database Schema

```sql
-- S16: Task Management System
-- Run as vaultbrix user on vaultbrix database

CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE assignee_type AS ENUM ('human', 'agent');

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          task_status NOT NULL DEFAULT 'todo',
    priority        task_priority NOT NULL DEFAULT 'medium',
    created_by_id   VARCHAR(64) NOT NULL,        -- RC user_id or agent_id
    created_by_type assignee_type NOT NULL,
    assignee_id     VARCHAR(64),                  -- RC user_id or agent_id
    assignee_type   assignee_type,
    source_message_id VARCHAR(64),                -- RC message_id if created from chat
    source_channel_id VARCHAR(64),                -- RC channel where task originated
    a2a_task_id     VARCHAR(128),                 -- link to A2A internal task queue
    due_date        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    position        INTEGER NOT NULL DEFAULT 0,   -- ordering within status column
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_labels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7) NOT NULL DEFAULT '#6366f1',  -- hex color
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE TABLE task_label_assignments (
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id        UUID NOT NULL REFERENCES task_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE task_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id       VARCHAR(64) NOT NULL,
    author_type     assignee_type NOT NULL,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_activity_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id        VARCHAR(64) NOT NULL,
    actor_type      assignee_type NOT NULL,
    action          VARCHAR(50) NOT NULL,         -- created, status_changed, assigned, commented, etc.
    old_value       TEXT,
    new_value       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_status ON tasks(workspace_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, assignee_type);
CREATE INDEX idx_tasks_a2a ON tasks(a2a_task_id) WHERE a2a_task_id IS NOT NULL;
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL AND status != 'done';
CREATE INDEX idx_task_comments_task ON task_comments(task_id);
CREATE INDEX idx_task_activity_task ON task_activity_log(task_id);
```

## API Endpoints

Base: `http://localhost:3001/api/tasks`  
Auth: `X-Auth-Token` + `X-User-Id` headers (RC tokens)

### Tasks CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks with filters |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task detail |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `PATCH` | `/api/tasks/:id/status` | Change status |
| `PATCH` | `/api/tasks/:id/assign` | Assign task |
| `POST` | `/api/tasks/from-message` | Create from chat message |
| `PATCH` | `/api/tasks/:id/position` | Reorder within column |

### Labels

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks/labels` | List labels |
| `POST` | `/api/tasks/labels` | Create label |
| `DELETE` | `/api/tasks/labels/:id` | Delete label |
| `POST` | `/api/tasks/:id/labels` | Add label to task |
| `DELETE` | `/api/tasks/:id/labels/:labelId` | Remove label |

### Comments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks/:id/comments` | List comments |
| `POST` | `/api/tasks/:id/comments` | Add comment |

### Request/Response Examples

**POST /api/tasks**
```json
// Request
{
  "title": "Implement OAuth2 flow",
  "description": "Add Google OAuth for workspace users",
  "priority": "high",
  "assignee_id": "agent_andrea",
  "assignee_type": "agent",
  "labels": ["backend", "security"],
  "due_date": "2026-03-15T00:00:00Z"
}
// Response 201
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Implement OAuth2 flow",
  "status": "todo",
  "priority": "high",
  "created_by_id": "user_abc",
  "created_by_type": "human",
  "assignee_id": "agent_andrea",
  "assignee_type": "agent",
  "labels": [{"id": "...", "name": "backend", "color": "#6366f1"}],
  "created_at": "2026-02-23T18:00:00Z"
}
```

**GET /api/tasks?status=todo,in_progress&assignee_id=agent_andrea&sort=priority**

**POST /api/tasks/from-message**
```json
// Request
{ "message_id": "rc_msg_abc123", "channel_id": "GENERAL" }
// Response 201 — task created with message text as title, link back to message
```

**PATCH /api/tasks/:id/status**
```json
{ "status": "in_progress" }
```

## Frontend Panel

**File:** `frontend/tasks.html` — injected via `Custom_Script_Logged_In` like existing panels.

### Component Structure
```
tasks.html
├── TasksApp (main container)
│   ├── TasksToolbar
│   │   ├── ViewToggle (kanban | list)
│   │   ├── FilterBar (status, assignee, priority, label, search)
│   │   └── NewTaskButton
│   ├── KanbanView
│   │   ├── KanbanColumn (todo)
│   │   │   └── TaskCard[] (draggable)
│   │   ├── KanbanColumn (in_progress)
│   │   ├── KanbanColumn (review)
│   │   └── KanbanColumn (done)
│   ├── ListView
│   │   └── TaskRow[] (sortable table)
│   └── TaskDetailModal
│       ├── TitleEditor
│       ├── DescriptionEditor
│       ├── StatusDropdown
│       ├── AssigneeSelector (humans + agents)
│       ├── PrioritySelector
│       ├── LabelPicker
│       ├── DueDatePicker
│       ├── CommentThread
│       └── ActivityLog
```

### UI Details
- **Kanban:** 4 columns, drag-and-drop via HTML5 Drag API (no external lib). Cards show title, assignee avatar, priority badge, labels as colored dots.
- **List:** Sortable table with columns: title, status, assignee, priority, due date, labels.
- **Colors:** Priority badges — urgent: red, high: orange, medium: blue, low: gray.
- **Agent indicator:** Robot icon (🤖) next to agent-assigned tasks.
- **Real-time:** SSE or polling from Redis pub/sub events for live status updates.

## Integration Points

### Redis agentBus
- **Channel:** `agents:tasks` — new pub/sub channel for task events
- **Events published:**
  - `task.created` — when any task is created
  - `task.status_changed` — status transitions
  - `task.assigned` — assignment changes
  - `task.comment_added` — new comment
- **Agents subscribe** to receive tasks assigned to them

### A2A Task Queue Bridge
- `services/taskManager.js` bridges A2A internal tasks ↔ user-facing tasks
- When an A2A task is created internally (agent-to-agent), optionally surface it as a visible task (configurable per agent)
- When a user creates a task assigned to an agent, inject it into the A2A queue
- Link via `tasks.a2a_task_id` field
- A2A status updates propagate to task status

### Snipara Integration
- Agents can query tasks via tool calls: "list my tasks", "update task status"
- Add `vutler_tasks_list` and `vutler_tasks_update` to agent tool registry

### Chat Bridge
- POST `/api/tasks/from-message` extracts message text from RC (via RC API), creates task
- Bot posts confirmation back to channel: "✅ Task created: {title} — assigned to {assignee}"

## Migration Script

```sql
-- File: migrations/s16-tasks.sql
-- Run: docker exec -i vutler-postgres psql -U vaultbrix -d vaultbrix < migrations/s16-tasks.sql

BEGIN;

-- Types
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE assignee_type AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables (as above)
-- ... (full CREATE TABLE statements from schema section)

-- Seed default labels
INSERT INTO task_labels (workspace_id, name, color) VALUES
    ('default', 'bug', '#ef4444'),
    ('default', 'feature', '#22c55e'),
    ('default', 'backend', '#6366f1'),
    ('default', 'frontend', '#f59e0b'),
    ('default', 'urgent', '#dc2626'),
    ('default', 'documentation', '#8b5cf6')
ON CONFLICT DO NOTHING;

COMMIT;
```

## Test Plan

1. **Unit tests** (`tests/tasks.test.js`):
   - CRUD operations on tasks, labels, comments
   - Status transition validation (only valid transitions)
   - Permission checks (only creator/assignee can modify)

2. **Integration tests**:
   - Create task from chat message → verify task in DB + bot response
   - Assign task to agent → verify A2A queue entry
   - A2A task completion → verify task status updated to done
   - Redis event published on status change

3. **Frontend tests** (manual):
   - Drag task between columns → status updated
   - Create task via modal → appears in correct column
   - Filter by assignee/label → correct results
   - Real-time update: another user changes status → board reflects

4. **Load test**:
   - 500 tasks per workspace, verify query performance < 100ms

## Story Breakdown

| # | Story | Points |
|---|-------|--------|
| 1 | Database migration: create tables, types, indexes | 2 |
| 2 | API: Tasks CRUD (create, read, update, delete, list with filters) | 5 |
| 3 | API: Status transitions with validation + activity log | 3 |
| 4 | API: Assignment (agent↔human) with agentBus notification | 3 |
| 5 | API: Create task from chat message (RC message bridge) | 3 |
| 6 | API: Labels CRUD + task-label assignments | 2 |
| 7 | API: Comments CRUD | 2 |
| 8 | Service: taskManager.js — A2A task queue bridge | 5 |
| 9 | Service: Redis pub/sub for task events on agentBus | 3 |
| 10 | Frontend: Kanban board with drag-and-drop | 5 |
| 11 | Frontend: List view with sorting/filtering | 3 |
| 12 | Frontend: Task detail modal (edit, comments, activity) | 5 |
| 13 | Frontend: Real-time updates (SSE/polling) | 3 |
| 14 | Agent tools: vutler_tasks_list, vutler_tasks_update in tool registry | 3 |
| 15 | Tests + documentation | 3 |

**Total: 50 story points**

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| A2A task queue format | May need schema changes to bridge | Review A2A queue structure first; adapter pattern |
| RC API for message fetching | Rate limits on RC REST API | Cache message content at task creation time |
| HTML5 Drag API | Cross-browser inconsistencies | Fallback to click-to-move; test on Chrome/Firefox |
| Redis channel addition | Must not conflict with existing 12 channels | Use dedicated `agents:tasks` channel |
| Position reordering | Concurrent drag may cause conflicts | Optimistic locking with updated_at check |
