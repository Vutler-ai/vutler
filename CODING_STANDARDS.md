# Vutler Coding Standards

> Best practices et conventions pour le développement Vutler

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js 20+ |
| Language | JavaScript (CommonJS) / TypeScript |
| API | Express.js |
| Base de données | PostgreSQL (principal) + MongoDB (Rocket.Chat) |
| Real-time | WebSocket (DDP, WS) |
| Cache/PubSub | Redis |
| Container | Docker |

---

## Structure des Dossiers

```
vutler/
├── api/              # Routes Express (1 fichier = 1 domaine)
│   ├── agents.js
│   ├── chat.js
│   ├── email.js
│   └── ...
├── services/         # Business logic & services
│   ├── agentRuntime.js
│   ├── agentManager.js
│   └── ...
├── lib/              # Utilitaires partagés
│   ├── auth.js
│   ├── postgres.js
│   └── logger.js
├── seeds/            # Data seeding
├── scripts/          # Scripts utilitaires
├── memory/           # Agent memory files
└── docs/             # Documentation
```

---

## Conventions de Nommage

### Fichiers
- **kebab-case** pour les fichiers : `agent-runtime.js`, `llm-router.js`
- **camelCase** accepté pour legacy : `agentRuntime.js`
- Suffixes explicites : `*.test.js`, `*.spec.js`, `*.config.js`

### Variables & Fonctions
```javascript
// Variables: camelCase
const agentConfig = {};
const isActive = true;

// Constantes: SCREAMING_SNAKE_CASE
const RC_WS_URL = process.env.RC_WS_URL || 'ws://localhost:3000';
const MAX_RETRY_COUNT = 5;

// Fonctions: camelCase, verbe en premier
function getAgentById(id) {}
function createWorkspace(data) {}
async function fetchMessages() {}

// Fonctions privées: préfixe underscore
async _loadFromPG() {}
_handleError(err) {}
```

### Classes
```javascript
// PascalCase pour les classes
class AgentRuntime {
  constructor(db, app) {
    this.db = db;
    this.app = app;
  }
}

class LLMRouter {}
class AgentProcessManager {}
```

### API Routes
```javascript
// RESTful naming, pluriel pour les collections
router.get('/agents', listAgents);
router.get('/agents/:id', getAgent);
router.post('/agents', createAgent);
router.put('/agents/:id', updateAgent);
router.delete('/agents/:id', deleteAgent);

// Actions spéciales: verbe après l'ID
router.post('/agents/:id/start', startAgent);
router.post('/agents/:id/stop', stopAgent);
```

---

## Patterns de Code

### Module Pattern (CommonJS)
```javascript
'use strict';

const dependency = require('./dependency');

// Constants en haut
const DEFAULT_TIMEOUT = 5000;

// Classe ou fonctions principales
class MyService {
  // ...
}

// Export unique en bas
module.exports = MyService;
// ou
module.exports = { function1, function2 };
```

### Express Router Pattern
```javascript
// api/agents.js
const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../lib/auth');

// Middleware d'auth sur toutes les routes
router.use(authenticateAgent);

// Routes
router.get('/', async (req, res) => {
  try {
    const agents = await getAgents(req.workspaceId);
    res.json({ success: true, data: agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

### Response Format Standard
```javascript
// Success
res.json({
  success: true,
  data: { /* payload */ },
  meta: { total: 100, page: 1 }  // optionnel
});

// Error
res.status(400).json({
  success: false,
  error: 'Validation failed',
  details: { field: 'email', message: 'Invalid format' }  // optionnel
});
```

### Async/Await Pattern
```javascript
// Toujours utiliser try/catch avec async
async function processMessage(messageId) {
  try {
    const message = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (!message) {
      throw new Error('Message not found');
    }
    return message;
  } catch (err) {
    console.error('[processMessage] Error:', err.message);
    throw err;  // Re-throw pour le handler parent
  }
}
```

### Logging Pattern
```javascript
// Préfixe avec le contexte [Module/Function]
console.log('[Runtime] Starting agent runtime…');
console.warn('[Runtime] Agent bus init skipped:', err.message);
console.error('[AgentRuntime._connect] WebSocket error:', err);

// Pour production: utiliser le logger structuré
const { logger } = require('./lib/logger');
logger.info({ agentId, action: 'start' }, 'Agent started');
logger.error({ err, agentId }, 'Agent failed to start');
```

---

## PostgreSQL Patterns

### Requêtes Paramétrées (anti SQL injection)
```javascript
// TOUJOURS utiliser les paramètres $1, $2, etc.
const result = await pool.query(
  'SELECT * FROM agents WHERE workspace_id = $1 AND status = $2',
  [workspaceId, 'active']
);

