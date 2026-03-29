'use strict';

const express = require('express');
const router = express.Router();
const http = require('http');
const llmRouter = require('../services/llmRouter');
const pool = require('../lib/vaultbrix');

const POSTAL_HOST = process.env.POSTAL_HOST || 'mail.vutler.ai';
const POSTAL_ENDPOINT = process.env.POSTAL_ENDPOINT || 'http://localhost:8082';
const POSTAL_API_KEY = process.env.POSTAL_API_KEY || '';

const AGENTS = {
  'andrea@vutler.ai': { name: 'Andrea', color: '#8B5CF6' },
  'nora@vutler.ai':   { name: 'Nora',   color: '#EC4899' },
  'victor@vutler.ai': { name: 'Victor', color: '#F59E0B' },
  'mike@vutler.ai':   { name: 'Mike',   color: '#10B981' },
  'max@vutler.ai':    { name: 'Max',    color: '#3B82F6' },
  'luna@vutler.ai':   { name: 'Luna',   color: '#06B6D4' },
  'jarvis@vutler.ai': { name: 'Jarvis', color: '#F97316' },
  'oscar@vutler.ai':  { name: 'Oscar',  color: '#A855F7' },
  'stephen@vutler.ai':{ name: 'Stephen',color: '#14B8A6' },
  'philip@vutler.ai': { name: 'Philip', color: '#EF4444' },
  'rex@vutler.ai':    { name: 'Rex',    color: '#84CC16' },
  'marcus@vutler.ai': { name: 'Marcus', color: '#6366F1' },
  'sentinel@vutler.ai':{ name: 'Sentinel',color: '#F43F5E' },
  'alex@vutler.ai':   { name: 'Alex',   color: '#0EA5E9' },
  'jarvis@starbox-group.com': { name: 'Jarvis', color: '#F97316' },
  'alex@starbox-group.com':   { name: 'Alex (Starbox)', color: '#0EA5E9' },
};

// Allowed sending domains in Postal
const ALLOWED_DOMAINS = ['vutler.ai', 'starbox-group.com'];

const AI_DISCLAIMER = '\n\n---\nThis email was drafted by AI ([AGENT]) and sent automatically.';

// In-memory draft store
const drafts = new Map();
const autoApproval = new Map(); // fallback when DB unavailable
if (!global._mailAdminNotifications) global._mailAdminNotifications = [];

async function getAgentConfigByEmail(agentEmail) {
  const email = (agentEmail || '').toLowerCase();
  try {
    const result = await pool.query(
      `SELECT email, name, COALESCE(auto_approve_email, false) AS auto_approve_email
         FROM tenant_vutler.agents
        WHERE lower(email) = $1
        LIMIT 1`,
      [email]
    );
    if (result.rows.length > 0) return result.rows[0];
  } catch (err) {
    console.warn('[Mail] getAgentConfigByEmail DB fallback:', err.message);
  }
  if (AGENTS[email]) return { email, name: AGENTS[email].name, auto_approve_email: (autoApproval.get(email) || false) };
  return null;
}

function applyAIDisclaimer(agentName, plainBody, htmlBody) {
  const plain = (plainBody || '') + AI_DISCLAIMER.replace('[AGENT]', agentName || 'Agent');
  const htmlDisclaimer = `<hr><p style="font-size:12px;color:#6b7280;">This email was drafted by AI (${agentName || 'Agent'}) and sent automatically.</p>`;
  return { plain_body: plain, html_body: (htmlBody || '') + htmlDisclaimer };
}

function notifyAdminDraftRequired(draft) {
  global._mailAdminNotifications.push({
    id: Date.now(),
    type: 'mail_draft_approval_required',
    title: 'Email draft pending approval',
    message: `${draft.agentName} drafted an email to ${draft.to} (${draft.subject})`,
    draftId: draft.messageId,
    createdAt: new Date().toISOString(),
  });
}


