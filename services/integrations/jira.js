'use strict';

/**
 * Jira Cloud REST API v3 Adapter
 *
 * Auth: Basic Auth (email:api_token encoded as base64)
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

const https = require('https');

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Parse Jira error response into a readable string.
 * Jira returns errors in multiple shapes depending on the endpoint.
 */
function parseJiraError(body, statusCode) {
  if (!body) return `HTTP ${statusCode}`;

  let parsed;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch (_) { return `HTTP ${statusCode}: ${body.slice(0, 200)}`; }
  } else {
    parsed = body;
  }

  // Jira v3 error shapes:
  // { errorMessages: [...], errors: { field: msg } }
  // { message: "..." }
  const messages = [];

  if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length > 0) {
    messages.push(...parsed.errorMessages);
  }
  if (parsed.errors && typeof parsed.errors === 'object') {
    for (const [field, msg] of Object.entries(parsed.errors)) {
      messages.push(`${field}: ${msg}`);
    }
  }
  if (parsed.message) {
    messages.push(parsed.message);
  }

  return messages.length > 0 ? messages.join('; ') : `HTTP ${statusCode}`;
}

class JiraAdapter {
  /**
   * @param {string} baseUrl  - e.g. "https://acme.atlassian.net"
   * @param {string} email    - Atlassian account email
   * @param {string} apiToken - Jira API token (not account password)
   */
  constructor(baseUrl, email, apiToken) {
    if (!baseUrl || !email || !apiToken) {
      throw new Error('[JiraAdapter] baseUrl, email and apiToken are required');
    }
    // Normalise base URL: strip trailing slash
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  /**
   * Create a new issue.
   * @param {object} opts
   * @param {string} opts.projectKey
   * @param {string} opts.summary
   * @param {string} [opts.description]       - plain text (converted to ADF paragraph)
   * @param {string} [opts.issueType='Task']
   * @param {string} [opts.priority]          - e.g. "High", "Medium"
   * @param {string} [opts.assignee]          - Jira accountId
   * @param {string[]} [opts.labels]
   */
  async createIssue({ projectKey, summary, description, issueType = 'Task', priority, assignee, labels }) {
    if (!projectKey || !summary) throw new Error('[JiraAdapter] projectKey and summary are required');

    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };

    if (description) {
      // Jira Cloud v3 uses Atlassian Document Format (ADF) for descriptions
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      };
    }

    if (priority) fields.priority = { name: priority };
    if (assignee) fields.assignee = { accountId: assignee };
    if (labels && labels.length > 0) fields.labels = labels;

    return this._request('POST', '/rest/api/3/issue', { fields });
  }

  /**
   * Get issue details.
   * @param {string} issueKey - e.g. "PROJ-123"
   */
  async getIssue(issueKey) {
    if (!issueKey) throw new Error('[JiraAdapter] issueKey is required');
    return this._request('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`);
  }

  /**
   * Update issue fields.
   * @param {string} issueKey
   * @param {object} fields - Jira fields object (same shape as createIssue.fields)
   */
  async updateIssue(issueKey, fields) {
    if (!issueKey) throw new Error('[JiraAdapter] issueKey is required');
    // Jira v3 PUT returns 204 No Content on success
    return this._request('PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields });
  }

  /**
   * Transition an issue to a new status.
   * @param {string} issueKey
   * @param {string} transitionId - numeric string from getTransitions()
   */
  async transitionIssue(issueKey, transitionId) {
    if (!issueKey || !transitionId) throw new Error('[JiraAdapter] issueKey and transitionId are required');
    return this._request('POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
      transition: { id: String(transitionId) },
    });
  }

  /**
   * Add a plain-text comment to an issue.
   * @param {string} issueKey
   * @param {string} body - comment text
   */
  async addComment(issueKey, body) {
    if (!issueKey || !body) throw new Error('[JiraAdapter] issueKey and body are required');
    return this._request('POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: body }] },
        ],
      },
    });
  }

  /**
   * Assign issue to a user.
   * @param {string} issueKey
   * @param {string|null} accountId - null to unassign
   */
  async assignIssue(issueKey, accountId) {
    if (!issueKey) throw new Error('[JiraAdapter] issueKey is required');
    // PUT /rest/api/3/issue/{key}/assignee returns 204
    return this._request('PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, {
      accountId: accountId || null,
    });
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  /**
   * Search issues using JQL.
   * @param {string} jql
   * @param {number} [maxResults=50]
   */
  async searchIssues(jql, maxResults = 50) {
    if (!jql) throw new Error('[JiraAdapter] jql is required');
    return this._request('POST', '/rest/api/3/issue/search', {
      jql,
      maxResults: Math.min(maxResults, 100),
      fields: ['summary', 'status', 'assignee', 'priority', 'issuetype', 'project', 'created', 'updated', 'labels'],
    });
  }

  // ─── Projects ──────────────────────────────────────────────────────────────

  /** List all projects accessible to the API token owner. */
  async listProjects() {
    return this._request('GET', '/rest/api/3/project');
  }

  /**
   * Get project details.
   * @param {string} projectKey
   */
  async getProject(projectKey) {
    if (!projectKey) throw new Error('[JiraAdapter] projectKey is required');
    return this._request('GET', `/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  }

  // ─── Metadata ──────────────────────────────────────────────────────────────

  /**
   * Get available transitions for an issue (i.e. valid next statuses).
   * @param {string} issueKey
   */
  async getTransitions(issueKey) {
    if (!issueKey) throw new Error('[JiraAdapter] issueKey is required');
    return this._request('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
  }

  /**
   * Get issue types available in a project.
   * @param {string} projectKey
   */
  async getIssueTypes(projectKey) {
    if (!projectKey) throw new Error('[JiraAdapter] projectKey is required');
    const project = await this.getProject(projectKey);
    return project.issueTypes || [];
  }

  /** Get all priority levels defined in the Jira instance. */
  async getPriorities() {
    return this._request('GET', '/rest/api/3/priority');
  }

  // ─── HTTP helper ───────────────────────────────────────────────────────────

  /**
   * Make an authenticated request to the Jira Cloud REST API v3.
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
   * @param {string} path   - starts with /rest/api/3/...
   * @param {object} [body] - JSON body (omit for GET/DELETE)
   * @returns {Promise<any>} Parsed JSON response (or null for 204 No Content)
   */
  async _request(method, path, body) {
    const url = new URL(this._baseUrl + path);
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${this._auth}`,
        Accept: 'application/json',
        'User-Agent': 'Vutler/1.0',
        ...(bodyStr ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        } : {}),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          // 204 No Content — success with no body
          if (res.statusCode === 204) return resolve(null);

          let parsed;
          try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }

          if (res.statusCode >= 400) {
            const msg = parseJiraError(parsed, res.statusCode);
            const err = new Error(`Jira API error (${res.statusCode}): ${msg}`);
            err.statusCode = res.statusCode;
            err.jiraResponse = parsed;
            return reject(err);
          }

          resolve(parsed);
        });
      });

      req.on('error', reject);

      // Enforce timeout
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error(`[JiraAdapter] Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}

module.exports = { JiraAdapter };
