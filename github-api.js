/**
 * Vutler GitHub API - OAuth, Webhooks, Repository Management
 * Handles GitHub integration endpoints for Vutler workspace
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { GitHubConnector } = require('../services/githubConnector');
const { CryptoService } = require('../services/crypto');

const router = express.Router();
const cryptoService = new CryptoService();

// Initialize GitHub connector
const githubConnector = new GitHubConnector({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  redirectUri: process.env.GITHUB_REDIRECT_URI || 'https://vutler.starboxgroup.com/auth/github/callback'
});

// Redis for state storage (in production, use actual Redis)
const stateStorage = new Map();

// Middleware
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  
  req.user = {
    id: 'user_123',
    workspaceId: 'workspace_456'
  };
  
  next();
};

/**
 * GET /api/v1/github/auth/oauth - Initiate OAuth flow
 */
router.get('/auth/oauth', [
  authenticateUser,
  query('redirect_uri').optional().isURL()
], async (req, res) => {
  try {
    const { redirect_uri } = req.query;
    const userId = req.user.id;
    
    // Generate CSRF state
    const state = cryptoService.generateId();
    
    // Store state temporarily (10 minutes)
    stateStorage.set(state, {
      userId: userId,
      redirectUri: redirect_uri,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000)
    });
    
    // Cleanup expired states
    setTimeout(() => stateStorage.delete(state), 10 * 60 * 1000);
    
    const authUrl = githubConnector.generateAuthUrl(state);
    
    res.json({
      success: true,
      authUrl: authUrl,
      state: state,
      expiresIn: 600 // 10 minutes
    });

  } catch (error) {
    console.error('OAuth initiation error:', error);
    res.status(500).json({
      error: 'OAuth initiation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/github/auth/callback - OAuth callback handler
 */
router.get('/auth/callback', [
  query('code').notEmpty().withMessage('Authorization code required'),
  query('state').notEmpty().withMessage('State parameter required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, state } = req.query;
    
    // Validate state
    const stateData = stateStorage.get(state);
    if (!stateData || Date.now() > stateData.expiresAt) {
      return res.status(400).json({
        error: 'Invalid or expired OAuth state',
        code: 'INVALID_OAUTH_STATE'
      });
    }
    
    // Exchange code for token
    const tokenData = await githubConnector.exchangeCodeForToken(code);
    
    // Validate token and get user info
    const userInfo = await githubConnector.validateToken(tokenData.accessToken);
    if (!userInfo.valid) {
      throw new Error('Invalid access token received');
    }
    
    // Encrypt and store token
    const userId = stateData.userId;
    const encryptedToken = await cryptoService.encrypt(tokenData.accessToken, await cryptoService.generateKey());
    
    const integrationData = {
      id: cryptoService.generateId(),
      userId: userId,
      githubUserId: userInfo.user.id,
      username: userInfo.user.login,
      name: userInfo.user.name,
      email: userInfo.user.email,
      avatar: userInfo.user.avatar,
      encryptedAccessToken: encryptedToken,
      scopes: userInfo.scopes,
      connectedAt: new Date().toISOString()
    };

    // TODO: Store in PostgreSQL database
    console.log('GitHub integration created:', integrationData);
    
    // Cleanup state
    stateStorage.delete(state);
    
    // Get user repositories
    const repositories = await githubConnector.getUserRepositories(tokenData.accessToken, {
      perPage: 10
    });

    // Redirect to success page or return JSON
    if (stateData.redirectUri) {
      res.redirect(`${stateData.redirectUri}?success=true&integration_id=${integrationData.id}`);
    } else {
      res.json({
        success: true,
        integration: {
          id: integrationData.id,
          githubUserId: integrationData.githubUserId,
          username: integrationData.username,
          name: integrationData.name,
          avatar: integrationData.avatar,
          scopes: integrationData.scopes,
          connectedAt: integrationData.connectedAt,
          repositories: repositories.length
        },
        repositories: repositories,
        webhookSetupRequired: true
      });
    }

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Redirect to error page or return JSON error
    if (req.query.state && stateStorage.get(req.query.state)?.redirectUri) {
      res.redirect(`${stateStorage.get(req.query.state).redirectUri}?error=oauth_failed`);
    } else {
      res.status(500).json({
        error: 'OAuth callback failed',
        message: error.message
      });
    }
  }
});

/**
 * GET /api/v1/github/repositories - List user repositories
 */
router.get('/repositories', [
  authenticateUser,
  query('page').optional().isInt({ min: 1 }),
  query('per_page').optional().isInt({ min: 1, max: 100 }),
  query('sort').optional().isIn(['created', 'updated', 'pushed', 'full_name']),
  query('direction').optional().isIn(['asc', 'desc'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const options = {
      page: req.query.page || 1,
      perPage: req.query.per_page || 50,
      sort: req.query.sort || 'updated',
      direction: req.query.direction || 'desc'
    };

    // TODO: Get encrypted access token from database
    const accessToken = 'github_access_token'; // Should be decrypted from DB

    const repositories = await githubConnector.getUserRepositories(accessToken, options);
    
    // Enhance with integration status
    const enhancedRepos = repositories.map(repo => ({
      ...repo,
      connected: false, // TODO: Check if webhook is setup
      autoDeployEnabled: false,
      lastWebhookEvent: null
    }));

    res.json({
      success: true,
      repositories: enhancedRepos,
      pagination: {
        page: options.page,
        perPage: options.perPage,
        total: repositories.length,
        hasMore: repositories.length === options.perPage
      }
    });

  } catch (error) {
    console.error('List repositories error:', error);
    res.status(500).json({
      error: 'Failed to list repositories',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/github/repositories/:repoId/connect - Connect repository
 */
router.post('/repositories/:repoId/connect', [
  authenticateUser,
  param('repoId').isInt().withMessage('Valid repository ID required'),
  body('autoDeployEnabled').optional().isBoolean(),
  body('deployBranches').optional().isArray(),
  body('webhookEvents').optional().isArray(),
  body('agentNotifications').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { repoId } = req.params;
    const {
      autoDeployEnabled = true,
      deployBranches = ['main'],
      webhookEvents = ['push', 'pull_request', 'release'],
      agentNotifications = {}
    } = req.body;

    const userId = req.user.id;

    // TODO: Get repository info and access token from database
    const repoFullName = 'user/repo'; // Should be fetched from DB
    const accessToken = 'github_access_token'; // Should be decrypted from DB

    // Generate webhook URL
    const webhookUrl = `https://vutler.starboxgroup.com/api/v1/github/webhook/${userId}`;

    // Setup webhook
    const webhookData = await githubConnector.setupWebhook(
      accessToken,
      repoFullName,
      webhookUrl
    );

    const connectionData = {
      id: cryptoService.generateId(),
      userId: userId,
      repositoryId: repoId,
      repositoryFullName: repoFullName,
      webhookId: webhookData.id,
      webhookUrl: webhookUrl,
      autoDeployEnabled: autoDeployEnabled,
      deployBranches: deployBranches,
      webhookEvents: webhookEvents,
      agentNotifications: agentNotifications,
      connectedAt: new Date().toISOString()
    };

    // TODO: Store connection in PostgreSQL
    console.log('Repository connected:', connectionData);

    res.json({
      success: true,
      connection: {
        id: connectionData.id,
        repositoryId: repoId,
        webhookUrl: webhookUrl,
        webhookId: webhookData.id,
        autoDeployEnabled: autoDeployEnabled,
        webhookEvents: webhookEvents,
        connectedAt: connectionData.connectedAt
      }
    });

  } catch (error) {
    console.error('Connect repository error:', error);
    res.status(500).json({
      error: 'Failed to connect repository',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/github/webhook/:userId - Webhook receiver
 */
router.post('/webhook/:userId', [
  param('userId').isUUID().withMessage('Valid user ID required')
], async (req, res) => {
  try {
    const signature = req.get('X-Hub-Signature-256');
    const event = req.get('X-GitHub-Event');
    const delivery = req.get('X-GitHub-Delivery');
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!githubConnector.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({
        error: 'Invalid webhook signature',
        code: 'GITHUB_WEBHOOK_INVALID'
      });
    }

    // Process event asynchronously
    const result = await githubConnector.processWebhookEvent(event, req.body);

    // Log webhook event
    console.log(`Webhook processed: ${event} for user ${req.params.userId}`, {
      delivery: delivery,
      processed: result.processed
    });

    res.status(200).json({
      success: true,
      event: event,
      delivery: delivery,
      processed: result.processed
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/github/events - List GitHub events
 */
router.get('/events', [
  authenticateUser,
  query('repository').optional().isString(),
  query('event_type').optional().isString(),
  query('from_date').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      repository,
      event_type,
      from_date,
      limit = 50
    } = req.query;

    // TODO: Query events from PostgreSQL with filters
    // Mock data for now
    const events = [
      {
        id: 'event-1',
        eventType: 'push',
        repository: 'johndoe/my-project',
        branch: 'main',
        author: {
          username: 'johndoe',
          email: 'john@example.com'
        },
        commits: [
          {
            sha: 'abc123def456',
            message: 'Fix authentication bug',
            url: 'https://github.com/johndoe/my-project/commit/abc123def456'
          }
        ],
        autoDeployTriggered: true,
        agentsNotified: ['claude-assistant', 'code-assistant'],
        receivedAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      }
    ];

    res.json({
      success: true,
      events: events,
      filters: {
        repository,
        eventType: event_type,
        fromDate: from_date
      },
      total: events.length,
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({
      error: 'Failed to list events',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/github/repositories/:repoId/deploy - Trigger manual deployment
 */
router.post('/repositories/:repoId/deploy', [
  authenticateUser,
  param('repoId').isInt().withMessage('Valid repository ID required'),
  body('branch').optional().isString(),
  body('environment').optional().isIn(['staging', 'production']),
  body('force').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { repoId } = req.params;
    const {
      branch = 'main',
      environment = 'production',
      force = false
    } = req.body;

    const userId = req.user.id;

    // TODO: Get repository info from database
    const repoFullName = 'user/repo'; // Should be fetched

    // Trigger deployment
    const deploymentData = await githubConnector.triggerAutoDeployment({
      repository: {
        id: repoId,
        fullName: repoFullName
      },
      branch: branch,
      commits: [],
      isManualTrigger: true,
      triggeredBy: userId,
      environment: environment,
      force: force
    });

    res.json({
      success: true,
      deployment: {
        id: deploymentData.id,
        repositoryId: repoId,
        branch: branch,
        environment: environment,
        status: deploymentData.status,
        startedAt: deploymentData.startedAt
      }
    });

  } catch (error) {
    console.error('Manual deployment error:', error);
    res.status(500).json({
      error: 'Deployment failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/github/deployments/:deploymentId - Get deployment status
 */
router.get('/deployments/:deploymentId', [
  authenticateUser,
  param('deploymentId').isUUID().withMessage('Valid deployment ID required')
], async (req, res) => {
  try {
    const { deploymentId } = req.params;

    // TODO: Get deployment from database
    // Mock data
    const deployment = {
      id: deploymentId,
      repositoryId: 123,
      repository: 'user/repo',
      branch: 'main',
      status: 'running', // pending, running, success, failed
      environment: 'production',
      progress: 60,
      steps: [
        {
          name: 'checkout',
          status: 'completed',
          duration: 5,
          completedAt: new Date(Date.now() - 300000).toISOString()
        },
        {
          name: 'build',
          status: 'running',
          startedAt: new Date(Date.now() - 180000).toISOString()
        },
        {
          name: 'deploy',
          status: 'pending'
        }
      ],
      startedAt: new Date(Date.now() - 300000).toISOString(),
      estimatedCompletion: new Date(Date.now() + 120000).toISOString()
    };

    res.json({
      success: true,
      deployment: deployment
    });

  } catch (error) {
    console.error('Get deployment error:', error);
    res.status(500).json({
      error: 'Failed to get deployment',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/github/security/:repoId - Get security report
 */
router.get('/security/:repoId', [
  authenticateUser,
  param('repoId').isInt().withMessage('Valid repository ID required')
], async (req, res) => {
  try {
    const { repoId } = req.params;
    const userId = req.user.id;

    // TODO: Get repository info and access token
    const repoFullName = 'user/repo';
    const accessToken = 'github_access_token';

    const securityAlerts = await githubConnector.getSecurityAlerts(accessToken, repoFullName);

    const report = {
      repositoryId: repoId,
      repository: repoFullName,
      summary: {
        total: securityAlerts.length,
        critical: securityAlerts.filter(alert => alert.security.severity === 'critical').length,
        high: securityAlerts.filter(alert => alert.security.severity === 'high').length,
        medium: securityAlerts.filter(alert => alert.security.severity === 'medium').length,
        low: securityAlerts.filter(alert => alert.security.severity === 'low').length,
        patchable: securityAlerts.filter(alert => alert.fixAvailable).length
      },
      alerts: securityAlerts,
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Security report error:', error);
    res.status(500).json({
      error: 'Failed to generate security report',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/github/repositories/:repoId/issues - Create issue
 */
router.post('/repositories/:repoId/issues', [
  authenticateUser,
  param('repoId').isInt().withMessage('Valid repository ID required'),
  body('title').notEmpty().withMessage('Issue title required'),
  body('body').optional().isString(),
  body('labels').optional().isArray(),
  body('assignees').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { repoId } = req.params;
    const { title, body, labels, assignees } = req.body;

    // TODO: Get repository info and access token
    const repoFullName = 'user/repo';
    const accessToken = 'github_access_token';

    const issue = await githubConnector.createIssue(accessToken, repoFullName, {
      title,
      body,
      labels,
      assignees
    });

    res.json({
      success: true,
      issue: issue
    });

  } catch (error) {
    console.error('Create issue error:', error);
    res.status(500).json({
      error: 'Failed to create issue',
      message: error.message
    });
  }
});

module.exports = router;