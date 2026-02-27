// Brave Search API key default
process.env.BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY || "BSAkBsniVtGPpCAWUQ4yOyB_1pxY84z";

/**
 * Sprint 7.5 — Agent Tools API
 * Sandboxed web-search, file-read, shell-exec with rate limiting.
 */

const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ─── Rate Limiting (10 calls/min per agent) ─────────────────────────────────

const rateLimits = new Map(); // agent_id -> { count, resetAt }

function checkRateLimit(agentId) {
  const now = Date.now();
  let entry = rateLimits.get(agentId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    rateLimits.set(agentId, entry);
  }
  entry.count++;
  if (entry.count > 10) {
    return false;
  }
  return true;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimits) {
    if (now > val.resetAt) rateLimits.delete(key);
  }
}, 300_000);

// ─── Sandbox Config ─────────────────────────────────────────────────────────

const ALLOWED_COMMANDS = ['ls', 'cat', 'head', 'tail', 'grep', 'wc', 'echo', 'date', 'curl'];
const AGENT_WORKSPACE_ROOT = process.env.AGENT_WORKSPACE || '/home/ubuntu/vutler/agent-workspaces';

// ─── POST /api/tools/web-search ─────────────────────────────────────────────

router.post('/web-search', async (req, res) => {
  try {
    const { agent_id, query, limit = 5 } = req.body;
    if (!agent_id || !query) {
      return res.status(400).json({ success: false, error: 'agent_id and query are required' });
    }

    if (!checkRateLimit(agent_id)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded (10/min)' });
    }

    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
    let results = [];

    if (braveApiKey) {
      // Use Brave Search API
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(parseInt(limit), 10)}`;
      const response = await fetch(url, {
        headers: { 'X-Subscription-Token': braveApiKey, 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        results = (data.web?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          description: r.description,
        }));
      } else {
        return res.status(502).json({ success: false, error: `Brave API error: ${response.status}` });
      }
    } else {
      // Fallback: return a message that no search API is configured
      return res.status(503).json({
        success: false,
        error: 'No search API configured. Set BRAVE_SEARCH_API_KEY.',
      });
    }

    res.json({ success: true, query, results, count: results.length });
  } catch (err) {
    console.error('[TOOLS] web-search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tools/file-read ──────────────────────────────────────────────

router.post('/file-read', async (req, res) => {
  try {
    const { agent_id, file_path: filePath } = req.body;
    if (!agent_id || !filePath) {
      return res.status(400).json({ success: false, error: 'agent_id and file_path are required' });
    }

    if (!checkRateLimit(agent_id)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded (10/min)' });
    }

    // Sandbox: resolve and validate path
    const workspaceDir = path.join(AGENT_WORKSPACE_ROOT, agent_id);
    const resolved = path.resolve(workspaceDir, filePath);

    if (!resolved.startsWith(path.resolve(workspaceDir))) {
      return res.status(403).json({ success: false, error: 'Path traversal detected. Access denied.' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Path is a directory, not a file' });
    }
    if (stat.size > 1_000_000) {
      return res.status(413).json({ success: false, error: 'File too large (>1MB)' });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    res.json({
      success: true,
      file_path: filePath,
      size: stat.size,
      content,
    });
  } catch (err) {
    console.error('[TOOLS] file-read error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/tools/shell-exec ─────────────────────────────────────────────

router.post('/shell-exec', async (req, res) => {
  try {
    const { agent_id, command } = req.body;
    if (!agent_id || !command) {
      return res.status(400).json({ success: false, error: 'agent_id and command are required' });
    }

    if (!checkRateLimit(agent_id)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded (10/min)' });
    }

    // Parse the base command (first token)
    const tokens = command.trim().split(/\s+/);
    const baseCmd = path.basename(tokens[0]);

    if (!ALLOWED_COMMANDS.includes(baseCmd)) {
      return res.status(403).json({
        success: false,
        error: `Command '${baseCmd}' not allowed. Allowed: ${ALLOWED_COMMANDS.join(', ')}`,
      });
    }

    // Block dangerous patterns
    const dangerous = /[;&|`$(){}]|sudo|rm\s|rm$|>\s*\/|>>/;
    if (dangerous.test(command)) {
      return res.status(403).json({ success: false, error: 'Dangerous command pattern detected' });
    }

    // Execute with timeout
    const workspaceDir = path.join(AGENT_WORKSPACE_ROOT, agent_id);
    const cwd = fs.existsSync(workspaceDir) ? workspaceDir : '/tmp';

    let output;
    try {
      output = execSync(command, {
        timeout: 30_000,
        maxBuffer: 1_000_000,
        cwd,
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp' },
      }).toString();
    } catch (execErr) {
      return res.json({
        success: true,
        command,
        exit_code: execErr.status || 1,
        stdout: (execErr.stdout || '').toString(),
        stderr: (execErr.stderr || '').toString(),
      });
    }

    res.json({
      success: true,
      command,
      exit_code: 0,
      stdout: output,
      stderr: '',
    });
  } catch (err) {
    console.error('[TOOLS] shell-exec error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.ALLOWED_COMMANDS = ALLOWED_COMMANDS;
module.exports._checkRateLimit = checkRateLimit;
module.exports._rateLimits = rateLimits;
