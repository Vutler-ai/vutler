# 🚀 Vutler API - Implementation Complete

## 📦 Files Created

```
/Users/lopez/.openclaw/workspace/projects/vutler/api/routes/
├── email.js              # IMAP inbox + SMTP sending (alex@vutler.com)
├── tasks.js              # PostgreSQL CRUD for tasks
├── calendar.js           # PostgreSQL CRUD for calendar events
├── drive.js              # kDrive API proxy (Infomaniak)
├── index.example.js      # Complete Express server with all routes
├── package.json          # npm dependencies
├── deploy.sh             # Deployment script for VPS
├── README.md             # Full documentation
└── IMPLEMENTATION.md     # This file
```

## ✅ What's Implemented

### 1. Email Module (`email.js`)
- ✅ GET `/api/v1/email/inbox` — Fetch inbox (IMAP)
  - Returns: from, subject, date, preview, read/unread status
  - IMAP config: mail.infomaniak.com:993 (alex@vutler.com)
- ✅ GET `/api/v1/email/:uid` — Get full email by UID
  - Returns: complete email with HTML body
- ✅ POST `/api/v1/email/send` — Send email (SMTP)
  - SMTP config: mail.infomaniak.com:587
  - Supports plain text + HTML

**Dependencies:** `node-imap`, `nodemailer`, `mailparser`

### 2. Tasks Module (`tasks.js`)
- ✅ PostgreSQL table auto-creation on startup
- ✅ GET `/api/v1/tasks` — List tasks with filters (status, assigned_to)
- ✅ POST `/api/v1/tasks` — Create task
- ✅ PUT `/api/v1/tasks/:id` — Update task (dynamic field updates)
- ✅ DELETE `/api/v1/tasks/:id` — Delete task

**Database:** vutler-postgres:5432 (vaultbrix/vaultbrix)
**Table:** `tasks` (id, title, description, status, priority, assigned_to, due_date, timestamps)

### 3. Calendar Module (`calendar.js`)
- ✅ PostgreSQL table auto-creation on startup
- ✅ GET `/api/v1/calendar/events` — List events with date range filters
- ✅ POST `/api/v1/calendar/events` — Create event
- ✅ PUT `/api/v1/calendar/events/:id` — Update event
- ✅ DELETE `/api/v1/calendar/events/:id` — Delete event

**Table:** `events` (id, title, description, start_time, end_time, location, attendees[], color)

### 4. Drive Module (`drive.js`)
- ✅ kDrive API proxy for Infomaniak Drive (ID: 2021270)
- ✅ GET `/api/v1/drive/files` — List files (with path/directory_id)
- ✅ GET `/api/v1/drive/files/:id` — Get file metadata
- ✅ GET `/api/v1/drive/files/:id/download` — Download file (streaming proxy)
- ✅ POST `/api/v1/drive/files/upload` — Upload file (multipart)
- ✅ DELETE `/api/v1/drive/files/:id` — Delete file

**Dependencies:** `node-fetch`, `multer`, `form-data`

## 🔧 Technical Details

### Architecture
- **Pattern:** Express Router modules (modular, independent)
- **Database:** PostgreSQL connection pool per module
- **Email:** Separate IMAP/SMTP connections (stateless)
- **Drive:** HTTP proxy to kDrive REST API

### Features
- ✅ Automatic table creation (tasks, events)
- ✅ Error handling with try/catch + proper status codes
- ✅ Dynamic query building (partial updates)
- ✅ Stream-based file proxy (no memory buffering for downloads)
- ✅ Multipart upload handling (multer)
- ✅ IMAP UID-based message retrieval
- ✅ PostgreSQL array support (attendees[])

### Security Notes
⚠️ **Current state:** Credentials hardcoded in files (email password, DB password, kDrive token)

**For production:**
- [ ] Move to environment variables (.env)
- [ ] Add authentication middleware (JWT/API keys)
- [ ] Enable CORS with whitelist
- [ ] Add rate limiting
- [ ] Input validation (express-validator)
- [ ] Structured logging (winston/pino)

## 🚀 Deployment

### Option 1: Quick Deploy (via script)
```bash
cd /Users/lopez/.openclaw/workspace/projects/vutler/api/routes/
./deploy.sh
```

### Option 2: Manual Deploy
```bash
# Copy files to container
docker cp email.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp tasks.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp calendar.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp drive.js vutler-api:/home/ubuntu/vutler/app/routes/

# Install dependencies
docker exec vutler-api npm install pg node-imap nodemailer mailparser node-fetch@2 multer form-data cors

# Option A: Update existing index.js manually (add route imports)
# Option B: Replace with complete example
docker cp index.example.js vutler-api:/home/ubuntu/vutler/app/index.js

# Restart
docker restart vutler-api
```

### Integration into Existing index.js
Add to your current `/home/ubuntu/vutler/app/index.js`:

```javascript
// Import routes
const emailRoutes = require('./routes/email');
const tasksRoutes = require('./routes/tasks');
const calendarRoutes = require('./routes/calendar');
const driveRoutes = require('./routes/drive');

// Mount routes
app.use('/api/v1/email', emailRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/drive', driveRoutes);
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:3001/health

# List emails
curl http://localhost:3001/api/v1/email/inbox

# Send email
curl -X POST http://localhost:3001/api/v1/email/send \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","body":"Hello!"}'

# Create task
curl -X POST http://localhost:3001/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task","status":"todo","priority":"high"}'

# List tasks
curl http://localhost:3001/api/v1/tasks

# Create calendar event
curl -X POST http://localhost:3001/api/v1/calendar/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Meeting","start_time":"2026-03-01T14:00:00Z"}'

# List drive files
curl http://localhost:3001/api/v1/drive/files

# Upload file
curl -X POST http://localhost:3001/api/v1/drive/files/upload \
  -F "file=@document.pdf" \
  -F "directory_id=root"
```

## 📊 Database Schema

### tasks table
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### events table
```sql
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  attendees TEXT[],
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🎯 Next Steps

1. **Deploy to VPS** — Run deploy.sh or manual steps above
2. **Test endpoints** — Use curl commands above
3. **Frontend integration** — Connect from React/Vue frontend
4. **Security hardening** — Move credentials to .env
5. **Authentication** — Add JWT middleware
6. **Rate limiting** — Prevent abuse
7. **Monitoring** — Add logging + health metrics

## 📚 Resources

- [README.md](./README.md) — Full API documentation
- [index.example.js](./index.example.js) — Complete server setup
- [package.json](./package.json) — Dependencies list
- [deploy.sh](./deploy.sh) — Automated deployment

## ✅ Checklist

- [x] Email routes (IMAP + SMTP)
- [x] Tasks routes (PostgreSQL CRUD)
- [x] Calendar routes (PostgreSQL CRUD)
- [x] Drive routes (kDrive proxy)
- [x] Auto table creation
- [x] Error handling
- [x] Documentation
- [x] Deployment script
- [x] Example integration
- [ ] Deployed to VPS
- [ ] Tested in production
- [ ] Frontend integration
- [ ] Security hardening

---

**Status:** ✅ Ready for deployment
**Created:** 2026-02-25
**Author:** Mike (Vutler Lead Engineer)
