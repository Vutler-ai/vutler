# Mock Data for Testing

Use these JSON responses to test the pages without a backend.

## Email Inbox

### GET /api/v1/email/inbox
```json
[
  {
    "uid": "1",
    "from": "mike@vutler.com",
    "subject": "Project Update",
    "date": "2026-02-25T10:30:00Z",
    "unread": true
  },
  {
    "uid": "2",
    "from": "luna@vutler.com",
    "subject": "Meeting Notes",
    "date": "2026-02-24T14:20:00Z",
    "unread": false
  },
  {
    "uid": "3",
    "from": "victor@vutler.com",
    "subject": "Design Review",
    "date": "2026-02-23T09:15:00Z",
    "unread": true
  }
]
```

### GET /api/v1/email/:uid
```json
{
  "uid": "1",
  "from": "mike@vutler.com",
  "subject": "Project Update",
  "date": "2026-02-25T10:30:00Z",
  "unread": false,
  "body": "Hey Philip,\n\nJust wanted to give you a quick update on the Vutler project. The frontend is coming along nicely!\n\nThe new dashboard looks great. Can we schedule a design review?\n\nBest,\nMike"
}
```

---

## Tasks

### GET /api/v1/tasks
```json
[
  {
    "id": "1",
    "title": "Design new dashboard",
    "description": "Create mockups for the new dashboard layout",
    "status": "in_progress",
    "priority": "high",
    "assigned_to": "Philip",
    "due_date": "2026-02-28"
  },
  {
    "id": "2",
    "title": "Review API endpoints",
    "description": "Check all API routes for consistency",
    "status": "todo",
    "priority": "medium",
    "assigned_to": "Mike",
    "due_date": "2026-03-01"
  },
  {
    "id": "3",
    "title": "Update documentation",
    "description": "Add new features to the docs",
    "status": "done",
    "priority": "low",
    "assigned_to": "Luna",
    "due_date": "2026-02-24"
  },
  {
    "id": "4",
    "title": "Fix email bugs",
    "description": "Resolve issues with email sending",
    "status": "todo",
    "priority": "high",
    "assigned_to": "Victor",
    "due_date": "2026-02-26"
  }
]
```

---

## Calendar

### GET /api/v1/calendar/events?start=2026-02-01&end=2026-02-28
```json
[
  {
    "id": "1",
    "title": "Team Meeting",
    "start": "2026-02-26T10:00:00Z",
    "end": "2026-02-26T11:00:00Z",
    "description": "Weekly sync with the team",
    "color": "#3b82f6"
  },
  {
    "id": "2",
    "title": "Design Review",
    "start": "2026-02-27T14:00:00Z",
    "end": "2026-02-27T15:30:00Z",
    "description": "Review new dashboard designs",
    "color": "#10b981"
  },
  {
    "id": "3",
    "title": "Client Call",
    "start": "2026-02-28T16:00:00Z",
    "end": "2026-02-28T17:00:00Z",
    "description": "Discuss project progress",
    "color": "#f59e0b"
  },
  {
    "id": "4",
    "title": "Sprint Planning",
    "start": "2026-03-03T09:00:00Z",
    "end": "2026-03-03T10:30:00Z",
    "description": "Plan next sprint tasks",
    "color": "#8b5cf6"
  }
]
```

---

## Drive

### GET /api/v1/drive/files?path=/
```json
[
  {
    "id": "1",
    "name": "Documents",
    "type": "folder",
    "modified": "2026-02-25T12:00:00Z",
    "path": "/Documents"
  },
  {
    "id": "2",
    "name": "Images",
    "type": "folder",
    "modified": "2026-02-24T15:30:00Z",
    "path": "/Images"
  },
  {
    "id": "3",
    "name": "project-plan.pdf",
    "type": "file",
    "size": 2457600,
    "mime_type": "application/pdf",
    "modified": "2026-02-23T10:15:00Z",
    "path": "/project-plan.pdf"
  },
  {
    "id": "4",
    "name": "screenshot.png",
    "type": "file",
    "size": 1048576,
    "mime_type": "image/png",
    "modified": "2026-02-22T14:20:00Z",
    "path": "/screenshot.png"
  }
]
```

### GET /api/v1/drive/files?path=/Documents
```json
[
  {
    "id": "5",
    "name": "requirements.docx",
    "type": "file",
    "size": 524288,
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "modified": "2026-02-20T09:00:00Z",
    "path": "/Documents/requirements.docx"
  },
  {
    "id": "6",
    "name": "meeting-notes.txt",
    "type": "file",
    "size": 4096,
    "mime_type": "text/plain",
    "modified": "2026-02-21T11:30:00Z",
    "path": "/Documents/meeting-notes.txt"
  }
]
```

---

## Quick Test Server

Create a simple mock server to test the pages:

```javascript
// mock-server.js
const express = require('express');
const app = express();
app.use(express.json());

// Email endpoints
app.get('/api/v1/email/inbox', (req, res) => {
  res.json([/* ... email data ... */]);
});

app.get('/api/v1/email/:uid', (req, res) => {
  res.json({/* ... email with body ... */});
});

app.post('/api/v1/email/send', (req, res) => {
  res.json({ success: true });
});

// Tasks endpoints
app.get('/api/v1/tasks', (req, res) => {
  res.json([/* ... tasks data ... */]);
});

app.post('/api/v1/tasks', (req, res) => {
  res.json({ id: Date.now().toString(), ...req.body });
});

app.put('/api/v1/tasks/:id', (req, res) => {
  res.json({ ...req.body });
});

app.delete('/api/v1/tasks/:id', (req, res) => {
  res.json({ success: true });
});

// Calendar endpoints
app.get('/api/v1/calendar/events', (req, res) => {
  res.json([/* ... events data ... */]);
});

app.post('/api/v1/calendar/events', (req, res) => {
  res.json({ id: Date.now().toString(), ...req.body });
});

app.put('/api/v1/calendar/events/:id', (req, res) => {
  res.json({ ...req.body });
});

app.delete('/api/v1/calendar/events/:id', (req, res) => {
  res.json({ success: true });
});

// Drive endpoints
app.get('/api/v1/drive/files', (req, res) => {
  res.json([/* ... files data ... */]);
});

app.listen(3001, () => console.log('Mock API running on :3001'));
```

Run with: `node mock-server.js`
Configure Next.js to proxy to `http://localhost:3001`
