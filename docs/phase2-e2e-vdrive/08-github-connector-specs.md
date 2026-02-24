# GitHub Connector - Spécifications Techniques
**Version:** 1.0  
**Date:** 2026-02-23  
**Équipe:** DevOps & Integration Starbox Group

## Résumé Exécutif

Le GitHub Connector intègre nativement les workflows de développement dans Vutler, permettant aux équipes PME/solopreneurs de synchroniser leurs projets GitHub avec leur workspace AI. Cette intégration inclut OAuth2, webhooks, auto-déploiement, et surveillance des vulnérabilités - le tout avec support E2E encryption.

## Architecture du Connecteur

### Vue d'Ensemble
```mermaid
graph TB
    subgraph "Vutler Core"
        GitHubConnector[GitHub Connector Service]
        CryptoService[Crypto Service]
        AgentRuntime[Agent Runtime]
        WebhookHandler[Webhook Handler]
    end
    
    subgraph "GitHub API"
        OAuth[GitHub OAuth2]
        RepoAPI[Repositories API]
        WebhooksAPI[Webhooks API]
        SecurityAPI[Security API]
    end
    
    subgraph "Storage"
        PG[(PostgreSQL)]
        Redis[(Redis Cache)]
    end
    
    subgraph "CI/CD Pipeline"
        Actions[GitHub Actions]
        Deploy[Auto Deploy]
        Monitor[Status Monitor]
    end
    
    GitHubConnector ←→ OAuth
    GitHubConnector ←→ RepoAPI
    WebhookHandler ←→ WebhooksAPI
    GitHubConnector ←→ SecurityAPI
    GitHubConnector ←→ PG
    GitHubConnector ←→ Redis
    Actions ←→ Deploy
```

## OAuth2 Implementation

### 1. Configuration OAuth App

```javascript
// GitHub OAuth App Settings
const GITHUB_OAUTH_CONFIG = {
  client_id: process.env.GITHUB_CLIENT_ID,
  client_secret: process.env.GITHUB_CLIENT_SECRET,
  scope: [
    'repo',              // Repository access
    'read:org',          // Organization access
    'admin:repo_hook',   // Webhook management
    'security_events'    // Security events
  ].join(' '),
  redirect_uri: 'https://vutler.starboxgroup.com/auth/github/callback'
};
```

### 2. Flux OAuth2 Sécurisé

```javascript
// 1. Initiation OAuth
app.get('/api/v1/github/auth', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state in Redis with TTL
  redis.setex(`github_oauth_state:${state}`, 600, req.user.id);
  
  const authUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${GITHUB_OAUTH_CONFIG.client_id}&` +
    `redirect_uri=${encodeURIComponent(GITHUB_OAUTH_CONFIG.redirect_uri)}&` +
    `scope=${encodeURIComponent(GITHUB_OAUTH_CONFIG.scope)}&` +
    `state=${state}`;
    
  res.redirect(authUrl);
});

// 2. Callback Handler avec Chiffrement
app.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Validate state parameter
  const userId = await redis.get(`github_oauth_state:${state}`);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid OAuth state' });
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_OAUTH_CONFIG.client_id,
      client_secret: GITHUB_OAUTH_CONFIG.client_secret,
      code: code
    }, {
      headers: { 'Accept': 'application/json' }
    });
    
    const { access_token, refresh_token } = tokenResponse.data;
    
    // Encrypt and store tokens
    const encryptedToken = await cryptoService.encrypt(access_token, userId);
    await db.query(`
      INSERT INTO github_integrations (user_id, encrypted_token, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        encrypted_token = $2, updated_at = NOW()
    `, [userId, encryptedToken]);
    
    // Setup initial webhooks
    await setupUserWebhooks(userId, access_token);
    
    res.redirect('/dashboard?github=connected');
  } catch (error) {
    logger.error('GitHub OAuth callback error:', error);
    res.redirect('/dashboard?github=error');
  }
});
```

### 3. Token Management avec Rotation

```javascript
class GitHubTokenManager {
  static async getValidToken(userId) {
    const integration = await db.query(`
      SELECT encrypted_token, created_at 
      FROM github_integrations 
      WHERE user_id = $1
    `, [userId]);
    
    if (!integration.rows.length) {
      throw new Error('No GitHub integration found');
    }
    
    const token = await cryptoService.decrypt(
      integration.rows[0].encrypted_token, 
      userId
    );
    
    // Check token validity
    const isValid = await this.validateToken(token);
    if (!isValid) {
      // Attempt to refresh if refresh_token exists
      return await this.refreshToken(userId);
    }
    
    return token;
  }
  
