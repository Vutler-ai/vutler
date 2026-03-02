# VUTLER-TOOLS.md — Shared Agent Tools

Tous les agents Starbox Group utilisent les outils Vutler pour le travail quotidien.
**Base URL**: https://app.vutler.ai (ou http://localhost:3001 depuis le VPS)
**VPS SSH**: `ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180`
**DB directe**: host=REDACTED_DB_HOST, port=6543, user=REDACTED_DB_USER, password=REDACTED_DB_PASSWORD, db=postgres, schema=tenant_vutler
**Workspace ID**: 00000000-0000-0000-0000-000000000001

## 📋 Tasks (Todo)

### Lister les tâches
```
curl -sk "https://app.vutler.ai/api/v1/tasks" 
curl -sk "https://app.vutler.ai/api/v1/tasks?status=todo&assignee=mike"
```

### Créer une tâche (via DB — l'API requiert auth)
```sql
INSERT INTO tenant_vutler.tasks (title, description, status, priority, assignee, due_date, workspace_id)
VALUES ('Titre', 'Description', 'todo', 'medium', 'mike', '2026-03-07', '00000000-0000-0000-0000-000000000001');
```
- **status**: todo, in_progress, done, backlog
- **priority**: low, medium, high, critical
- **assignee**: jarvis, mike, philip, luna, andrea, max, victor, oscar, nora, stephen, sentinel, marcus

### Mettre à jour une tâche
```sql
UPDATE tenant_vutler.tasks SET status = 'done' WHERE id = '<uuid>';
```

## 📅 Calendar (Agenda)

### Lister les events
```
curl -sk "https://app.vutler.ai/api/v1/calendar/events"
```

### Créer un event
```sql
INSERT INTO tenant_vutler.calendar_events (title, description, start_time, end_time, color, workspace_id)
VALUES ('Sprint Review', 'Revue du sprint', '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z', '#3b82f6', '00000000-0000-0000-0000-000000000001');
```
- **Colors**: #ef4444 (red/deadline), #3b82f6 (blue/meeting), #22c55e (green/milestone), #a855f7 (purple/release)

## 📁 Drive (Fichiers) — OBLIGATOIRE
**⚠️ Règle absolue : Tout document, brief, code ou rapport généré DOIT être uploadé sur le Drive Synology.**
- Docs/briefs → `/starbox_drive/agents/<ton-nom>/docs/`
- Code → `/starbox_drive/agents/<ton-nom>/code/`
- Rapports partagés → `/starbox_drive/shared/reports/`

### Lister les fichiers
```
curl -sk "https://app.vutler.ai/api/v1/drive/files"              # Racine NAS
curl -sk "https://app.vutler.ai/api/v1/drive/files?path=agents/mike"  # Dossier agent
```

### Upload un fichier
```bash
curl -sk -X POST "https://app.vutler.ai/api/v1/drive/upload" -F "file=@monfile.md" -F "path=agents/mike/docs"
```

### Créer un dossier
```bash
curl -sk -X POST "https://app.vutler.ai/api/v1/drive/mkdir" -H "Content-Type: application/json" -d '{"name":"nouveau-dossier","path":"agents/mike"}'
```

### Structure NAS
```
/starbox_drive/
├── agents/          # Un dossier par agent
│   ├── alex/
│   ├── jarvis/
│   ├── mike/
│   ├── philip/
│   ├── luna/
│   └── ...
├── shared/          # Fichiers partagés
├── workspaces/      # Workspaces
└── vdrive/          # Virtual drive
```

## 📧 Email (Postal)

### Envoyer un email via Postal API
```bash
curl -sk -X POST "https://mail.vutler.ai/api/v1/send/message" \
  -H "X-Server-API-Key: aa91f11a58ea9771d5036ed6429073f709a716bf" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["destinataire@example.com"],
    "from": "agent@vutler.ai",
    "subject": "Sujet",
    "plain_body": "Corps du message"
  }'
```

### Adresses agent
| Agent | Email |
|-------|-------|
| Jarvis | jarvis@vutler.ai |
| Mike | mike@vutler.ai |
| Luna | luna@vutler.ai |
| Philip | philip@vutler.ai |
| Andrea | andrea@vutler.ai |
| Max | max@vutler.ai |
| Victor | victor@vutler.ai |
| Oscar | oscar@vutler.ai |
| Nora | nora@vutler.ai |
| Stephen | stephen@vutler.ai |
| Contact | contact@vutler.ai |
| Support | support@vutler.ai |

## 💬 Chat (Vchat / Rocket.Chat)

### Poster dans un channel
```bash
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180 'curl -s -X POST "http://127.0.0.1:3000/api/v1/chat.sendMessage" \
  -H "X-Auth-Token: <TOKEN>" -H "X-User-Id: <USER_ID>" \
  -H "Content-Type: application/json" \
  -d "{\"message\":{\"rid\":\"<CHANNEL_ID>\",\"msg\":\"Mon message\"}}"'
```

### Channel IDs
| Channel | ID |
|---------|-----|
| general | GENERAL |
| engineering | 6994cd266dac3d6576c9d4fa |
| product | 6994cd266dac3d6576c9d501 |
| design | 6994cd266dac3d6576c9d508 |
| marketing-growth | 6994cd276dac3d6576c9d50e |
| ops-jarvis | 6994cd276dac3d6576c9d529 |

## 🔧 Convention d'usage

1. **Quand tu commences une tâche** → mets-la en `in_progress`
2. **Quand tu finis** → mets-la en `done` + crée les sous-tâches si nécessaire
3. **Sauvegarde tes livrables** dans ton dossier Drive (`agents/<ton-nom>/`)
4. **Logge les décisions importantes** en créant une tâche de type note
5. **Utilise le calendrier** pour les deadlines et milestones
