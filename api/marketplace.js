/**
 * Marketplace API — Sprint 11
 */
const express = require("express");
const pool = require("../lib/vaultbrix");
const router = express.Router();
const SCHEMA = "tenant_vutler";

function parseJsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  return value;
}

function titleizeCapability(capability) {
  return String(capability || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTemplateTags(tools, permissions) {
  const tags = new Set();

  for (const tool of tools.slice(0, 8)) {
    tags.add(titleizeCapability(tool));
  }

  if (permissions.browser_operator) tags.add("Browser Operator");
  if (permissions.browser_operator_template) tags.add("Specialized Template");
  if (permissions.requires_agent_mailbox) tags.add("Agent Mailbox");
  if (permissions.launch_surface === '/nexus') tags.add("Nexus Enterprise");
  if (permissions.launch_surface) tags.add("Dedicated Surface");
  if (permissions.tooling_status === 'beta') tags.add("Beta");

  return Array.from(tags);
}

function mapMarketplaceTemplate(row) {
  const tools = Array.isArray(row.tools) ? row.tools : parseJsonValue(row.tools, []);
  const permissions = parseJsonValue(row.permissions, {});
  const inferredSkills = tools.map((tool) => String(tool)).filter(Boolean);

  return {
    id: String(row.id),
    name: row.name,
    description: row.description || "",
    category: row.category || "custom",
    avatar: row.avatar || permissions.avatar || null,
    skills: inferredSkills,
    tags: buildTemplateTags(inferredSkills, permissions),
    author: row.workspace_id === 1 ? "Vutler" : "Workspace",
    rating: Number(row.avg_rating || 0),
    avg_rating: Number(row.avg_rating || 0),
    review_count: Number(row.review_count || 0),
    install_count: Number(row.install_count || 0),
    installs: Number(row.install_count || 0),
    price: Number(row.price || 0),
    created_at: row.created_at,
    config: {
      icon: permissions.avatar || null,
      tags: buildTemplateTags(inferredSkills, permissions),
      model: row.model || "",
      temperature: Number(permissions.temperature || 0.7),
      max_tokens: permissions.max_tokens ? Number(permissions.max_tokens) : undefined,
      system_prompt: row.system_prompt || row.system_prompt_preview || "",
    },
    permissions,
  };
}

async function dedupeWorkspaceTemplatesByName(workspaceId, names) {
  for (const name of names) {
    const result = await pool.query(
      `SELECT id, install_count, review_count, avg_rating, permissions
         FROM ${SCHEMA}.marketplace_templates
        WHERE workspace_id = $1 AND name = $2
        ORDER BY id DESC`,
      [workspaceId, name]
    );

    if (result.rows.length <= 1) continue;

    const preferred =
      result.rows.find((row) => parseJsonValue(row.permissions, {})?.launch_surface)
      || result.rows[0];

    const duplicateIds = result.rows
      .filter((row) => row.id !== preferred.id)
      .map((row) => row.id);

    const totalInstallCount = result.rows.reduce((sum, row) => sum + Number(row.install_count || 0), 0);
    const totalReviewCount = result.rows.reduce((sum, row) => sum + Number(row.review_count || 0), 0);
    const weightedRatingTotal = result.rows.reduce(
      (sum, row) => sum + (Number(row.avg_rating || 0) * Number(row.review_count || 0)),
      0
    );
    const avgRating = totalReviewCount > 0
      ? Number((weightedRatingTotal / totalReviewCount).toFixed(2))
      : Number(preferred.avg_rating || 0);

    await pool.query(
      `UPDATE ${SCHEMA}.marketplace_templates
          SET install_count = $2,
              review_count = $3,
              avg_rating = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [preferred.id, totalInstallCount, totalReviewCount, avgRating]
    );

    await pool.query(
      `DELETE FROM ${SCHEMA}.marketplace_templates
        WHERE id = ANY($1::int[])`,
      [duplicateIds]
    );
  }
}

async function ensureMarketplaceTemplate(template) {
  const workspaceId = template.workspace_id || 1;
  const existing = await pool.query(
    `SELECT id
       FROM ${SCHEMA}.marketplace_templates
      WHERE workspace_id = $1 AND name = $2
      LIMIT 1`,
    [workspaceId, template.name]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE ${SCHEMA}.marketplace_templates
          SET description = $2,
              category = $3,
              pricing = $4,
              price = $5,
              model = $6,
              system_prompt = $7,
              tools = $8::jsonb,
              permissions = $9::jsonb,
              verified = $10,
              published = true,
              updated_at = NOW()
        WHERE id = $1`,
      [
        existing.rows[0].id,
        template.description,
        template.category,
        template.pricing,
        template.price,
        template.model,
        template.system_prompt,
        JSON.stringify(template.tools || []),
        JSON.stringify(template.permissions || {}),
        Boolean(template.verified),
      ]
    );
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.marketplace_templates
       (workspace_id, agent_id, name, description, category, pricing, price, model, system_prompt, tools, permissions, verified, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, true)
     RETURNING id`,
    [
      workspaceId,
      template.agent_id || 0,
      template.name,
      template.description,
      template.category,
      template.pricing || 'free',
      template.price || 0,
      template.model || null,
      template.system_prompt || null,
      JSON.stringify(template.tools || []),
      JSON.stringify(template.permissions || {}),
      Boolean(template.verified),
    ]
  );
  return result.rows[0]?.id || null;
}

// Auto-init tables
(async () => {
  try {
    const checkTemplates = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='marketplace_templates'`
    );
    if (checkTemplates.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.marketplace_templates (
          id SERIAL PRIMARY KEY,
          workspace_id INT NOT NULL,
          agent_id INT NOT NULL,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'custom',
          pricing VARCHAR(10) DEFAULT 'free',
          price DECIMAL(10,2) DEFAULT 0,
          model VARCHAR(100),
          system_prompt TEXT,
          tools JSONB DEFAULT '[]',
          permissions JSONB DEFAULT '{}',
          install_count INT DEFAULT 0,
          avg_rating DECIMAL(3,2) DEFAULT 0,
          review_count INT DEFAULT 0,
          published BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          verified BOOLEAN DEFAULT false
        );
        CREATE INDEX IF NOT EXISTS idx_marketplace_category ON ${SCHEMA}.marketplace_templates(category, published);
        CREATE INDEX IF NOT EXISTS idx_marketplace_rating ON ${SCHEMA}.marketplace_templates(avg_rating DESC);

        CREATE TABLE IF NOT EXISTS ${SCHEMA}.marketplace_reviews (
          id SERIAL PRIMARY KEY,
          template_id INT NOT NULL REFERENCES ${SCHEMA}.marketplace_templates(id) ON DELETE CASCADE,
          workspace_id INT NOT NULL,
          user_id INT,
          rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_review_unique ON ${SCHEMA}.marketplace_reviews(template_id, workspace_id);
      `);
      console.log("[MARKETPLACE] Tables ensured");
    }
    try {
      await pool.query(`ALTER TABLE ${SCHEMA}.marketplace_templates ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false`);
    } catch (alterErr) {
      console.warn("[MARKETPLACE] ALTER TABLE warning:", alterErr.message);
    }

    // Seed starter templates if empty
    const count = await pool.query(`SELECT COUNT(*) FROM ${SCHEMA}.marketplace_templates`);
    if (parseInt(count.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO ${SCHEMA}.marketplace_templates (workspace_id, agent_id, name, description, category, model, system_prompt, tools, permissions, pricing, price, verified) VALUES
        (1, 0, 'Sentinel Ops', '🛡️ Infrastructure monitoring, health checks, VPS alerts, uptime tracking', 'automation', 'claude-haiku', 'You are Sentinel Ops, an infrastructure monitoring agent. Continuously track server health, uptime, and resource usage. Alert on anomalies, suggest remediation steps, and maintain a clear status dashboard. Prioritize critical alerts and provide actionable summaries.', '["monitoring","alerting","health_check","uptime_tracker"]'::jsonb, '{}'::jsonb, 'free', 0, true),
        (1, 0, 'Office Manager', '📋 Admin tasks, compliance (GDPR/LPD), contracts, HR, legal docs', 'custom', 'claude-haiku', 'You are an Office Manager assistant. Handle administrative tasks including document management, compliance tracking (GDPR/LPD), contract drafting, and HR processes. Maintain organized records and ensure regulatory adherence. Provide clear, professional communication.', '["document_management","compliance_tracker","calendar"]'::jsonb, '{}'::jsonb, 'free', 0, true),
        (1, 0, 'Product Manager', '🧪 User stories, sprint planning, PRDs, backlog grooming, roadmaps', 'custom', 'claude-sonnet-4-20250514', 'You are a Product Manager assistant. Write clear user stories with acceptance criteria, help plan sprints, draft PRDs, and maintain product roadmaps. Prioritize features based on impact and effort. Facilitate backlog grooming with structured analysis.', '["jira_integration","roadmap_builder","user_story_generator"]'::jsonb, '{}'::jsonb, 'paid', 9.99, true),
        (1, 0, 'Growth Hacker', '📈 SEO, social media campaigns, A/B testing, analytics, funnel optimization', 'content', 'claude-haiku', 'You are a Growth Hacker agent. Devise and analyze SEO strategies, social media campaigns, and A/B tests. Track funnel metrics, identify conversion bottlenecks, and suggest data-driven optimizations. Focus on measurable growth with lean experimentation.', '["seo_optimizer","analytics","ab_testing","funnel_tracker"]'::jsonb, '{"web_search":true}'::jsonb, 'free', 0, true),
        (1, 0, 'Community Manager', '🎮 Discord/Slack moderation, engagement, events, user feedback', 'custom', 'claude-haiku', 'You are a Community Manager assistant. Moderate Discord and Slack channels, foster engagement, plan community events, and collect user feedback. Maintain a welcoming environment, resolve conflicts diplomatically, and surface key community insights.', '["moderation","event_planner","feedback_collector"]'::jsonb, '{}'::jsonb, 'free', 0, true),
        (1, 0, 'Content Creator', '📝 Blog posts, newsletters, copywriting, social media content', 'content', 'claude-sonnet-4-20250514', 'You are a Content Creator agent. Write engaging blog posts, newsletters, marketing copy, and social media content. Adapt tone and style to match brand voice. Optimize for readability and SEO. Deliver polished, publication-ready content.', '["seo_optimizer","grammar_check","content_calendar"]'::jsonb, '{"web_search":true}'::jsonb, 'free', 0, true),
        (1, 0, 'Sales Agent', '💰 Lead qualification, follow-ups, proposals, CRM updates, pipeline management', 'sales', 'claude-haiku', 'You are a Sales Agent assistant. Qualify leads, draft personalized follow-ups, create proposals, and manage CRM updates. Track pipeline progress and prioritize high-value opportunities. Be persuasive, professional, and data-driven.', '["crm_integration","email_drafting","pipeline_tracker","proposal_generator"]'::jsonb, '{"web_search":true}'::jsonb, 'free', 0, true),
        (1, 0, 'Customer Support', '🎧 Ticket handling, FAQ, escalation, multi-language support', 'customer-support', 'claude-haiku', 'You are a Customer Support agent. Handle support tickets with empathy and efficiency. Answer FAQs, troubleshoot issues, and escalate complex cases appropriately. Support multiple languages and always aim for first-contact resolution.', '["ticket_management","knowledge_base","escalation","translation"]'::jsonb, '{}'::jsonb, 'free', 0, false),
        (1, 0, 'Code Reviewer', '🔍 PR reviews, code quality, security checks, best practices', 'code-review', 'claude-sonnet-4-20250514', 'You are an expert Code Reviewer. Analyze pull requests for bugs, security vulnerabilities, performance issues, and adherence to best practices. Provide constructive, specific feedback with code suggestions. Support multiple languages and frameworks.', '["github_integration","static_analysis","security_scanner"]'::jsonb, '{"code_execution":true}'::jsonb, 'paid', 4.99, false),
        (1, 0, 'Data Analyst', '📊 Database queries, reports, visualizations, trend analysis', 'data-analysis', 'claude-sonnet-4-20250514', 'You are a Data Analyst agent. Query databases, analyze trends, and generate clear reports with visualizations. Transform raw data into actionable insights. Present findings concisely with supporting charts and statistical context.', '["sql_query","chart_generation","export","data_pipeline"]'::jsonb, '{"code_execution":true,"web_search":true}'::jsonb, 'paid', 4.99, false),
        (1, 0, 'DevOps Monitor', '🖥️ CI/CD, deployments, incident response, infrastructure alerts', 'automation', 'claude-haiku', 'You are a DevOps Monitor agent. Oversee CI/CD pipelines, manage deployments, and respond to infrastructure incidents. Analyze logs, suggest optimizations, and maintain system reliability. Prioritize uptime and provide clear incident reports.', '["monitoring","alerting","log_analysis","incident_response","ci_cd"]'::jsonb, '{"code_execution":true,"web_search":true}'::jsonb, 'free', 0, false),
        (1, 0, 'IT Helpdesk', '🔧 Internal tickets, troubleshooting, knowledge base, password resets', 'customer-support', 'claude-haiku', 'You are an IT Helpdesk agent. Handle internal support tickets, guide users through troubleshooting steps, manage password resets, and maintain the knowledge base. Provide clear, step-by-step instructions for common IT issues.', '["ticket_management","knowledge_base","directory_lookup","password_reset"]'::jsonb, '{}'::jsonb, 'free', 0, false),
        (1, 0, 'Legal Assistant', '⚖️ Contract review, compliance checks, clause analysis, NDA drafts', 'custom', 'claude-sonnet-4-20250514', 'You are a Legal Assistant agent. Review contracts, check compliance with relevant regulations, analyze clauses for risks, and draft NDAs and standard agreements. Flag potential issues and suggest protective language. Always recommend human legal review for final decisions.', '["document_analysis","compliance_checker","template_library"]'::jsonb, '{}'::jsonb, 'paid', 9.99, false),
        (1, 0, 'Finance Analyst', '💹 Budget analysis, forecasting, expense reports, P&L summaries', 'data-analysis', 'claude-sonnet-4-20250514', 'You are a Finance Analyst agent. Analyze budgets, create financial forecasts, generate expense reports, and summarize P&L statements. Present financial data clearly with actionable recommendations. Flag anomalies and trends that need attention.', '["sql_query","chart_generation","export","financial_modeling"]'::jsonb, '{"code_execution":true}'::jsonb, 'paid', 9.99, false),
        (1, 0, 'Recruiter', '👥 CV screening, interview scheduling, candidate outreach, job descriptions', 'custom', 'claude-haiku', 'You are a Recruiter assistant. Screen CVs against job requirements, schedule interviews, draft candidate outreach messages, and write compelling job descriptions. Maintain an organized hiring pipeline and provide candidate summaries.', '["cv_parser","calendar","email_drafting","candidate_tracker"]'::jsonb, '{}'::jsonb, 'paid', 4.99, false),
        (1, 0, 'Meeting Summarizer', '🎙️ Transcription to summary, action items extraction, follow-up emails', 'automation', 'claude-haiku', 'You are a Meeting Summarizer agent. Transform meeting transcriptions into concise summaries with key decisions, action items, and owners. Draft follow-up emails and track action item completion. Highlight deadlines and blockers.', '["transcription","summary_generator","email_drafting","task_tracker"]'::jsonb, '{}'::jsonb, 'free', 0, false),
        (1, 0, 'Email Triager', '📬 Inbox triage, auto-replies, prioritization, routing to right person', 'automation', 'claude-haiku', 'You are an Email Triager agent. Analyze incoming emails, prioritize by urgency and importance, draft auto-replies for routine messages, and route complex emails to the appropriate person. Maintain inbox zero with smart categorization.', '["email_reader","auto_reply","routing","priority_classifier"]'::jsonb, '{}'::jsonb, 'free', 0, false)
      `);
      console.log("[MARKETPLACE] Seed templates inserted");
    }

    const specializedTemplates = [
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'Synthetic User QA',
        description: 'Browser-based testing agent with cloud browser runtime, agent mailbox for magic-link and email-code flows, and evidence-packed reports.',
        category: 'technical',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are Synthetic User QA, a browser testing agent. Run bounded browser flows, simulate users safely, use the agent mailbox for magic-link or email-code authentication, and produce evidence-rich reports with screenshots, logs, and findings.',
        tools: ['browser_operator', 'agent_mailbox', 'reporting', 'synthetic_user_testing'],
        permissions: {
          browser_operator: true,
          browser_operator_template: 'synthetic_user_qa',
          requires_agent_mailbox: true,
          launch_surface: '/browser-operator',
          launch_profile_key: 'synthetic_user_qa',
          launch_label: 'Open Browser Operator',
          temperature: 0.2,
        },
        verified: true,
      },
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'App Reviewer',
        description: 'Specialized browser review agent for UX checks, friction reports, login-readiness tests, and evidence-packed app reviews.',
        category: 'technical',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are App Reviewer, a browser review agent. Inspect product flows, capture UX friction, validate login readiness, and produce structured reports with evidence, screenshots, and findings.',
        tools: ['browser_operator', 'reporting', 'ui_review', 'synthetic_user_testing'],
        permissions: {
          browser_operator: true,
          browser_operator_template: 'app_reviewer',
          launch_surface: '/browser-operator',
          launch_profile_key: 'app_reviewer',
          launch_label: 'Open Browser Operator',
          temperature: 0.2,
        },
        verified: true,
      },
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'AV Manager',
        description: 'Nexus Enterprise AV operations agent for room monitoring, bounded remediation, ticketing, and event-driven diagnostics.',
        category: 'technical',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are AV Manager, an enterprise AV operations agent. Monitor AV rooms, handle bounded diagnostics and remediation, coordinate ticketing, and generate client-facing reports under policy control.',
        tools: ['event_ingestion', 'ticketing', 'device_diagnostics', 'local_api_bridge', 'reporting'],
        permissions: {
          nexus_enterprise: true,
          launch_surface: '/nexus',
          launch_mode: 'enterprise',
          launch_profile_key: 'av_manager',
          launch_label: 'Open Nexus Deploy',
          tooling_status: 'beta',
          temperature: 0.2,
        },
        verified: true,
      },
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'IT Helpdesk',
        description: 'Nexus Enterprise IT support agent for bounded triage, ticketing, local diagnostics, and governed helper delegation.',
        category: 'technical',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are IT Helpdesk, an enterprise support agent. Handle bounded IT triage, diagnostics, reporting, and ticketing under client-defined governance.',
        tools: ['ticketing', 'reporting', 'local_api_bridge', 'event_ingestion', 'helper_delegation'],
        permissions: {
          nexus_enterprise: true,
          launch_surface: '/nexus',
          launch_mode: 'enterprise',
          launch_profile_key: 'it_helpdesk',
          launch_label: 'Open Nexus Deploy',
          tooling_status: 'beta',
          temperature: 0.2,
        },
        verified: true,
      },
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'Bid Manager',
        description: 'Nexus Enterprise bid coordination agent for proposal drafting, workspace knowledge retrieval, and governed email dispatch.',
        category: 'operations',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are Bid Manager, an enterprise proposal agent. Build draft responses, gather material from workspace knowledge, coordinate proposal inputs, and help assemble compliant bid packages.',
        tools: ['document_generation', 'workspace_knowledge_access', 'email_dispatch', 'reporting'],
        permissions: {
          nexus_enterprise: true,
          launch_surface: '/nexus',
          launch_mode: 'enterprise',
          launch_profile_key: 'bid_manager',
          launch_label: 'Open Nexus Deploy',
          tooling_status: 'beta',
          temperature: 0.2,
        },
        verified: true,
      },
      {
        workspace_id: 1,
        agent_id: 0,
        name: 'Report Writer',
        description: 'Nexus Enterprise reporting agent for structured reports, workspace-backed drafts, and governed document generation.',
        category: 'operations',
        pricing: 'free',
        price: 0,
        model: 'claude-sonnet-4-20250514',
        system_prompt: 'You are Report Writer, an enterprise reporting agent. Draft structured reports from workspace inputs, operational signals, and reusable templates while staying inside governance and approval rules.',
        tools: ['document_generation', 'workspace_knowledge_access', 'email_dispatch', 'reporting'],
        permissions: {
          nexus_enterprise: true,
          launch_surface: '/nexus',
          launch_mode: 'enterprise',
          launch_profile_key: 'report_writer',
          launch_label: 'Open Nexus Deploy',
          tooling_status: 'beta',
          temperature: 0.2,
        },
        verified: true,
      },
    ];

    for (const template of specializedTemplates) {
      await ensureMarketplaceTemplate(template);
    }
    await dedupeWorkspaceTemplatesByName(1, specializedTemplates.map((template) => template.name));
  } catch(e) { console.warn("[MARKETPLACE] Init:", e.message); }
})();