  static async validateToken(token) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: { 'Authorization': `token ${token}` }
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}
```

## Webhook Events Management

### 1. Webhook Configuration

```javascript
const SUPPORTED_WEBHOOK_EVENTS = [
  'push',                    // Code pushes
  'pull_request',           // PR events
  'issues',                 // Issue events  
  'release',                // Release events
  'repository',             // Repo changes
  'deployment_status',      // Deployment events
  'security_advisory',      // Security alerts
  'dependabot_alert'        // Dependency alerts
];

async function setupUserWebhooks(userId, accessToken) {
  const repos = await fetchUserRepositories(userId, accessToken);
  
  for (const repo of repos) {
    const webhook = await axios.post(
      `https://api.github.com/repos/${repo.full_name}/hooks`,
      {
        name: 'web',
        active: true,
        events: SUPPORTED_WEBHOOK_EVENTS,
        config: {
          url: 'https://vutler.starboxgroup.com/api/v1/github/webhook',
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: '0'
        }
      },
      {
        headers: { 'Authorization': `token ${accessToken}` }
      }
    );
    
    // Store webhook config encrypted
    await db.query(`
      INSERT INTO github_webhooks (user_id, repo_id, webhook_id, config)
      VALUES ($1, $2, $3, $4)
    `, [userId, repo.id, webhook.data.id, 
        await cryptoService.encrypt(JSON.stringify(webhook.data), userId)]);
  }
}
```

### 2. Webhook Event Processing

```javascript
app.post('/api/v1/github/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Hub-Signature-256');
  const payload = req.body;
  
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
    
  if (!crypto.timingSafeEqual(
    Buffer.from(signature), 
    Buffer.from(`sha256=${expectedSignature}`)
  )) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.get('X-GitHub-Event');
  const data = JSON.parse(payload);
  
  // Process event asynchronously
  processWebhookEvent(event, data).catch(error => {
    logger.error('Webhook processing error:', error);
  });
  
  res.status(200).json({ received: true });
});

async function processWebhookEvent(event, data) {
  switch (event) {
    case 'push':
      await handlePushEvent(data);
      break;
    case 'pull_request':
      await handlePullRequestEvent(data);
      break;
    case 'issues':
      await handleIssueEvent(data);
      break;
    case 'release':
      await handleReleaseEvent(data);
      break;
    case 'security_advisory':
    case 'dependabot_alert':
      await handleSecurityEvent(data);
      break;
    default:
      logger.info(`Unhandled webhook event: ${event}`);
  }
}
```

### 3. Auto-Deploy sur Merge to Main

```javascript
async function handlePushEvent(data) {
  // Check if push is to main/master branch
  const isMainBranch = data.ref === 'refs/heads/main' || data.ref === 'refs/heads/master';
  if (!isMainBranch) return;
  
  const repo = data.repository;
  const userId = await getUserIdFromRepo(repo.id);
  
  // Check if auto-deploy is enabled
  const settings = await db.query(`
    SELECT auto_deploy_enabled, deployment_config 
    FROM github_integrations 
    WHERE user_id = $1
  `, [userId]);
  
  if (!settings.rows[0]?.auto_deploy_enabled) return;
  
  // Trigger deployment
  const deploymentConfig = JSON.parse(
    await cryptoService.decrypt(settings.rows[0].deployment_config, userId)
  );
  
  await triggerDeployment({
    userId,
    repoId: repo.id,
    ref: data.ref,
    commits: data.commits,
    config: deploymentConfig
  });
  
  // Notify user via Vchat
  await notifyUserInChat(userId, {
    type: 'deployment_started',
    repo: repo.full_name,
    branch: data.ref.replace('refs/heads/', ''),
    commits: data.commits.length
  });
}