// JAMAIS de string interpolation
// ❌ `SELECT * FROM agents WHERE id = '${id}'`
```

### Transactions
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO agents ...', [...]);
  await client.query('INSERT INTO agent_channels ...', [...]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

## Error Handling

### Classes d'Erreur Custom
```javascript
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

### Middleware Error Handler
```javascript
// Toujours en dernier dans la chaîne Express
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: err.message,
    code: err.code || 'INTERNAL_ERROR'
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});
```

---

## Security Best Practices

### Environment Variables
```javascript
// Toujours avec fallback pour dev
const API_KEY = process.env.API_KEY || '';
const PORT = process.env.PORT || 3001;

// Valider les variables critiques au démarrage
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}
```

### Authentication
```javascript
// Toujours vérifier l'auth en premier
router.use(authenticateAgent);

// Headers requis
const authToken = req.headers['x-auth-token'];
const userId = req.headers['x-user-id'];
const workspaceId = req.headers['x-workspace-id'];
```

### Input Validation
```javascript
// Valider avant de traiter
const { name, email } = req.body;
if (!name || typeof name !== 'string' || name.length > 100) {
  return res.status(400).json({ success: false, error: 'Invalid name' });
}
```

---

## Git Conventions

### Branches
```
main              # Production
develop           # Integration
feature/S12-xxx   # Features (Sprint-Story)
fix/S12-xxx       # Bug fixes
hotfix/xxx        # Production hotfixes
```

### Commits
```
type(scope): description

Types:
- feat: Nouvelle fonctionnalité
- fix: Bug fix
- refactor: Refactoring
- docs: Documentation
- test: Tests
- chore: Maintenance

Exemples:
feat(agents): add agent memory persistence
fix(chat): resolve message deduplication issue
refactor(runtime): extract WebSocket handling to separate class
docs(api): update Swagger definitions
```

### Pull Requests
- Titre: `[S12.3] Feature description`
- Description: What, Why, How
- Checklist: Tests, Docs, Security review

---

## Tests

### Structure
```
tests/
├── unit/           # Tests unitaires (fast, isolated)
├── integration/    # Tests d'intégration (DB, APIs)
└── e2e/            # Tests end-to-end
```

### Naming
```javascript
// test-{feature}.js ou {feature}.test.js
describe('AgentRuntime', () => {
  describe('start()', () => {
    it('should load agents from PostgreSQL', async () => {
      // ...
    });

    it('should handle connection errors gracefully', async () => {
      // ...
    });
  });
});
```

### Running Tests
```bash
npm test              # All tests
npm run test:unit     # Unit only
npm run test:e2e      # E2E only
npm run test:coverage # With coverage
```

---

## Documentation

### JSDoc pour les fonctions publiques
```javascript
/**
 * Creates a new agent in the workspace
 * @param {string} workspaceId - The workspace identifier
 * @param {Object} agentData - Agent configuration
 * @param {string} agentData.name - Display name
 * @param {string} agentData.systemPrompt - System prompt for LLM
 * @returns {Promise<Agent>} The created agent
 * @throws {ValidationError} If agent data is invalid
 */
async function createAgent(workspaceId, agentData) {
  // ...
}
```

### README par module
Chaque dossier majeur (`api/`, `services/`) devrait avoir un README.md expliquant:
- Purpose du module
- Fichiers principaux
- Comment étendre

---

## Performance

### Connection Pooling
```javascript
// PostgreSQL pool (déjà configuré dans lib/postgres.js)
const { Pool } = require('pg');
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Caching Pattern
```javascript
// Redis pour cache fréquent
const cached = await redis.get(`agent:${agentId}`);
if (cached) return JSON.parse(cached);

const agent = await db.query(...);
await redis.setex(`agent:${agentId}`, 300, JSON.stringify(agent));
return agent;
```

---

## Checklist PR

- [ ] Code suit les conventions ci-dessus
- [ ] Pas de `console.log` de debug (utiliser logger)
- [ ] Variables d'env documentées
- [ ] Tests ajoutés/mis à jour
- [ ] Pas de secrets dans le code
- [ ] SQL utilise des paramètres (`$1`, `$2`)
- [ ] Errors sont catchés et loggés
- [ ] API responses suivent le format standard

---

*Dernière mise à jour: Février 2026*
