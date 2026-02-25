# Vutler API Routes

4 modules Express Router complets pour le backend Vutler.

## Installation

Dépendances npm requises :

```bash
npm install express pg node-imap nodemailer mailparser node-fetch multer form-data
```

## Intégration dans index.js

Ajouter dans `/home/ubuntu/vutler/app/index.js` :

```javascript
const express = require('express');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vutler API running on port ${PORT}`);
});
```

## Endpoints

### 📧 Email (alex@vutler.com)

- **GET** `/api/v1/email/inbox?limit=50` — Liste emails inbox
- **GET** `/api/v1/email/:uid` — Email complet par UID
- **POST** `/api/v1/email/send` — Envoyer email
  ```json
  {
    "to": "recipient@example.com",
    "subject": "Subject",
    "body": "Plain text",
    "html": "<p>HTML body</p>"
  }
  ```

### ✅ Tasks (PostgreSQL)

- **GET** `/api/v1/tasks?status=todo&assigned_to=alex` — Liste tâches
- **POST** `/api/v1/tasks` — Créer tâche
  ```json
  {
    "title": "Task title",
    "description": "Details",
    "status": "todo",
    "priority": "high",
    "assigned_to": "alex",
    "due_date": "2026-03-01T10:00:00Z"
  }
  ```
- **PUT** `/api/v1/tasks/:id` — Mettre à jour tâche
- **DELETE** `/api/v1/tasks/:id` — Supprimer tâche

### 📅 Calendar (PostgreSQL)

- **GET** `/api/v1/calendar/events?start=2026-02-01&end=2026-02-28` — Liste events
- **POST** `/api/v1/calendar/events` — Créer event
  ```json
  {
    "title": "Meeting",
    "description": "Quarterly review",
    "start_time": "2026-03-01T14:00:00Z",
    "end_time": "2026-03-01T15:00:00Z",
    "location": "Office",
    "attendees": ["alex@vutler.com", "team@vutler.com"],
    "color": "#3b82f6"
  }
  ```
- **PUT** `/api/v1/calendar/events/:id` — Mettre à jour event
- **DELETE** `/api/v1/calendar/events/:id` — Supprimer event

### 📁 Drive (kDrive proxy)

- **GET** `/api/v1/drive/files?directory_id=123` — Liste fichiers
- **GET** `/api/v1/drive/files/:id` — Métadonnées fichier
- **GET** `/api/v1/drive/files/:id/download` — Download fichier
- **POST** `/api/v1/drive/files/upload` — Upload fichier (multipart/form-data)
  - Form field: `file` (le fichier)
  - Form field: `directory_id` (optionnel, default: root)
  - Form field: `filename` (optionnel, override nom)
- **DELETE** `/api/v1/drive/files/:id` — Supprimer fichier

## Configuration

### PostgreSQL
- Host: `vutler-postgres` (Docker internal)
- Port: `5432`
- User: `vaultbrix`
- Password: `vaultbrix`
- Database: `vaultbrix`

Tables créées automatiquement au démarrage :
- `tasks` (id, title, description, status, priority, assigned_to, due_date, created_at, updated_at)
- `events` (id, title, description, start_time, end_time, location, attendees, color, created_at)

### Email (Infomaniak)
- IMAP: `mail.infomaniak.com:993` (TLS)
- SMTP: `mail.infomaniak.com:587` (STARTTLS)
- Account: `alex@vutler.com`

### kDrive (Infomaniak)
- Drive ID: `2021270`
- API Base: `https://api.infomaniak.com/2/drive/2021270`

## Test rapide

```bash
# Health check
curl http://localhost:3001/health

# Liste emails
curl http://localhost:3001/api/v1/email/inbox

# Liste tâches
curl http://localhost:3001/api/v1/tasks

# Créer event
curl -X POST http://localhost:3001/api/v1/calendar/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","start_time":"2026-03-01T10:00:00Z"}'

# Liste fichiers kDrive
curl http://localhost:3001/api/v1/drive/files
```

## Déploiement VPS

```bash
# Copier les routes vers le container
docker cp email.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp tasks.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp calendar.js vutler-api:/home/ubuntu/vutler/app/routes/
docker cp drive.js vutler-api:/home/ubuntu/vutler/app/routes/

# Installer dépendances dans le container
docker exec vutler-api npm install pg node-imap nodemailer mailparser node-fetch multer form-data

# Redémarrer API
docker restart vutler-api
```

## Notes

- **Email**: IMAP en lecture seule (flag `readOnly: true`). Les emails restent dans la boîte.
- **Tasks/Calendar**: Les tables PostgreSQL sont créées automatiquement au premier démarrage.
- **kDrive**: Le token API est hardcodé (pour prod, utiliser des env vars).
- **CORS**: Ajouter `cors` middleware si nécessaire pour les appels depuis le frontend.

## Security Checklist

- [ ] Déplacer credentials vers `.env` (EMAIL_PASSWORD, DB_PASSWORD, KDRIVE_TOKEN)
- [ ] Ajouter authentication middleware (JWT/API key)
- [ ] Activer CORS avec whitelist domains
- [ ] Rate limiting sur endpoints publics
- [ ] Input validation avec `express-validator`
- [ ] Logging avec `winston` ou `pino`