async function triggerDeployment(params) {
  const { userId, repoId, ref, commits, config } = params;
  
  // Create deployment record
  const deployment = await db.query(`
    INSERT INTO deployments (user_id, repo_id, git_ref, status, config, created_at)
    VALUES ($1, $2, $3, 'pending', $4, NOW())
    RETURNING id
  `, [userId, repoId, ref, JSON.stringify(config)]);
  
  const deploymentId = deployment.rows[0].id;
  
  try {
    // Execute deployment steps
    await executeDeploymentPipeline({
      deploymentId,
      userId,
      repoId,
      config,
      commits
    });
    
    await updateDeploymentStatus(deploymentId, 'success');
  } catch (error) {
    await updateDeploymentStatus(deploymentId, 'failed', error.message);
    
    // Notify failure in chat
    await notifyUserInChat(userId, {
      type: 'deployment_failed',
      error: error.message,
      deploymentId
    });
  }
}
```

## Dependency Vulnerability Tracking

### 1. Security Advisory Processing

```javascript
async function handleSecurityEvent(data) {
  const advisory = data.security_advisory || data.alert;
  const repo = data.repository;
  const userId = await getUserIdFromRepo(repo.id);
  
  // Store encrypted security event
  const encryptedAdvisory = await cryptoService.encrypt(
    JSON.stringify(advisory), 
    userId
  );
  
  await db.query(`
    INSERT INTO security_advisories (user_id, repo_id, advisory_id, severity, encrypted_data, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [userId, repo.id, advisory.id, advisory.severity, encryptedAdvisory]);
  
  // Check severity and notify immediately for high/critical
  if (['high', 'critical'].includes(advisory.severity)) {
    await notifyUserInChat(userId, {
      type: 'security_alert',
      severity: advisory.severity,
      package: advisory.package?.name,
      summary: advisory.summary,
      repo: repo.full_name
    });
    
    // Create agent task for vulnerability analysis
    await createAgentTask(userId, {
      type: 'security_analysis',
      repo: repo.full_name,
      advisory: advisory,
      priority: 'high'
    });
  }
}

// Periodic vulnerability scan
async function scanRepositoryVulnerabilities(userId, repoId) {
  const token = await GitHubTokenManager.getValidToken(userId);
  
  // Fetch Dependabot alerts
  const alerts = await axios.get(
    `https://api.github.com/repos/${repoId}/dependabot/alerts`,
    {
      headers: { 'Authorization': `token ${token}` }
    }
  );
  
  const vulnerabilities = alerts.data
    .filter(alert => alert.state === 'open')
    .map(alert => ({
      package: alert.dependency?.package?.name,
      severity: alert.security_advisory?.severity,
      summary: alert.security_advisory?.summary,
      patchable: alert.security_vulnerability?.first_patched_version !== null
    }));
    
  // Generate vulnerability report
  return {
    total: vulnerabilities.length,
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    patchable: vulnerabilities.filter(v => v.patchable).length,
    details: vulnerabilities
  };
}
```

## Integration avec Vutler Agent Runtime

### 1. Agent Commands pour GitHub

```javascript
class GitHubAgentCommands {
  static async registerCommands(agentRuntime) {
    agentRuntime.registerCommand('gh:status', this.getRepoStatus);
    agentRuntime.registerCommand('gh:issues', this.listIssues);
    agentRuntime.registerCommand('gh:create-issue', this.createIssue);
    agentRuntime.registerCommand('gh:deploy', this.triggerDeploy);
    agentRuntime.registerCommand('gh:security', this.getSecurityReport);
  }
  
