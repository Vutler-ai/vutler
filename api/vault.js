'use strict';

/**
 * Vault API — secure credential storage endpoints
 *
 * Routes:
 *   GET    /api/v1/vault                  — list secrets (metadata only)
 *   POST   /api/v1/vault                  — store a secret manually
 *   GET    /api/v1/vault/:id              — get secret detail (masked)
 *   DELETE /api/v1/vault/:id              — delete a secret
 *   PATCH  /api/v1/vault/:id             — partial update
 *   POST   /api/v1/vault/extract          — extract credentials from text (preview)
 *   POST   /api/v1/vault/extract/confirm  — confirm & store extracted credentials
 *   POST   /api/v1/vault/resolve          — resolve a secret (decrypted, API-key only)
 *
 * Security model:
 *   - All routes require req.workspaceId (set by upstream auth middleware).
 *   - /vault/resolve is restricted to machine API keys (x-vault-api-key header).
 *   - Decrypted secrets are NEVER logged.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const {
  ensureVaultTable,
  storeSecret,
  getSecret,
  findSecrets,
  listSecrets,
  deleteSecret,
  updateSecret,
  extractCredentialsFromText,
} = require('../services/vault');
const { runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function workspaceId(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

/**
 * Middleware: verify the x-vault-api-key header for machine-to-machine calls.
 * Compares against VAULT_MACHINE_KEY env var (raw value, no hashing needed —
 * it never leaves the server and is compared with timingSafeEqual).
 */
function requireVaultApiKey(req, res, next) {
  const provided = req.headers['x-vault-api-key'];
  const expected = process.env.VAULT_MACHINE_KEY;

  if (!expected) {
    // Fallback: accept regular user auth (req.workspaceId already set)
    return next();
  }

  if (!provided) {
    return res.status(401).json({ success: false, error: 'x-vault-api-key header required for secret resolution' });
  }

  // Constant-time comparison
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ success: false, error: 'Invalid vault API key' });
  }

  next();
}

// ── Ensure table exists at module load ───────────────────────────────────────

if (runtimeSchemaMutationsAllowed()) {
  ensureVaultTable().catch(err =>
    console.error('[Vault] Failed to ensure table on startup:', err.message),
  );
}

// ── GET /api/v1/vault — list all secrets (masked) ────────────────────────────

