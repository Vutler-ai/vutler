# Vutler Integrations Framework — Brainstorm Output
> **Date:** 2026-02-28 | **Participants:** Luna (Product), Mike (Architecture), Philip (UX)

---

## Décisions Architecturales

### ADR-01: Plugin Architecture — Isolated Modules with Common Interface
**Decision:** Chaque intégration = un module isolé implémentant `IntegrationProvider` interface.

```typescript
interface IntegrationProvider {
  id: string;                          // "google-workspace", "github", etc.
  name: string;
  icon: string;
  scopes: Scope[];                     // default minimal scopes
  
  // Lifecycle
  connect(workspaceId: string, config: OAuthConfig): Promise<Connection>;
  disconnect(connectionId: string): Promise<void>;
  healthCheck(connectionId: string): Promise<HealthStatus>;
  
  // Capabilities
  capabilities: IntegrationCapability[];  // "read-email", "send-email", "list-files", etc.
  
  // Actions (what agents can do)
  execute(action: string, params: Record<string, any>, ctx: ExecutionContext): Promise<ActionResult>;
  
  // Webhooks (inbound events)
  handleWebhook?(payload: WebhookPayload): Promise<ParsedEvent[]>;
}
```

**Mike:** On utilise un registry pattern. Chaque provider s'enregistre au boot. Pas de hot-reload pour le MVP — trop de complexité pour peu de gain. On fera du hot-reload en v2 si nécessaire.

**Philip:** Chaque capability doit avoir un `displayName` et une `description` pour l'UI des permissions.

### ADR-02: Pas de Hot-Reload (Sprint 12-13)
**Decision:** Déploiement classique. Les intégrations sont des modules statiques importés au build.

**Rationale:** On n'a que 5-6 intégrations pour les 2 prochains sprints. Le coût de hot-reload (dynamic imports, sandboxing, versioning) ne se justifie pas. Revisiter quand on aura 15+ intégrations ou un marketplace.

### ADR-03: Sandboxing — Process-Level Isolation via Worker Context
**Decision:** Chaque exécution d'action d'intégration tourne dans le contexte du worker existant (BullMQ), avec timeout et memory limits. Pas de VM isolation pour le MVP.

**Mike:** On wrappe chaque `execute()` dans un try/catch avec timeout (30s default, configurable). Les erreurs sont catchées et loggées sans crash du worker. Si on ouvre un marketplace tiers plus tard, on passera à des isolates V8.

### ADR-04: OAuth2 Flow Centralisé
**Decision:** Un seul service OAuth2 gère tous les providers.

```
User clicks "Connect" → popup window → /api/v1/integrations/:provider/auth
  → redirect to provider consent screen
  → callback: /api/v1/integrations/:provider/callback
  → encrypt tokens → store in Vaultbrix (integration_credentials table)
  → auto-refresh via cron job (check expiry every 5min)
  → close popup, update UI via WebSocket event
```

**Mike:** Tokens encrypted at rest avec AES-256-GCM dans Vaultbrix. Même pattern que les LLM API keys. Clé de chiffrement dans env var, pas en DB.

### ADR-05: Token Storage in Vaultbrix
**Decision:** Table `integration_credentials` dans Vaultbrix PostgreSQL.

```sql
CREATE TABLE integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  provider VARCHAR(50) NOT NULL,        -- "google", "github", etc.
  account_label VARCHAR(255),           -- "alex@company.com"
  access_token_enc BYTEA NOT NULL,      -- AES-256-GCM encrypted
  refresh_token_enc BYTEA,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  metadata JSONB,                       -- provider-specific (org, tenant, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, provider, account_label)
);
```

**Pas de Supabase/Firebase.** Tout dans Vaultbrix. Point final.

### ADR-06: Multi-Tenant Credentials
**Decision:** Chaque workspace gère ses propres credentials. Un workspace peut avoir plusieurs connexions au même provider (ex: 2 comptes Google différents).