// Helper: audit log
async function auditLog(userId, action, entityId, details, workspaceId) {
  try {
    await pool.query(
      `INSERT INTO ${SCHEMA}.audit_logs (user_id, action, entity_type, entity_id, details, workspace_id) VALUES ($1,$2,'marketplace_template',$3,$4,$5)`,
      [userId, action, entityId, JSON.stringify(details), workspaceId]
    );
  } catch(e) { console.warn("[MARKETPLACE] Audit log error:", e.message); }
}

// GET /templates/categories
router.get("/templates/categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM .marketplace_templates WHERE published = true ORDER BY category`
    );
    const cats = result.rows.map(r => r.category);
    if (!cats.length) {
      return res.json({ success: true, categories: ["Customer Service", "Sales", "Development", "HR", "Marketing", "Custom"] });
    }
    res.json({ success: true, categories: cats });
  } catch (err) {
    console.error("[MARKETPLACE] Categories error:", err.message);
    res.json({ success: true, categories: ["Customer Service", "Sales", "Development", "HR", "Marketing", "Custom"] });
  }
});

// GET /templates — list published templates
router.get("/templates", async (req, res) => {
  try {
    const { category, sort = "popular", page = 1, limit = 20, search } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = [`t.published = true`];
    let params = [];
    let idx = 1;

    if (category) { where.push(`t.category = $${idx++}`); params.push(category); }
    if (search) { where.push(`(t.name ILIKE $${idx} OR t.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    let orderBy;
    switch(sort) {
      case "newest": orderBy = "t.created_at DESC"; break;
      case "top_rated": orderBy = "t.avg_rating DESC"; break;
      case "price": orderBy = "t.price ASC"; break;
      default: orderBy = "t.install_count DESC";
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${SCHEMA}.marketplace_templates t WHERE ${where.join(" AND ")}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT t.id, t.workspace_id, t.agent_id, t.name, t.description, t.category, t.pricing, t.price, t.model,
              LEFT(t.system_prompt, 100) AS system_prompt_preview,
              t.tools, t.permissions, t.install_count, t.avg_rating, t.review_count, t.published, t.created_at, t.updated_at, t.min_plan, t.price_label, t.is_byok
       FROM ${SCHEMA}.marketplace_templates t
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json({
      success: true,
      templates: result.rows.map(mapMarketplaceTemplate),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch(err) {
    console.error("[MARKETPLACE] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /my-templates — own published templates
router.get("/my-templates", async (req, res) => {
  try {
    const ws = req.workspaceId;
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_templates WHERE workspace_id = $1 ORDER BY created_at DESC`, [ws]
    );
    res.json({ success: true, templates: result.rows.map(mapMarketplaceTemplate) });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /templates/:id — full detail with reviews
router.get("/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tmpl = await pool.query(`SELECT * FROM ${SCHEMA}.marketplace_templates WHERE id = $1 AND published = true`, [id]);
    if (tmpl.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found" });

    const reviews = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_reviews WHERE template_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]
    );

    res.json({ success: true, template: mapMarketplaceTemplate(tmpl.rows[0]), reviews: reviews.rows });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /templates — publish (admin only)
router.post("/templates", async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    const ws = req.workspaceId;
    const { agent_id, name, description, category, pricing, price } = req.body;
    if (!agent_id || !name) return res.status(400).json({ success: false, error: "agent_id and name required" });

    // Fetch agent config
    const agentConfig = await pool.query(
      `SELECT ac.model, ac.system_prompt, ac.permissions, a.tools
       FROM ${SCHEMA}.agent_configs ac
       JOIN ${SCHEMA}.agents a ON a.id = ac.agent_id
       WHERE ac.agent_id = $1 AND a.workspace_id = $2`, [agent_id, ws]
    );
    const config = agentConfig.rows[0] || {};

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.marketplace_templates (workspace_id, agent_id, name, description, category, pricing, price, model, system_prompt, tools, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ws, agent_id, name, description || null, category || "custom", pricing || "free", price || 0,
       config.model || null, config.system_prompt || null, JSON.stringify(config.tools || []), JSON.stringify(config.permissions || {})]
    );

    await auditLog(req.user?.id, "marketplace_publish", result.rows[0].id, { name, agent_id }, ws);
    res.status(201).json({ success: true, template: result.rows[0] });
  } catch(err) {
    console.error("[MARKETPLACE] Publish error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /templates/:id — update own template (admin only)
router.put("/templates/:id", async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    const { id } = req.params;
    const ws = req.workspaceId;
    const { name, description, category, pricing, price, model, system_prompt, tools, permissions, published } = req.body;

    const existing = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_templates WHERE id = $1 AND workspace_id = $2`, [id, ws]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found or not yours" });

    const result = await pool.query(
      `UPDATE ${SCHEMA}.marketplace_templates SET
        name = COALESCE($1, name), description = COALESCE($2, description), category = COALESCE($3, category),
        pricing = COALESCE($4, pricing), price = COALESCE($5, price), model = COALESCE($6, model),
        system_prompt = COALESCE($7, system_prompt), tools = COALESCE($8, tools), permissions = COALESCE($9, permissions),
        published = COALESCE($10, published), updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, description, category, pricing, price, model, system_prompt,
       tools ? JSON.stringify(tools) : null, permissions ? JSON.stringify(permissions) : null,
       published, id]
    );

    res.json({ success: true, template: result.rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /templates/:id — unpublish (admin only)
router.delete("/templates/:id", async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    const { id } = req.params;
    const ws = req.workspaceId;

    const existing = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_templates WHERE id = $1 AND workspace_id = $2`, [id, ws]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found or not yours" });

    await pool.query(`UPDATE ${SCHEMA}.marketplace_templates SET published = false, updated_at = NOW() WHERE id = $1`, [id]);
    await auditLog(req.user?.id, "marketplace_unpublish", id, { name: existing.rows[0].name }, ws);

    res.json({ success: true, message: "Template unpublished" });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /templates/:id/install — clone template to workspace
router.post("/templates/:id/install", async (req, res) => {
  try {
    const { id } = req.params;
    const ws = req.workspaceId;
    const userId = req.user?.id;

    const wsPlan = await pool.query(`SELECT plan FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`, [ws]);
    const plan = String(wsPlan.rows[0]?.plan || 'free').toLowerCase();
    if (plan === 'free') {
      return res.status(403).json({ success: false, error: 'Free plan includes only the Coordinator. Upgrade to Pro to install additional agents.' });
    }

    const tmpl = await pool.query(`SELECT * FROM ${SCHEMA}.marketplace_templates WHERE id = $1 AND published = true`, [id]);
    if (tmpl.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found" });
    const t = tmpl.rows[0];

    // Ensure NOT NULL username for agents table
    const baseUsername = String(t.name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
    let username = baseUsername;
    for (let i = 1; i <= 20; i++) {
      const check = await pool.query(`SELECT 1 FROM ${SCHEMA}.agents WHERE username = $1 LIMIT 1`, [username]);
      if (check.rows.length === 0) break;
      username = `${baseUsername}-${i}`;
    }

    // Create agent in caller's workspace
    const agent = await pool.query(
      `INSERT INTO ${SCHEMA}.agents (workspace_id, name, username, description, type, status, tools, model, system_prompt)
       VALUES ($1, $2, $3, $4, 'custom', 'inactive', $5, $6, $7) RETURNING *`,
      [ws, t.name, username, t.description, JSON.stringify(t.tools || []), t.model || null, t.system_prompt || null]
    );

    // Create agent_config
    await pool.query(
      `INSERT INTO ${SCHEMA}.agent_configs (agent_id, workspace_id, model, system_prompt, permissions)
       VALUES ($1, $2, $3, $4, $5)`,
      [agent.rows[0].id, ws, t.model, t.system_prompt, JSON.stringify(t.permissions || {})]
    );

    // Increment install count
    await pool.query(`UPDATE ${SCHEMA}.marketplace_templates SET install_count = install_count + 1 WHERE id = $1`, [id]);

    await auditLog(userId, "marketplace_install", id, { template_name: t.name, new_agent_id: agent.rows[0].id }, ws);
    res.status(201).json({ success: true, agent: agent.rows[0] });
  } catch(err) {
    console.error("[MARKETPLACE] Install error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /templates/:id/review — add review (one per workspace)
router.post("/templates/:id/review", async (req, res) => {
  try {
    const { id } = req.params;
    const ws = req.workspaceId;
    const userId = req.user?.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: "Rating 1-5 required" });

    // Check template exists
    const tmpl = await pool.query(`SELECT id FROM ${SCHEMA}.marketplace_templates WHERE id = $1 AND published = true`, [id]);
    if (tmpl.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found" });

    await pool.query(
      `INSERT INTO ${SCHEMA}.marketplace_reviews (template_id, workspace_id, user_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (template_id, workspace_id) DO UPDATE SET rating = $4, comment = $5, created_at = NOW()`,
      [id, ws, userId, rating, comment || null]
    );

    // Recalculate avg_rating and review_count
    const stats = await pool.query(
      `SELECT COUNT(*) as cnt, AVG(rating)::numeric(3,2) as avg FROM ${SCHEMA}.marketplace_reviews WHERE template_id = $1`, [id]
    );
    await pool.query(
      `UPDATE ${SCHEMA}.marketplace_templates SET avg_rating = $1, review_count = $2, updated_at = NOW() WHERE id = $3`,
      [stats.rows[0].avg, stats.rows[0].cnt, id]
    );

    res.json({ success: true, message: "Review saved" });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /templates/:id/reviews — list reviews (paginated)
router.get("/templates/:id/reviews", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_reviews WHERE template_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [id, limitNum, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${SCHEMA}.marketplace_reviews WHERE template_id = $1`, [id]);

    res.json({ success: true, reviews: result.rows, total: parseInt(countResult.rows[0].count), page: pageNum, limit: limitNum });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// GET /api/v1/marketplace
router.get("/", async (req, res) => {
  try {
    // SECURITY: workspace from JWT only (audit 2026-03-29)
    const ws = req.workspaceId;
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.marketplace_templates WHERE published = true AND (workspace_id = $1 OR workspace_id = 1) ORDER BY install_count DESC, avg_rating DESC, created_at DESC LIMIT 50`,
      [ws]
    );
    res.json({ success: true, templates: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