router.get('/vault', async (req, res) => {
  try {
    const { tags, type, q } = req.query;

    let secrets;
    if (tags || type || q) {
      secrets = await findSecrets(workspaceId(req), {
        tags: tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : undefined,
        type: type ? String(type) : undefined,
        query: q ? String(q) : undefined,
      });
    } else {
      secrets = await listSecrets(workspaceId(req));
    }

    res.json({ success: true, data: secrets, total: secrets.length });
  } catch (err) {
    console.error('[Vault] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/v1/vault — store a secret manually ─────────────────────────────

router.post('/vault', async (req, res) => {
  try {
    const {
      label, type, host, port, username, secret,
      tags, notes, sourceFile, extractedBy, expiresAt,
    } = req.body || {};

    if (!label)  return res.status(400).json({ success: false, error: 'label is required' });
    if (!type)   return res.status(400).json({ success: false, error: 'type is required' });
    if (!secret) return res.status(400).json({ success: false, error: 'secret is required' });

    const stored = await storeSecret({
      workspaceId: workspaceId(req),
      label, type, host, port, username, secret,
      tags, notes, sourceFile, extractedBy, expiresAt,
    });

    res.status(201).json({ success: true, data: stored });
  } catch (err) {
    console.error('[Vault] Store error:', err.message);
    const status = err.message.includes('Invalid vault secret type') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── GET /api/v1/vault/:id — detail (masked) ───────────────────────────────────

router.get('/vault/:id', async (req, res) => {
  try {
    // Return metadata only (masked) — use /resolve for decrypted access
    const secrets = await findSecrets(workspaceId(req), {});
    const found = secrets.find(s => s.id === req.params.id);

    if (!found) {
      return res.status(404).json({ success: false, error: 'Secret not found' });
    }

    res.json({ success: true, data: found });
  } catch (err) {
    console.error('[Vault] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/v1/vault/:id ──────────────────────────────────────────────────

router.delete('/vault/:id', async (req, res) => {
  try {
    const deleted = await deleteSecret(workspaceId(req), req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Secret not found' });
    }

    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    console.error('[Vault] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PATCH /api/v1/vault/:id — partial update ─────────────────────────────────

router.patch('/vault/:id', async (req, res) => {
  try {
    const updates = req.body || {};

    const updated = await updateSecret(workspaceId(req), req.params.id, updates);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Secret not found' });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Vault] Update error:', err.message);
    const status = ['No valid fields', 'Invalid vault secret type'].some(m => err.message.includes(m)) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── POST /api/v1/vault/extract — extract credentials from text (preview) ─────

router.post('/vault/extract', async (req, res) => {
  try {
    const { text, agentId } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    // Build LLM config from workspace context
    const pg = req.app?.locals?.pg;
    const llmConfig = {
      db: pg,
      workspaceId: workspaceId(req),
    };

    const extracted = await extractCredentialsFromText(
      String(text),
      agentId ? String(agentId) : null,
      llmConfig,
    );

    res.json({
      success: true,
      data: {
        credentials: extracted,
        count: extracted.length,
        message: extracted.length === 0
          ? 'No credentials found in the provided text'
          : `Found ${extracted.length} credential(s). Review and confirm to store.`,
      },
    });
  } catch (err) {
    console.error('[Vault] Extract error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/v1/vault/extract/confirm — store confirmed credentials ──────────

router.post('/vault/extract/confirm', async (req, res) => {
  try {
    const { credentials, sourceFile, agentId } = req.body || {};

    if (!Array.isArray(credentials) || credentials.length === 0) {
      return res.status(400).json({ success: false, error: 'credentials array is required and must not be empty' });
    }

    const wsId = workspaceId(req);
    const stored = [];
    const errors = [];

    for (let i = 0; i < credentials.length; i++) {
      const cred = credentials[i];
      try {
        if (!cred.label)  throw new Error('label is required');
        if (!cred.type)   throw new Error('type is required');
        if (!cred.secret) throw new Error('secret is required');

        const result = await storeSecret({
          workspaceId: wsId,
          label:       cred.label,
          type:        cred.type,
          host:        cred.host        || null,
          port:        cred.port        || null,
          username:    cred.username    || null,
          secret:      cred.secret,
          tags:        cred.tags        || [],
          notes:       cred.notes       || null,
          sourceFile:  sourceFile       || cred.sourceFile || null,
          extractedBy: agentId         || cred.extractedBy || null,
          expiresAt:   cred.expiresAt   || null,
        });
        stored.push(result);
      } catch (credErr) {
        errors.push({ index: i, label: cred.label || `[${i}]`, error: credErr.message });
      }
    }

    const allOk = errors.length === 0;
    res.status(allOk ? 201 : 207).json({
      success: allOk,
      data: {
        stored,
        errors,
        summary: `${stored.length} stored, ${errors.length} failed`,
      },
    });
  } catch (err) {
    console.error('[Vault] Confirm error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/v1/vault/resolve — resolve & decrypt (machine API key only) ────

router.post('/vault/resolve', requireVaultApiKey, async (req, res) => {
  try {
    const { label, id, tags, type } = req.body || {};

    const wsId = workspaceId(req);

    // If label or id is provided, use direct lookup
    if (label || id) {
      const found = await getSecret(wsId, id || label);

      if (!found) {
        return res.status(404).json({ success: false, error: 'Secret not found' });
      }

      // Audit log (secret value NEVER logged)
      console.log('[Vault][resolve]', JSON.stringify({
        workspace_id: wsId,
        id: found.id,
        label: found.label,
        type: found.type,
        resolved_by: req.agent?.id || 'machine',
      }));

      return res.json({ success: true, data: found });
    }

    // Fallback: search by tags/type and return first match (decrypted)
    if (tags || type) {
      const candidates = await findSecrets(wsId, {
        tags: tags ? (Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim())) : undefined,
        type: type ? String(type) : undefined,
      });

      if (candidates.length === 0) {
        return res.status(404).json({ success: false, error: 'No matching secret found' });
      }

      // Decrypt the first match
      const first = await getSecret(wsId, candidates[0].id);

      console.log('[Vault][resolve]', JSON.stringify({
        workspace_id: wsId,
        id: first?.id,
        label: first?.label,
        type: first?.type,
        resolved_by: req.agent?.id || 'machine',
        query: { tags, type },
      }));

      return res.json({ success: true, data: first });
    }

    return res.status(400).json({
      success: false,
      error: 'Provide label, id, tags, or type to resolve a secret',
    });
  } catch (err) {
    // Do NOT include any secret value in error messages
    console.error('[Vault] Resolve error:', err.message);
    res.status(500).json({ success: false, error: 'Secret resolution failed' });
  }
});

module.exports = router;