### ADR-07: Minimal Scopes by Default
**Decision:** Chaque provider définit des `defaultScopes` (lecture seule) et des `extendedScopes` (écriture). L'utilisateur choisit le niveau lors du connect. On peut upgrader les scopes plus tard via re-auth.

### ADR-08: Webhook Receiver avec Redis Queue
**Decision:** `POST /api/v1/webhooks/:provider/:workspaceId` → validation signature → push to Redis queue `webhooks:{provider}` → BullMQ worker processes → route to agent.

**Mike:** On a déjà Redis + BullMQ. Pas besoin d'in-memory. Redis nous donne persistence, retry, et dead letter queue gratuitement.

```typescript
// Webhook routing
interface WebhookRoute {
  workspace_id: string;
  provider: string;
  event_type: string;          // "github.push", "google.calendar.event.created"
  agent_id: string;            // which agent handles this
  filter?: JSONLogic;          // optional filter (e.g., only PRs to main branch)
}
```

### ADR-09: Event → Agent Routing
**Decision:** Table `webhook_subscriptions` — un agent s'abonne à des event types spécifiques. Quand un webhook arrive, on lookup les subscriptions matching et on trigger les agents concernés via le système d'automations existant (`/api/v1/automations`).

**Retry policy:** 3 attempts, exponential backoff (1s, 10s, 60s). Dead letter queue après 3 échecs. Dashboard pour voir/replay les DLQ events.

### ADR-10: Per-Agent Integration Access
**Decision:** Table `agent_integrations` — mapping N:N entre agents et credentials. Un agent ne peut utiliser que les intégrations explicitement autorisées par l'utilisateur.

**Philip:** C'est critique pour la confiance utilisateur. "Mon agent RH n'a pas accès à mon GitHub."

---

## Priorité des Intégrations

| # | Intégration | Impact | Effort | Score | Sprint |
|---|------------|--------|--------|-------|--------|
| 1 | **Slack** | 🔥🔥🔥 | 2j | ⭐⭐⭐⭐⭐ | 12 |
| 2 | **Google Workspace** (Gmail, Calendar, Drive) | 🔥🔥🔥🔥 | 5j | ⭐⭐⭐⭐⭐ | 12 |
| 3 | **GitHub** | 🔥🔥🔥 | 3j | ⭐⭐⭐⭐ | 12 |
| 4 | **Notion** | 🔥🔥🔥 | 2j | ⭐⭐⭐⭐ | 13 |
| 5 | **n8n** | 🔥🔥🔥🔥 | 5j | ⭐⭐⭐⭐ | 13 |
| 6 | **Microsoft 365** | 🔥🔥🔥 | 5j | ⭐⭐⭐ | 13 |
| 7 | **Jira/Linear** | 🔥🔥 | 3j | ⭐⭐⭐ | 14+ |
| 8 | **Stripe** | 🔥🔥 | 3j | ⭐⭐⭐ | 14 (déjà prévu) |
| 9 | **HuggingFace** | 🔥 | 2j | ⭐⭐ | 15+ |

**Luna:** Slack first car c'est le plus simple (bon SDK, webhooks faciles) et ça prouve le framework rapidement. Google Workspace ensuite car c'est le plus demandé. GitHub pour les dev teams.

**Mike:** Google est le plus complexe (4 APIs différentes). On commence par Gmail + Calendar en Sprint 12, Drive + Docs en Sprint 13.

---

## n8n Strategy

### Decision: Self-hosted sur le VPS Infomaniak
- Même infra que Vaultbrix (Docker sur REDACTED_DB_HOST)
- Container `vutler-n8n` dans le même Docker network
- Pas de cloud n8n — on contrôle tout

### Architecture Bidirectionnelle

```
Vutler → n8n:
  Agent déclenche un workflow n8n via API
  POST n8n-api/workflow/:id/execute
  Credentials: API key stockée dans Vaultbrix

n8n → Vutler:
  n8n webhook node → POST /api/v1/webhooks/n8n/:workspaceId
  n8n HTTP node → /api/v1/* (avec API key workspace)
```

