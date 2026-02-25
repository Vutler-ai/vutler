/**
 * Vutler GitHub Connector Service
 * OAuth2 integration, webhook handling, repository monitoring
 * Auto-deployment and security alert management
 */

const axios = require('axios');
const crypto = require('crypto');
const { CryptoService } = require('./crypto');

class GitHubConnector {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.GITHUB_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GITHUB_CLIENT_SECRET;
    this.webhookSecret = config.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET;
    this.redirectUri = config.redirectUri || 'https://vutler.starboxgroup.com/auth/github/callback';
    
    this.cryptoService = new CryptoService();
    this.baseApiUrl = 'https://api.github.com';
    
    // Supported webhook events
    this.supportedEvents = [
      'push',
      'pull_request', 
      'issues',
      'release',
      'repository',
      'deployment_status',
      'security_advisory',
      'dependabot_alert'
    ];
    
    // OAuth scopes
    this.scopes = [
      'repo',
      'read:org',
      'admin:repo_hook',
      'security_events'
    ];
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state: state
    });
    
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code
      }, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(response.data.error_description || 'OAuth exchange failed');
      }

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        scope: response.data.scope
      };

    } catch (error) {
      throw new Error(`OAuth token exchange failed: ${error.message}`);
    }
  }

  /**
   * Validate GitHub access token
   */
  async validateToken(accessToken) {
    try {
      const response = await axios.get(`${this.baseApiUrl}/user`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return {
        valid: true,
        user: {
          id: response.data.id,
          login: response.data.login,
          name: response.data.name,
          email: response.data.email,
          avatar: response.data.avatar_url
        },
        scopes: response.headers['x-oauth-scopes']?.split(', ') || []
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get user repositories
   */
  async getUserRepositories(accessToken, options = {}) {
    try {
      const params = new URLSearchParams({
        visibility: options.visibility || 'all',
        sort: options.sort || 'updated',
        direction: options.direction || 'desc',
        per_page: options.perPage || 50,
        page: options.page || 1
      });

      const response = await axios.get(`${this.baseApiUrl}/user/repos?${params}`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.data.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        language: repo.language,
        languages: null, // Will be fetched separately if needed
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        openIssuesCount: repo.open_issues_count,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        permissions: {
          admin: repo.permissions?.admin || false,
          push: repo.permissions?.push || false,
          pull: repo.permissions?.pull || false
        }
      }));

    } catch (error) {
      throw new Error(`Failed to fetch repositories: ${error.message}`);
    }
  }

  /**
   * Setup webhook for a repository
   */
  async setupWebhook(accessToken, repoFullName, webhookUrl) {
    try {
      const response = await axios.post(
        `${this.baseApiUrl}/repos/${repoFullName}/hooks`,
        {
          name: 'web',
          active: true,
          events: this.supportedEvents,
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: this.webhookSecret,
            insecure_ssl: '0'
          }
        },
        {
          headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      return {
        id: response.data.id,
        url: response.data.url,
        events: response.data.events,
        active: response.data.active,
        config: response.data.config
      };

    } catch (error) {
      throw new Error(`Failed to setup webhook: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!signature || !this.webhookSecret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    const actualSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(actualSignature, 'hex')
    );
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event, payload) {
    try {
      switch (event) {
        case 'push':
          return await this.handlePushEvent(payload);
        case 'pull_request':
          return await this.handlePullRequestEvent(payload);
        case 'issues':
          return await this.handleIssueEvent(payload);
        case 'release':
          return await this.handleReleaseEvent(payload);
        case 'security_advisory':
        case 'dependabot_alert':
          return await this.handleSecurityEvent(payload);
        case 'deployment_status':
          return await this.handleDeploymentEvent(payload);
        default:
          console.log(`Unhandled webhook event: ${event}`);
          return { processed: false, event };
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Handle push events
   */
  async handlePushEvent(payload) {
    const repo = payload.repository;
    const pusher = payload.pusher;
    const commits = payload.commits || [];
    const ref = payload.ref;
    const branch = ref.replace('refs/heads/', '');

    // Check if this is a push to main/master
    const isMainBranch = ['main', 'master'].includes(branch);

    const eventData = {
      type: 'push',
      repository: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private
      },
      branch: branch,
      isMainBranch: isMainBranch,
      pusher: {
        name: pusher.name,
        email: pusher.email
      },
      commits: commits.map(commit => ({
        id: commit.id,
        message: commit.message,
        author: commit.author,
        url: commit.url,
        timestamp: commit.timestamp
      })),
      compareUrl: payload.compare,
      timestamp: new Date().toISOString()
    };

    // Store event in database
    await this.storeGitHubEvent(eventData);

    // Check for auto-deployment if main branch
    if (isMainBranch) {
      await this.triggerAutoDeployment(eventData);
    }

    // Notify agents and chat
    await this.notifyPushEvent(eventData);

    return {
      processed: true,
      event: 'push',
      data: eventData
    };
  }

  /**
   * Handle pull request events
   */
  async handlePullRequestEvent(payload) {
    const pr = payload.pull_request;
    const action = payload.action;

    const eventData = {
      type: 'pull_request',
      action: action,
      repository: {
        id: payload.repository.id,
        fullName: payload.repository.full_name
      },
      pullRequest: {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        htmlUrl: pr.html_url,
        author: {
          login: pr.user.login,
          avatar: pr.user.avatar_url
        },
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at
      },
      timestamp: new Date().toISOString()
    };

    await this.storeGitHubEvent(eventData);
    await this.notifyPullRequestEvent(eventData);

    return {
      processed: true,
      event: 'pull_request',
      data: eventData
    };
  }

  /**
   * Handle security events
   */
  async handleSecurityEvent(payload) {
    const advisory = payload.security_advisory || payload.alert;
    const repository = payload.repository;

    const eventData = {
      type: 'security',
      repository: {
        id: repository.id,
        fullName: repository.full_name
      },
      severity: advisory.severity,
      summary: advisory.summary,
      description: advisory.description,
      package: advisory.vulnerabilities?.[0]?.package || {},
      cvssScore: advisory.cvss?.score,
      publishedAt: advisory.published_at,
      timestamp: new Date().toISOString()
    };

    await this.storeGitHubEvent(eventData);

    // High/Critical vulnerabilities trigger immediate notifications
    if (['high', 'critical'].includes(advisory.severity)) {
      await this.notifySecurityAlert(eventData);
    }

    return {
      processed: true,
      event: 'security',
      data: eventData
    };
  }

  /**
   * Trigger auto-deployment for repository
   */
  async triggerAutoDeployment(eventData) {
    // TODO: Check if auto-deployment is enabled for this repo
    // TODO: Execute deployment pipeline
    
    console.log('Auto-deployment triggered for:', eventData.repository.fullName);
    
    const deploymentData = {
      id: this.cryptoService.generateId(),
      repositoryId: eventData.repository.id,
      branch: eventData.branch,
      commits: eventData.commits,
      status: 'pending',
      startedAt: new Date().toISOString()
    };

    // Simulate deployment process
    await this.executeDeployment(deploymentData);
    
    return deploymentData;
  }

  /**
   * Execute deployment pipeline
   */
  async executeDeployment(deploymentData) {
    try {
      // Deployment steps simulation
      const steps = [
        { name: 'checkout', duration: 5000 },
        { name: 'install', duration: 15000 },
        { name: 'build', duration: 30000 },
        { name: 'test', duration: 20000 },
        { name: 'deploy', duration: 10000 }
      ];

      for (const step of steps) {
        console.log(`Deployment step: ${step.name}`);
        await new Promise(resolve => setTimeout(resolve, step.duration));
        
        // Update deployment status
        await this.updateDeploymentStatus(deploymentData.id, {
          currentStep: step.name,
          status: 'running'
        });
      }

      // Mark as completed
      await this.updateDeploymentStatus(deploymentData.id, {
        status: 'success',
        completedAt: new Date().toISOString()
      });

      console.log('Deployment completed successfully');

    } catch (error) {
      await this.updateDeploymentStatus(deploymentData.id, {
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Get repository languages
   */
  async getRepositoryLanguages(accessToken, repoFullName) {
    try {
      const response = await axios.get(`${this.baseApiUrl}/repos/${repoFullName}/languages`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch repository languages: ${error.message}`);
    }
  }

  /**
   * Create GitHub issue
   */
  async createIssue(accessToken, repoFullName, issueData) {
    try {
      const response = await axios.post(
        `${this.baseApiUrl}/repos/${repoFullName}/issues`,
        {
          title: issueData.title,
          body: issueData.body,
          labels: issueData.labels || [],
          assignees: issueData.assignees || []
        },
        {
          headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      return {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        body: response.data.body,
        htmlUrl: response.data.html_url,
        state: response.data.state,
        createdAt: response.data.created_at
      };

    } catch (error) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  /**
   * Get security vulnerabilities for repository
   */
  async getSecurityAlerts(accessToken, repoFullName) {
    try {
      const response = await axios.get(`${this.baseApiUrl}/repos/${repoFullName}/dependabot/alerts`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.data.map(alert => ({
        number: alert.number,
        state: alert.state,
        dependency: {
          package: alert.dependency?.package?.name,
          manifest: alert.dependency?.manifest_path,
          scope: alert.dependency?.scope
        },
        security: {
          severity: alert.security_advisory?.severity,
          summary: alert.security_advisory?.summary,
          description: alert.security_advisory?.description,
          cvssScore: alert.security_advisory?.cvss?.score
        },
        createdAt: alert.created_at,
        updatedAt: alert.updated_at,
        dismissedAt: alert.dismissed_at,
        fixAvailable: alert.security_vulnerability?.first_patched_version !== null
      }));

    } catch (error) {
      throw new Error(`Failed to fetch security alerts: ${error.message}`);
    }
  }

  // Notification methods (to be implemented with WebSocket/Chat integration)

  async notifyPushEvent(eventData) {
    console.log('Push notification:', {
      repo: eventData.repository.fullName,
      branch: eventData.branch,
      commits: eventData.commits.length
    });
  }

  async notifyPullRequestEvent(eventData) {
    console.log('PR notification:', {
      repo: eventData.repository.fullName,
      pr: eventData.pullRequest.number,
      action: eventData.action
    });
  }

  async notifySecurityAlert(eventData) {
    console.log('Security alert:', {
      repo: eventData.repository.fullName,
      severity: eventData.severity,
      package: eventData.package?.name
    });
  }

  // Database methods (to be implemented with PostgreSQL)

  async storeGitHubEvent(eventData) {
    // TODO: Store in PostgreSQL
    console.log('Storing GitHub event:', eventData.type, eventData.repository?.fullName);
  }

  async updateDeploymentStatus(deploymentId, status) {
    // TODO: Update in PostgreSQL
    console.log('Deployment status update:', deploymentId, status);
  }
}

module.exports = { GitHubConnector };