// ── Ensure DB table exists ──
setTimeout(async () => {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='email_messages'`
    );
    if (check.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tenant_vutler.email_messages (
          id SERIAL PRIMARY KEY,
          postal_id INTEGER,
          message_id TEXT,
          token TEXT,
          rcpt_to TEXT,
          mail_from TEXT,
          subject TEXT,
          plain_body TEXT,
          html_body TEXT,
          direction TEXT DEFAULT 'incoming',
          processed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('[Mail] email_messages table ensured');
    }
  } catch (err) {
    console.warn('[Mail] email_messages table check warning (table may already exist):', err.message);
  }
}, 5000);

function postalRequest(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(POSTAL_ENDPOINT + path);
    const postData = JSON.stringify(body || {});
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Host': POSTAL_HOST,
        'X-Server-API-Key': POSTAL_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Invalid JSON from Postal')); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── LLM draft generation ──
async function generateLLMDraft(agent, email) {
  try {
    const agentObj = {
      model: 'gpt-5.4',
      provider: 'openai',
      system_prompt: `You are ${agent.name}, a professional AI assistant at Vutler. Draft a helpful email response. Be concise and professional. Always sign with your name.`,
      temperature: 0.7,
      max_tokens: 1024,
    };
    const messages = [
      {
        role: 'user',
        content: `Reply to this email:\n\nFrom: ${email.mail_from}\nSubject: ${email.subject}\nBody: ${email.plain_body || '(empty)'}\n\nDraft a professional response.`
      }
    ];
    const result = await llmRouter.chat(agentObj, messages);
    return result.content || '';
  } catch (err) {
    console.error('[Mail] LLM draft generation failed:', err.message);
    // Fallback to template
    return `Hi,\n\nThank you for your email. I'm ${agent.name}, and I'll be handling this for you.\n\nBest regards,\n${agent.name}\nVutler AI`;
  }
}

// GET /api/v1/mail/inbox — list messages by iterating IDs
router.get('/inbox', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 25;
    const messages = [];
    let id = 1;
    let consecutive404 = 0;

    // Scan up to 500 IDs to find messages
    while (id <= 500 && consecutive404 < 10) {
      const r = await postalRequest('/api/v1/messages/message', { id, _expansions: true });
      if (r.status === 'success' && r.data) {
        const d = r.data;
        const details = d.details || {};
        messages.push({
          id: d.id,
          token: d.token,
          from: details.mail_from || '',
          to: details.rcpt_to || '',
          subject: details.subject || '(no subject)',
          timestamp: details.timestamp ? new Date(details.timestamp * 1000).toISOString() : null,
          direction: details.direction || 'unknown',
          size: details.size,
          bounce: details.bounce,
          plain_body: (d.plain_body || '').substring(0, 200),
          html_body: d.html_body ? true : false,
          status: d.status ? d.status.status : null,
          spam: d.inspection ? d.inspection.spam : false,
          agent: AGENTS[details.mail_from] || AGENTS[details.rcpt_to] || null,
        });
        consecutive404 = 0;
      } else {
        consecutive404++;
      }
      id++;
    }

    // Sort newest first
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const start = (page - 1) * perPage;
    const paged = messages.slice(start, start + perPage);

    res.json({ success: true, data: paged, meta: { total: messages.length, page, per_page: perPage } });
  } catch (err) {
    console.error('[Mail] inbox error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/mail/message/:id — single message with full body
router.get('/message/:id', async (req, res) => {
  try {
    const r = await postalRequest('/api/v1/messages/message', { id: parseInt(req.params.id), _expansions: true });
    if (r.status !== 'success') return res.status(404).json({ success: false, error: 'Message not found' });

    const d = r.data;
    const details = d.details || {};
    const draft = drafts.get(d.id);

    res.json({
      success: true,
      data: {
        id: d.id,
        token: d.token,
        from: details.mail_from || '',
        to: details.rcpt_to || '',
        subject: details.subject || '(no subject)',
        timestamp: details.timestamp ? new Date(details.timestamp * 1000).toISOString() : null,
        direction: details.direction,
        plain_body: d.plain_body || '',
        html_body: d.html_body || '',
        headers: d.headers || {},
        attachments: d.attachments || [],
        status: d.status,
        inspection: d.inspection,
        agent: AGENTS[details.mail_from] || AGENTS[details.rcpt_to] || null,
        draft: draft || null,
      }
    });
  } catch (err) {
    console.error('[Mail] message error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/mail/send — respects agent auto-approval toggle
router.post('/send', async (req, res) => {
  try {
    const { to, from, subject, plain_body, html_body } = req.body;
    if (!to || !subject) return res.status(400).json({ success: false, error: 'to and subject required' });

    const fromAddr = (from || 'noreply@vutler.ai').toLowerCase();
    const fromDomain = fromAddr.split('@')[1];
    if (!ALLOWED_DOMAINS.includes(fromDomain)) {
      return res.status(400).json({ success: false, error: `Domain ${fromDomain} is not configured in Postal. Allowed: ${ALLOWED_DOMAINS.join(', ')}` });
    }

    const agentCfg = await getAgentConfigByEmail(fromAddr);
    if (agentCfg && !agentCfg.auto_approve_email) {
      const draftId = Date.now();
      const draft = {
        messageId: draftId,
        from: fromAddr,
        to,
        subject,
        plain_body: plain_body || '',
        html_body: html_body || '',
        agentName: agentCfg.name || AGENTS[fromAddr]?.name || 'Agent',
        agentEmail: fromAddr,
        createdAt: new Date().toISOString(),
      };
      drafts.set(draftId, draft);
      notifyAdminDraftRequired(draft);
      return res.json({ success: true, data: { status: 'draft', draftId, adminNotified: true } });
    }

    let payload = { plain_body: plain_body || '', html_body: html_body || '' };
    if (agentCfg) {
      payload = applyAIDisclaimer(agentCfg.name || AGENTS[fromAddr]?.name || 'Agent', payload.plain_body, payload.html_body);
    }

    const r = await postalRequest('/api/v1/send/message', {
      to: [to],
      from: fromAddr,
      subject,
      plain_body: payload.plain_body,
      html_body: payload.html_body,
    });

    res.json({ success: true, data: { ...r.data, status: 'sent', disclaimerApplied: !!agentCfg } });
  } catch (err) {
    console.error('[Mail] send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/mail/draft/approve — approve and send agent draft
router.post('/draft/approve', async (req, res) => {
  try {
    const { messageId } = req.body;
    const draft = drafts.get(messageId);
    if (!draft) return res.status(404).json({ success: false, error: 'No draft found for this message' });

    const payload = applyAIDisclaimer(draft.agentName || AGENTS[draft.from]?.name || 'Agent', draft.plain_body || '', draft.html_body || '');
    const r = await postalRequest('/api/v1/send/message', {
      to: [draft.to],
      from: draft.from,
      subject: draft.subject,
      plain_body: payload.plain_body,
      html_body: payload.html_body,
    });

    drafts.delete(messageId);
    res.json({ success: true, data: r.data });
  } catch (err) {
    console.error('[Mail] draft/approve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/mail/draft/regenerate — regenerate draft via LLM
router.post('/draft/regenerate', async (req, res) => {
  try {
    const { messageId } = req.body;
    const draft = drafts.get(messageId);
    if (!draft) return res.status(404).json({ success: false, error: 'No draft found' });

    const agent = AGENTS[draft.agentEmail] || { name: draft.agentName || 'Agent' };
    const draftBody = await generateLLMDraft(agent, {
      mail_from: draft.to,
      subject: draft.subject.replace(/^Re:\s*/i, ''),
      plain_body: '(regeneration requested)',
    });
    draft.plain_body = draftBody;
    draft.updatedAt = new Date().toISOString();
    drafts.set(messageId, draft);

    res.json({ success: true, data: draft });
  } catch (err) {
    console.error('[Mail] draft/regenerate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/mail/assign — assign email to agent (with LLM draft)
router.post('/assign', async (req, res) => {
  const { messageId, agentEmail } = req.body;
  if (!messageId || !agentEmail) return res.status(400).json({ success: false, error: 'messageId and agentEmail required' });

  const agent = AGENTS[agentEmail];
  if (!agent) return res.status(400).json({ success: false, error: 'Unknown agent' });

  const r = await postalRequest('/api/v1/messages/message', { id: messageId, _expansions: true });
  if (r.status !== 'success') return res.status(404).json({ success: false, error: 'Message not found' });

  const details = r.data.details || {};
  const emailData = {
    mail_from: details.mail_from || details.rcpt_to,
    subject: details.subject || '',
    plain_body: r.data.plain_body || '',
  };

  // Generate LLM draft
  const draftBody = await generateLLMDraft(agent, emailData);

  const draft = {
    messageId,
    from: agentEmail,
    to: details.mail_from || details.rcpt_to,
    subject: 'Re: ' + (details.subject || ''),
    plain_body: draftBody,
    agentName: agent.name,
    agentEmail,
    createdAt: new Date().toISOString(),
  };
  drafts.set(messageId, draft);

  res.json({ success: true, data: { agent, draft } });
});


// POST /api/v1/mail/inbound-webhook - receive emails from Postal
router.post('/inbound-webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[Mail] Inbound webhook received:', JSON.stringify({
      rcpt_to: payload.rcpt_to, mail_from: payload.mail_from,
      subject: payload.subject, ts: new Date().toISOString()
    }));

    // Persist to DB
    const postalId = payload.id || null;
    const msgId = payload.message ? payload.message.id : null;
    const token = payload.message ? payload.message.token : null;
    try {
      await pool.query(
        `INSERT INTO tenant_vutler.email_messages (postal_id, message_id, token, rcpt_to, mail_from, subject, plain_body, html_body, direction)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'incoming')`,
        [postalId, msgId, token, payload.rcpt_to, payload.mail_from, payload.subject, payload.plain_body || '', payload.html_body || '']
      );
      console.log('[Mail] Inbound email persisted to DB');
    } catch (dbErr) {
      console.error('[Mail] DB persist failed:', dbErr.message);
    }

    // Also keep in-memory for backward compat
    if (!global._inboundEmails) global._inboundEmails = [];
    global._inboundEmails.push({
      id: payload.id || Date.now(),
      message_id: msgId,
      token,
      rcpt_to: payload.rcpt_to,
      mail_from: payload.mail_from,
      subject: payload.subject,
      plain_body: payload.plain_body || '',
      html_body: payload.html_body || '',
      timestamp: new Date().toISOString(),
      processed: false,
    });

    const rcpt = (payload.rcpt_to || '').toLowerCase();
    const agent = AGENTS[rcpt];
    if (agent) {
      console.log('[Mail] Routing to agent:', agent.name, 'for', rcpt);

      // Generate LLM draft
      const draftBody = await generateLLMDraft(agent, {
        mail_from: payload.mail_from,
        subject: payload.subject || '',
        plain_body: payload.plain_body || '',
      });

      const draftId = payload.id || Date.now();
      const draft = {
        messageId: draftId,
        from: rcpt,
        to: payload.mail_from,
        subject: 'Re: ' + (payload.subject || ''),
        plain_body: draftBody,
        agentName: agent.name,
        agentEmail: rcpt,
        createdAt: new Date().toISOString(),
      };

      // Check auto-approval toggle
      if ((await getAgentConfigByEmail(rcpt))?.auto_approve_email) {
        console.log('[Mail] Auto-approval ON for', agent.name, '- sending immediately');
        const payload = applyAIDisclaimer(agent.name, draft.plain_body || '', draft.html_body || '');
        draft.plain_body = payload.plain_body;
        draft.html_body = payload.html_body;
        try {
          await postalRequest('/api/v1/send/message', {
            to: [draft.to],
            from: draft.from,
            subject: draft.subject,
            plain_body: draft.plain_body,
          });
          console.log('[Mail] Auto-reply sent from', agent.name, 'to', draft.to);
        } catch (sendErr) {
          console.error('[Mail] Auto-reply failed:', sendErr.message);
          drafts.set(draftId, draft); // fallback to draft
        }
      } else {
        drafts.set(draftId, draft);
        console.log('[Mail] LLM draft created for approval -', agent.name);
      }
    }
    res.json({ status: 'success', message: 'Email received' });
  } catch (err) {
    console.error('[Mail] inbound webhook error:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /api/v1/mail/inbound - list received inbound emails (from DB)
router.get('/inbound', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tenant_vutler.email_messages WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.workspaceId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Mail] inbound list error:', err.message);
    // Fallback to in-memory
    res.json({ success: true, data: global._inboundEmails || [] });
  }
});


// POST /api/v1/mail/auto-approval - persist toggle in DB
router.post('/auto-approval', async (req, res) => {
  try {
    const { agentEmail, enabled } = req.body;
    if (!agentEmail) return res.status(400).json({ success: false, error: 'agentEmail required' });
    const cfg = await getAgentConfigByEmail(agentEmail);
    if (!cfg) return res.status(400).json({ success: false, error: 'Unknown agent' });

    autoApproval.set(String(agentEmail).toLowerCase(), !!enabled);
    try {
      await pool.query(
        `UPDATE tenant_vutler.agents
            SET auto_approve_email = $1,
                updated_at = NOW()
          WHERE lower(email) = $2`,
        [!!enabled, String(agentEmail).toLowerCase()]
      );
    } catch (dbErr) {
      console.warn('[Mail] auto-approval DB update fallback:', dbErr.message);
    }

    console.log('[Mail] Auto-approval', enabled ? 'ENABLED' : 'DISABLED', 'for', agentEmail);
    res.json({ success: true, data: { agentEmail: String(agentEmail).toLowerCase(), autoApproval: !!enabled, disclaimer: enabled ? AI_DISCLAIMER.replace('[AGENT]', cfg.name || 'Agent').trim() : null } });
  } catch (err) {
    console.error('[Mail] auto-approval toggle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/mail/auto-approval - get auto-approval status from DB
router.get('/auto-approval', async (req, res) => {
  try {
    const result = await pool.query(`SELECT email, name, COALESCE(auto_approve_email, false) AS auto_approve_email FROM tenant_vutler.agents WHERE email IS NOT NULL ORDER BY email`);
    const status = {};
    for (const row of result.rows) {
      status[row.email.toLowerCase()] = { agent: row.name, autoApproval: !!row.auto_approve_email };
    }
    return res.json({ success: true, data: status });
  } catch (err) {
    console.warn('[Mail] auto-approval list fallback:', err.message);
    const status = {};
    for (const email of Object.keys(AGENTS)) {
      status[email] = { agent: AGENTS[email].name, autoApproval: autoApproval.get(email) || false };
    }
    return res.json({ success: true, data: status, fallback: true });
  }
});


// GET /api/v1/mail
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tenant_vutler.email_messages WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50', [req.workspaceId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Mail] root list error:', err.message);
    res.json({ success: true, data: global._inboundEmails || [] });
  }
});

module.exports = router;
