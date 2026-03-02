# 🔍 Rapport des Problèmes de Câblage Frontend-Backend

## Date: 2026-03-02

---

## ❌ Routes API MANQUANTES

### 1. Routes Nexus (Utilisées dans le frontend)
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `POST /api/v1/nexus/register` | `nexus/page.tsx:45` | ❌ MANQUANTE |
| `POST /api/v1/nexus/local-token` | `nexus/page.tsx:59`, `nexus/setup/page.tsx:46` | ❌ MANQUANTE |

**Existantes:**
- ✅ `GET /api/v1/nexus/status`
- ✅ `GET /api/v1/nexus/cli/tokens`
- ✅ `POST /api/v1/nexus/cli/tokens`
- ✅ `DELETE /api/v1/nexus/cli/tokens/:id`
- ✅ `GET /api/v1/nexus/cli/instances`

### 2. Routes Marketplace (NON EXISTANTES)
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/marketplace/templates` | `marketplace/page.tsx` | ❌ MANQUANTE |
| `GET /api/v1/marketplace/templates?search=` | `marketplace/page.tsx` | ❌ MANQUANTE |
| `GET /api/v1/marketplace/templates/:id` | `marketplace/[id]/page.tsx` | ❌ MANQUANTE |
| `POST /api/v1/marketplace/templates/:id/install` | `marketplace/page.tsx` | ❌ MANQUANTE |
| `GET /api/v1/marketplace/my-templates` | `marketplace/page.tsx` | ❌ MANQUANTE |

### 3. Routes Auth Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `PUT /api/v1/auth/me/password` | `settings/page.tsx` | ❌ MANQUANTE |

### 4. Routes Calendar Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `PUT /api/v1/calendar/events/:id` | `calendar/page.tsx` | ❌ MANQUANTE |
| `DELETE /api/v1/calendar/events/:id` | `calendar/page.tsx` | ❌ MANQUANTE |

### 5. Routes Chat Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/chat/channels/:id/messages` | `chat/page.tsx` (multiple) | ❌ MANQUANTE |
| `POST /api/v1/chat/channels/:id/messages` | `chat/page.tsx` | ❌ MANQUANTE |
| `GET /api/v1/chat/channels/direct` | `chat/page.tsx` | ❌ MANQUANTE |
| `POST /api/v1/chat/channels` | `chat/page.tsx` | ❌ MANQUANTE |

### 6. Routes Automations Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `POST /api/v1/automations` | `automations/new/page.tsx` | ❌ MANQUANTE |
| `PUT /api/v1/automations/:id` | `automations/page.tsx` | ❌ MANQUANTE |

### 7. Routes Integrations Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/integrations/available` | `integrations/page.tsx` | ❌ MANQUANTE |
| `GET /api/v1/integrations/:provider/agents` | `settings/integrations/[provider]/page.tsx` | ❌ MANQUANTE |

### 8. Routes Tasks Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `POST /api/v1/tasks` | `tasks/page.tsx` | ❌ MANQUANTE |
| `PUT /api/v1/tasks/:id` | `tasks/page.tsx` | ❌ MANQUANTE |
| `DELETE /api/v1/tasks/:id` | `tasks/page.tsx` | ❌ MANQUANTE |
| `PUT /api/v1/tasks/:id/complete` | `tasks/page.tsx` | ❌ MANQUANTE |

### 9. Routes Settings Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/settings/notifications` | `settings/email/page.tsx` | ❌ MANQUANTE |
| `PUT /api/v1/settings/notifications` | `settings/email/page.tsx` | ❌ MANQUANTE |

### 10. Routes Notifications Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `POST /api/v1/notifications/test-email` | `settings/email/page.tsx` | ❌ MANQUANTE |

### 11. Routes Agents Config Manquantes
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/agents/:id/config` | `agents/[id]/config/page.tsx` (multiple) | ❌ MANQUANTE |
| `PUT /api/v1/agents/:id/config` | `agents/[id]/config/page.tsx` | ❌ MANQUANTE |

### 12. Routes Audit Logs
| Route | Utilisée dans | Statut |
|-------|--------------|--------|
| `GET /api/v1/audit-logs` | `audit-logs/page.tsx` | ❌ MANQUANTE |

---

## ⚠️ Problèmes de Menu (Sidebar)

### Incohérences trouvées:

1. **Double définition de certaines routes:**
   - `/integrations` dans la section "Tools"
   - `/settings/integrations` dans la section "Config"

2. **Routes sans backend:**
   - `/clients` → utilise `/api/v1/deployments` (incohérence)
   - `/pixel-office` → utilise plusieurs APIs différentes
   - `/sandbox` → utilise `/api/v1/agents`

3. **Sections du menu:**
   - Workspace: Dashboard, Marketplace, Notifications, Chat, Agents, Builder
   - Tools: Email, Integrations, Tasks, Pixel Office, Calendar, Drive
   - Nexus: Nexus, Setup, Deployments, Clients, Sandbox
   - Config: Providers, LLM Settings, Usage, Audit Logs, Settings, Automations, Integrations
   - Discover: Templates

---

## 🛠️ Actions Requises

### Priorité 1 (Critique - Bloquant)
1. Créer `api/marketplace.js` avec toutes les routes marketplace
2. Ajouter les routes Nexus manquantes (`/register`, `/local-token`)
3. Ajouter les routes Auth manquantes (`/me/password`)

### Priorité 2 (Haute)
4. Ajouter les routes Calendar manquantes (PUT, DELETE events)
5. Ajouter les routes Chat manquantes (messages, channels)
6. Ajouter les routes Automations manquantes (POST, PUT)
7. Ajouter les routes Tasks manquantes (CRUD complet)

### Priorité 3 (Moyenne)
8. Ajouter les routes Integrations manquantes
9. Ajouter les routes Settings notifications
10. Ajouter les routes Agents config
11. Ajouter les routes Audit Logs

---

## 📊 Statistiques

- **Routes totales identifiées**: ~60
- **Routes implémentées**: ~35 (58%)
- **Routes manquantes**: ~25 (42%)
- **Fichiers API à créer**: 2 (marketplace.js, audit-logs.js)
- **Fichiers API à modifier**: ~15

---

## 📝 Notes

- Certains fichiers frontend ont des extensions mixtes (.tsx et .jsx dans le même dossier)
- Des fichiers backup existent (`nexus.backup.20260302-080237`) et devraient être nettoyés
- La route `/clients` utilise l'API `/api/v1/deployments` ce qui est incohérent