### Pre-built Templates
- **Email digest:** Gmail → summarize → Slack notification
- **PR review:** GitHub PR → agent review → comment
- **Meeting prep:** Calendar event → gather context from Drive → brief agent
- **Issue triage:** Jira/Linear new issue → classify → assign agent

### Lien avec `/api/v1/automations`
- Un nouveau trigger type: `n8n_workflow`
- Un nouveau action type: `n8n_execute`
- Les templates n8n sont exposées comme des "automation templates" dans l'UI

---

## Sprint 12 Scope — Integrations Framework

**Durée:** 2 semaines

### Core Framework (semaine 1)
- [ ] `IntegrationProvider` interface + registry
- [ ] OAuth2 service (auth redirect, callback, token encrypt/store/refresh)
- [ ] `integration_credentials` table + migrations
- [ ] `agent_integrations` table (per-agent access control)
- [ ] `webhook_subscriptions` table
- [ ] Webhook receiver endpoint (`POST /api/v1/webhooks/:provider/:workspaceId`)
- [ ] BullMQ webhook processing queue
- [ ] Event → agent routing logic

### First Integrations (semaine 2)
- [ ] **Slack** provider (send message, read channel, webhook for mentions)
- [ ] **Google** provider — Gmail (read, send, search) + Calendar (list, create, webhook)
- [ ] **GitHub** provider (list repos, issues, PRs, webhook for push/PR events)

### UI (Philip)
- [ ] `/settings/integrations` page — grid layout, connect/disconnect buttons
- [ ] OAuth popup flow (window.open → postMessage callback)
- [ ] Connection status indicator (connected/expired/error)
- [ ] Per-agent integration permissions in agent settings

---

## Sprint 13 Scope — More Integrations + n8n

**Durée:** 2 semaines

### More Integrations (semaine 1)
- [ ] **Google Drive** (list, upload, download, share)
- [ ] **Google Docs** (read, create, edit)
- [ ] **Notion** provider (query DB, read/create pages)
- [ ] **Microsoft 365** provider — Outlook (read, send) + OneDrive (list, download)

### n8n (semaine 2)
- [ ] Deploy n8n container on VPS
- [ ] n8n API integration (execute workflow, list workflows)
- [ ] Vutler → n8n trigger action
- [ ] n8n → Vutler webhook path
- [ ] 3 pre-built workflow templates
- [ ] n8n section in `/settings/integrations`

### UI Enhancements (Philip)
- [ ] Integration status dashboard (last sync, errors, usage)
- [ ] Webhook event log viewer
- [ ] Scope upgrade flow (re-auth with more permissions)
- [ ] n8n workflow picker in automation builder

---

## Open Questions for Alex

1. **App registrations:** Qui crée les OAuth apps chez Google/GitHub/Microsoft ? On utilise un compte Vutler dédié ? Ou chaque workspace apporte ses propres app credentials ? (pour le MVP → Vutler gère les apps, mais on doit créer les comptes dev)

2. **Domain:** Callback URL = `https://app.vutler.io/api/v1/integrations/:provider/callback` — le domaine est-il prêt ?

3. **Rate limits budget:** Google API a des quotas stricts. On met un rate limiter côté Vutler ou on laisse les providers nous throttle ? (Mike recommande: rate limiter proactif per-workspace)

4. **n8n licensing:** La version community est suffisante ? Ou on a besoin de features enterprise (SSO, audit log) ?

5. **Encryption key management:** La clé AES pour les tokens — même clé que les LLM API keys ou clé séparée ? (Mike recommande: clé séparée, rotation indépendante)

6. **Scope des tests:** On mock les APIs externes pour les tests, ou on setup des sandbox accounts ? (Google/GitHub ont des sandbox envs)

7. **Priorité Microsoft 365:** Est-ce vraiment Sprint 13 ? Nos early users sont plutôt Google-centric. On pourrait repousser à Sprint 14 et avancer Jira/Linear à la place.

---

*Document généré le 2026-02-28. À valider avec Alex avant début Sprint 12.*