  static async getRepoStatus(userId, args) {
    const { repo } = args;
    const token = await GitHubTokenManager.getValidToken(userId);
    
    const [repoInfo, branches, pulls] = await Promise.all([
      axios.get(`https://api.github.com/repos/${repo}`, {
        headers: { 'Authorization': `token ${token}` }
      }),
      axios.get(`https://api.github.com/repos/${repo}/branches`, {
        headers: { 'Authorization': `token ${token}` }
      }),
      axios.get(`https://api.github.com/repos/${repo}/pulls`, {
        headers: { 'Authorization': `token ${token}` }
      })
    ]);
    
    return {
      name: repoInfo.data.full_name,
      private: repoInfo.data.private,
      branches: branches.data.length,
      openPRs: pulls.data.length,
      lastPush: repoInfo.data.pushed_at,
      language: repoInfo.data.language
    };
  }
  
  static async createIssue(userId, args) {
    const { repo, title, body, labels = [] } = args;
    const token = await GitHubTokenManager.getValidToken(userId);
    
    const issue = await axios.post(
      `https://api.github.com/repos/${repo}/issues`,
      { title, body, labels },
      {
        headers: { 'Authorization': `token ${token}` }
      }
    );
    
    // Log action in chat
    await notifyUserInChat(userId, {
      type: 'issue_created',
      repo,
      issue: {
        number: issue.data.number,
        title: issue.data.title,
        url: issue.data.html_url
      }
    });
    
    return issue.data;
  }
}
```

### 2. Agent Memory Integration avec Snipara

```javascript
// Auto-indexation des repositories dans Snipara
async function indexRepositoryInSnipara(userId, repoData) {
  const sniparaClient = new SniparaClient(userId);
  
  // Create collection for this repo
  await sniparaClient.createCollection({
    name: `github-${repoData.full_name}`,
    type: 'github_repository',
    metadata: {
      repo_id: repoData.id,
      full_name: repoData.full_name,
      language: repoData.language,
      private: repoData.private
    }
  });
  
  // Index README, documentation, and key files
  const importantFiles = await fetchImportantFiles(userId, repoData.full_name);
  
  for (const file of importantFiles) {
    await sniparaClient.addDocument({
      collection: `github-${repoData.full_name}`,
      content: file.content,
      metadata: {
        path: file.path,
        type: file.type,
        sha: file.sha,
        last_modified: file.last_modified
      }
    });
  }
  
  // Index recent issues and PRs for context
  await indexRecentGitHubActivity(userId, repoData.full_name);
}
```

## API Endpoints Publics

### 1. REST API Endpoints

```javascript
// GET /api/v1/github/repos - List user repositories
app.get('/api/v1/github/repos', authenticateUser, async (req, res) => {
  try {
    const token = await GitHubTokenManager.getValidToken(req.user.id);
    const repos = await fetchUserRepositories(req.user.id, token);
    
    res.json({
      success: true,
      data: repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        language: repo.language,
        updated_at: repo.updated_at
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/github/deploy/:repo - Trigger manual deployment
app.post('/api/v1/github/deploy/:repo', authenticateUser, async (req, res) => {
  const { repo } = req.params;
  const { ref = 'main' } = req.body;
  
  try {
    const deployment = await triggerDeployment({
      userId: req.user.id,
      repoId: repo,
      ref: `refs/heads/${ref}`,
      commits: [],
      config: req.body.config || {}
    });
    
    res.json({
      success: true,
      deployment_id: deployment.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/github/security/:repo - Get security report
app.get('/api/v1/github/security/:repo', authenticateUser, async (req, res) => {
  try {
    const report = await scanRepositoryVulnerabilities(req.user.id, req.params.repo);
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 2. WebSocket Events

```javascript
// Real-time GitHub events via WebSocket
const githubEventEmitter = new EventEmitter();

githubEventEmitter.on('push', (data) => {
  wsServer.to(`user:${data.userId}`).emit('github:push', {
    repo: data.repo,
    branch: data.branch,
    commits: data.commits
  });
});

githubEventEmitter.on('deployment:status', (data) => {
  wsServer.to(`user:${data.userId}`).emit('github:deployment', {
    repo: data.repo,
    status: data.status,
    deployment_id: data.deploymentId
  });
});

githubEventEmitter.on('security:alert', (data) => {
  wsServer.to(`user:${data.userId}`).emit('github:security', {
    repo: data.repo,
    severity: data.severity,
    advisory: data.advisory
  });
});
```

## Configuration et Déploiement

### 1. Variables d'Environnement

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Deployment settings
AUTO_DEPLOY_ENABLED=true
DEPLOYMENT_TIMEOUT_MS=600000

# Security scanning
SECURITY_SCAN_INTERVAL=3600000  # 1 hour
VULNERABILITY_ALERT_THRESHOLD=high
```

### 2. Base de Données Schema

```sql
-- GitHub integrations table
CREATE TABLE github_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    encrypted_token BYTEA NOT NULL,
    auto_deploy_enabled BOOLEAN DEFAULT false,
    deployment_config TEXT, -- JSON encrypted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- GitHub webhooks
CREATE TABLE github_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repo_id BIGINT NOT NULL,
    webhook_id BIGINT NOT NULL,
    config TEXT NOT NULL, -- JSON encrypted
    created_at TIMESTAMP DEFAULT NOW()
);

-- Deployments tracking
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repo_id BIGINT NOT NULL,
    git_ref VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    config TEXT, -- JSON
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Security advisories
CREATE TABLE security_advisories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repo_id BIGINT NOT NULL,
    advisory_id VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    encrypted_data BYTEA NOT NULL,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, repo_id, advisory_id)
);

-- Indexes
CREATE INDEX idx_github_integrations_user_id ON github_integrations(user_id);
CREATE INDEX idx_deployments_user_id ON deployments(user_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_security_advisories_user_id ON security_advisories(user_id);
CREATE INDEX idx_security_advisories_severity ON security_advisories(severity);
```

## Tests et Validation

### 1. Tests OAuth Flow
```javascript
describe('GitHub OAuth Flow', () => {
  test('should initiate OAuth with valid state', async () => {
    // Test implementation
  });
  
  test('should handle callback and store encrypted token', async () => {
    // Test implementation
  });
  
  test('should reject invalid state parameter', async () => {
    // Test implementation
  });
});
```

### 2. Tests Webhook Security
```javascript
describe('Webhook Security', () => {
  test('should validate webhook signature', async () => {
    // Test implementation
  });
  
  test('should reject webhooks with invalid signature', async () => {
    // Test implementation
  });
});
```

## Roadmap et Améliorations Futures

### Phase 2.1 (Q2 2026)
- **GitHub Actions Integration:** Trigger/monitor workflows directement depuis Vutler
- **Code Review Assistant:** Agent IA pour review automatique des PRs
- **Git Blame Integration:** Historique des modifications dans Vchat

### Phase 2.2 (Q3 2026)
- **Multi-Provider Support:** GitLab, Bitbucket integration
- **Advanced Security:** SAST/DAST integration
- **Team Collaboration:** Shared repositories, team permissions

### Phase 3.0 (Q4 2026)
- **Enterprise Features:** SSO, advanced audit logs
- **AI Code Generation:** Automatic PR creation based on agent suggestions
- **Performance Analytics:** Repository performance metrics

---

**Contact Technique:** lopez@starboxgroup.com  
**Documentation:** [GitHub Connector Wiki](https://github.com/starboxgroup/vutler/wiki)  
**Support:** #github-connector sur Discord interne