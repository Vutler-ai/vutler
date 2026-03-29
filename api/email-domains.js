'use strict';

/**
 * Email Domains API
 * Manages workspace custom domains for agent email addresses.
 * Supports DNS verification via Node.js built-in dns module.
 *
 * Routes (mounted at /api/v1/email/domains):
 *   GET    /           — list workspace domains with verification status
 *   POST   /           — add a domain, return required DNS records
 *   POST   /:id/verify — re-check DNS records for a domain
 *   DELETE /:id        — remove a domain
 */

const express = require('express');
const dns = require('dns').promises;
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const MAIL_SERVER = process.env.VUTLER_MAIL_SERVER || 'mail.vutler.ai';
const DKIM_CNAME_TARGET = process.env.VUTLER_DKIM_TARGET || 'dkim.mail.vutler.ai';
const DMARC_EMAIL = process.env.VUTLER_DMARC_EMAIL || 'dmarc@vutler.ai';

/**
 * Build the DNS records a workspace must configure for a given domain.
 */
function buildDnsRecords(domain) {
  return {
    mx: {
      type: 'MX',
      host: '@',
      value: MAIL_SERVER,
      priority: 10,
      description: `Points mail for ${domain} to Vutler mail server`,
    },
    spf: {
      type: 'TXT',
      host: '@',
      value: `v=spf1 include:${MAIL_SERVER} ~all`,
      description: 'Authorises Vutler to send email on your behalf',
    },
    dkim: {
      type: 'CNAME',
      host: 'vutler._domainkey',
      value: DKIM_CNAME_TARGET,
      description: 'DKIM signing key — proves emails were not tampered with',
    },
    dmarc: {
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=none; rua=mailto:${DMARC_EMAIL}`,
      description: 'DMARC policy — instructs receiving servers how to handle failures',
    },
  };
}

/**
 * Verify a single DNS record type for the given domain.
 * Returns { verified: boolean, found: string|null }
 */
async function checkMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    const found = records.find(r => r.exchange.toLowerCase().includes(MAIL_SERVER.split('.')[0]));
    return { verified: !!found, found: found ? found.exchange : null };
  } catch {
    return { verified: false, found: null };
  }
}

async function checkSpf(domain) {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(r => r.join('')).join('\n');
    const verified = flat.includes(`include:${MAIL_SERVER}`);
    return { verified, found: verified ? flat.slice(0, 120) : null };
  } catch {
    return { verified: false, found: null };
  }
}

async function checkDkim(domain) {
  try {
    const cname = await dns.resolveCname(`vutler._domainkey.${domain}`);
    const verified = cname.some(c => c.toLowerCase().includes(MAIL_SERVER.split('.').slice(1).join('.')));
    return { verified, found: cname[0] || null };
  } catch {
    return { verified: false, found: null };
  }
}

async function checkDmarc(domain) {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map(r => r.join('')).join('\n');
    const verified = flat.includes('v=DMARC1');
    return { verified, found: verified ? flat.slice(0, 120) : null };
  } catch {
    return { verified: false, found: null };
  }
}

async function verifyAllRecords(domain) {
  const [mx, spf, dkim, dmarc] = await Promise.all([
    checkMx(domain),
    checkSpf(domain),
    checkDkim(domain),
    checkDmarc(domain),
  ]);
  return { mx, spf, dkim, dmarc };
}

// ---------------------------------------------------------------------------
// GET / — list workspace domains
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.json({ success: true, domains: [] });

    const ws = req.workspaceId; // SECURITY: workspace from JWT only (audit 2026-03-29)
    const result = await pg.query(
      `SELECT * FROM ${SCHEMA}.workspace_domains WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [ws]
    );

    const domains = result.rows.map(d => ({
      id: d.id,
      domain: d.domain,
      verification: {
        mx: d.mx_verified,
        spf: d.spf_verified,
        dkim: d.dkim_verified,
        dmarc: d.dmarc_verified,
        fullyVerified: d.mx_verified && d.spf_verified && d.dkim_verified && d.dmarc_verified,
        verifiedAt: d.verified_at,
      },
      dnsRecords: d.dns_records || buildDnsRecords(d.domain),
      createdAt: d.created_at,
    }));

    res.json({ success: true, domains, count: domains.length });
  } catch (err) {
    console.error('[EMAIL-DOMAINS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST / — add a domain
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ success: false, error: 'domain is required' });
    }

    // Normalise: strip protocol, trailing slash, lowercase
    const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
      return res.status(400).json({ success: false, error: 'Invalid domain format' });
    }

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId;
    const dnsRecords = buildDnsRecords(cleanDomain);

    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.workspace_domains (workspace_id, domain, dns_records)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, domain) DO UPDATE SET dns_records = EXCLUDED.dns_records
       RETURNING *`,
      [ws, cleanDomain, JSON.stringify(dnsRecords)]
    );

    const d = result.rows[0];
    res.status(201).json({
      success: true,
      domain: {
        id: d.id,
        domain: d.domain,
        dnsRecords,
        verification: {
          mx: false, spf: false, dkim: false, dmarc: false, fullyVerified: false,
        },
      },
      message: 'Configure the DNS records below, then click "Verify DNS" to confirm.',
    });
  } catch (err) {
    console.error('[EMAIL-DOMAINS] Add error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Domain already added to this workspace' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/verify — check DNS records for a domain
// ---------------------------------------------------------------------------
router.post('/:id/verify', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId;
    const domainRow = await pg.query(
      `SELECT * FROM ${SCHEMA}.workspace_domains WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [req.params.id, ws]
    );

    if (!domainRow.rows[0]) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    const { domain } = domainRow.rows[0];
    console.log(`[EMAIL-DOMAINS] Verifying DNS for ${domain}...`);

    const checks = await verifyAllRecords(domain);
    const allVerified = checks.mx.verified && checks.spf.verified && checks.dkim.verified && checks.dmarc.verified;

    await pg.query(
      `UPDATE ${SCHEMA}.workspace_domains
       SET mx_verified = $1, spf_verified = $2, dkim_verified = $3, dmarc_verified = $4,
           verified_at = CASE WHEN $5 THEN NOW() ELSE verified_at END
       WHERE id = $6`,
      [checks.mx.verified, checks.spf.verified, checks.dkim.verified, checks.dmarc.verified, allVerified, req.params.id]
    );

    res.json({
      success: true,
      domain,
      verification: {
        mx: checks.mx.verified,
        spf: checks.spf.verified,
        dkim: checks.dkim.verified,
        dmarc: checks.dmarc.verified,
        fullyVerified: allVerified,
        details: checks,
      },
      message: allVerified
        ? 'All DNS records verified. Your domain is ready.'
        : 'Some records are missing. Please check your DNS configuration and try again.',
    });
  } catch (err) {
    console.error('[EMAIL-DOMAINS] Verify error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — remove domain
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId;
    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.workspace_domains WHERE id = $1 AND workspace_id = $2 RETURNING id, domain`,
      [req.params.id, ws]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[EMAIL-DOMAINS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
