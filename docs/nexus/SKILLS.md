# Skills Execution Engine — Reference

## Overview

The Skills Engine is the execution layer that maps named skill keys to typed handlers. 119 skills are defined in `seeds/skill-handlers.json`. Each skill has a `type` that determines which handler executes it, an optional `fallback_type` for when the primary handler is unavailable, and a `params_schema` (JSON Schema) used for LLM tool injection and validation.

---

## Skill Catalogue by Category

### Sales (7 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `lead_scoring` | `llm_prompt` | Score leads using BANT/MEDDIC/custom frameworks |
| `crm_sync` | `integration` | Sync contacts/deals/activities with Salesforce, HubSpot, Pipedrive |
| `email_outreach` | `integration` | Send personalised outreach emails |
| `pipeline_management` | `llm_prompt` | Forecast, identify stalled deals, update pipeline stages |
| `competitor_pricing` | `llm_prompt` | Analyse competitor pricing data |
| `margin_analysis` | `llm_prompt` | Break down margins by product line / segment / region |
| `discount_strategy` | `llm_prompt` | Model discount impact on margin and win rate |

### Marketing (10 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `content_scheduling` | `integration` | Schedule social media posts across platforms |
| `social_analytics` | `integration` | Fetch engagement metrics from social platforms |
| `engagement_monitoring` | `integration` | Monitor keywords and mentions, optional auto-reply |
| `multi_platform_posting` | `integration` | Cross-post content with media and hashtags |
| `campaign_planning` | `llm_prompt` | Build campaign plans with budget and timeline |
| `ab_testing` | `llm_prompt` | Design and analyse A/B tests (email, ads, landing pages) |
| `budget_tracking` | `llm_prompt` | Track marketing spend by channel |
| `roi_analysis` | `llm_prompt` | Calculate and report campaign ROI |
| `keyword_research` | `llm_prompt` | Research SEO keywords with intent analysis |
| `content_optimization` | `llm_prompt` | Optimise page content for target keywords |

### SEO (3 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `backlink_analysis` | `llm_prompt` | Analyse backlink profiles and opportunities |
| `ranking_tracking` | `llm_prompt` | Track keyword ranking history and competitor positions |
| `dynamic_pricing` | `llm_prompt` | Model time/volume/geography-based pricing scenarios |

### Project Management (4 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `task_management` | `integration` | Create/update/list/close tasks in project tools |
| `timeline_tracking` | `llm_prompt` | Check project status, flag risks, update milestones |
| `resource_allocation` | `llm_prompt` | Match team availability and skills to tasks |
| `status_reporting` | `llm_prompt` | Generate status reports for executives, stakeholders, or team |

### HR (4 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `recruitment_screening` | `llm_prompt` | Screen CVs against job descriptions and criteria |
| `onboarding` | `llm_prompt` | Generate onboarding plans for new employees |
| `policy_lookup` | `llm_prompt` | Answer HR policy questions from document corpus |
| `leave_management` | `integration` | Request/approve/reject leave via HRIS |

### Procurement (5 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `vendor_comparison` | `llm_prompt` | Score and compare vendors on weighted criteria |
| `po_management` | `integration` | Create/approve/track purchase orders in ERP |
| `inventory_tracking` | `integration` | Track stock levels with threshold alerts |
| `cost_optimization` | `llm_prompt` | Identify savings opportunities in spend data |
| `approval_workflows` | `integration` | Route documents through approval chains |

### Finance (7 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `invoice_processing` | `composite` | Classify → extract → reconcile invoices (3-step pipeline) |
| `payment_tracking` | `integration` | Track invoice payment status and send reminders |
| `reconciliation` | `llm_prompt` | Match ledger entries against bank statements |
| `bookkeeping` | `integration` | Categorise transactions against chart of accounts |
| `tax_preparation` | `llm_prompt` | Prepare tax summaries by jurisdiction |
| `expense_tracking` | `integration` | Validate expenses against policy rules |
| `financial_reporting` | `composite` | Bookkeep → reconcile → generate P&L/balance sheet/cash flow |

### AV/IT Support (5 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `equipment_diagnostics` | `nexus_provider` | Diagnose AV/IT hardware via local system info |
| `network_scanning` | `nexus_provider` | Scan network (discovery/port scan/vulnerability) |
| `snmp_monitoring` | `nexus_provider` | Query SNMP OIDs from network devices |
| `av_troubleshooting` | `llm_prompt` | Troubleshoot AV systems (Crestron, AMX, Extron) |
| `ticket_resolution` | `integration` | Resolve IT helpdesk tickets (password reset, VPN, etc.) |

### Analytics / BI (6 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `data_analysis` | `llm_prompt` | Descriptive/diagnostic/predictive/prescriptive analysis |
| `report_generation` | `llm_prompt` | Generate executive summaries, detailed reports, dashboards |
| `competitive_intelligence` | `composite` | Trend-spot → analyse → report on competitors (3-step pipeline) |
| `trend_spotting` | `llm_prompt` | Identify market trends across 3/6/12 month horizons |
| `insight_reporting` | `llm_prompt` | Synthesise themes, quotes, trends, recommendations |
| `sensor_data_analysis` | `llm_prompt` | Analyse time-series sensor data and detect anomalies |

### Content / Knowledge Base (7 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `ocr_processing` | `llm_prompt` | Extract text from images (base64) |
| `document_classification` | `llm_prompt` | Classify documents into categories |
| `data_extraction` | `llm_prompt` | Extract structured fields from documents |
| `summarization` | `llm_prompt` | Summarise content as bullets/paragraph/executive |
| `article_creation` | `llm_prompt` | Write guides, how-tos, troubleshooting docs |
| `search_optimization` | `llm_prompt` | Optimise article titles and bodies for search |
| `faq_management` | `llm_prompt` | Generate, update, or deduplicate FAQ entries |
| `content_curation` | `llm_prompt` | Deduplicate, archive, organise content libraries |

### Customer Success (5 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `ticket_triage` | `integration` | Route and prioritise helpdesk tickets |
| `satisfaction_tracking` | `integration` | Track CSAT/NPS/CES with alert thresholds |
| `churn_prediction` | `composite` | Analyse account data → identify churn risk (2-step pipeline) |
| `upsell_detection` | `llm_prompt` | Identify upsell/expansion opportunities |
| `sentiment_analysis` | `llm_prompt` | Analyse sentiment at document/sentence/aspect level |
| `theme_extraction` | `llm_prompt` | Extract themes from feedback collections |
| `priority_ranking` | `llm_prompt` | Rank items by weighted criteria |

### Scheduling & Calendar (4 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `calendar_management` | `integration` | Create/update/delete events, protect focus blocks |
| `availability_matching` | `integration` | Find mutual availability across attendees |
| `reminder_sending` | `integration` | Send event reminders with agenda |
| `rescheduling` | `integration` | Reschedule events with conflict detection |

### Security / IT Ops (8 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `vulnerability_scanning` | `nexus_provider` | Scan hosts/CIDR ranges for vulnerabilities |
| `incident_response` | `composite` | Analyse → status-report → generate incident report (3-step pipeline) |
| `security_audit` | `llm_prompt` | Audit systems against SOC2/ISO27001/NIST/HIPAA |
| `cicd_automation` | `llm_prompt` | Generate CI/CD pipeline configs (GitHub Actions, GitLab CI, etc.) |
| `infrastructure_as_code` | `llm_prompt` | Generate Terraform/Pulumi/CloudFormation for AWS/GCP/Azure |
| `monitoring_alerting` | `integration` | Configure Datadog/Prometheus/Grafana alert policies |
| `firewall_management` | `nexus_provider` | Audit and list firewall rules via local network provider |
| `dns_management` | `nexus_provider` | DNS lookups and troubleshooting via local network provider |

### Network / IoT (6 skills)

| Skill key | Type | Description |
|-----------|------|-------------|
| `vpn_configuration` | `llm_prompt` | Design VPN configurations (WireGuard, OpenVPN, IPSec) |
| `device_management` | `nexus_provider` | Provision/update/health-check devices via system provider |
| `edge_computing` | `llm_prompt` | Design edge computing architectures |
| `etl_pipelines` | `llm_prompt` | Design ETL/ELT pipelines between systems |
| `data_quality` | `llm_prompt` | Assess dataset quality (completeness, accuracy, consistency) |
| `schema_management` | `llm_prompt` | Design and evolve data schemas |

---

## Handler Types

### `llm_prompt`

Executes the skill by calling an LLM with a named prompt template. The template name maps to a pre-built system prompt and message format.

```javascript
// Manifest entry
{
  "type": "llm_prompt",
  "prompt_template": "lead_scoring",
  "fallback_type": null,
  "requires_nexus": false
}

// Handler call (simplified)
LLMPromptHandler.execute({
  skillKey: "lead_scoring",
  config: { prompt_template: "lead_scoring" },
  params: { lead_data: {...}, scoring_model: "BANT" },
  workspaceId: "..."
})
// → { success: true, data: { score: 72, reasoning: "..." } }
```

**When to use:** Analysis, content generation, advisory, classification, extraction — anything that maps cleanly to an LLM prompt.

---

### `nexus_provider`

Dispatches the skill to a connected Nexus local node via WebSocket. The node must be online and expose the required provider methods.

```javascript
// Manifest entry
{
  "type": "nexus_provider",
  "provider": "network",
  "methods": ["scanNetwork", "getNetworkInfo"],
  "requires_nexus": true,
  "fallback_type": "llm_prompt"
}

// Handler checks: wsConnections.has(workspaceId)
// If no Nexus node online → canExecute() returns false → fallback to llm_prompt
```

**When to use:** Skills that require local machine access — network scanning, system diagnostics, firewall introspection, DNS lookups.

---

### `integration`

Calls a third-party API through an integration provider module (CRM, helpdesk, ERP, accounting, calendar, social media, etc.).

```javascript
// Manifest entry
{
  "type": "integration",
  "integration_provider": "crm",
  "fallback_type": "llm_prompt",
  "requires_nexus": false
}

// IntegrationHandler routes to the 'crm' provider module
// If provider unavailable → canExecute() → false → fallback to llm_prompt
```

**When to use:** Actions that need to read/write data in connected third-party systems. Always define a `fallback_type: "llm_prompt"` so the skill degrades gracefully.

---

### `composite`

Executes a pipeline of other skills sequentially. Each step's output can be fed into the next step as input.

```javascript
// Manifest entry
{
  "type": "composite",
  "steps": [
    { "skill": "document_classification", "input_from": "context" },
    { "skill": "data_extraction", "input_from": "previous" },
    { "skill": "reconciliation", "input_from": "previous" }
  ],
  "fallback_type": "llm_prompt"
}

// CompositeHandler calls registry.execute() for each step in order
// Uses a lazy getter to avoid circular dependency (registry not yet final at init)
```

**When to use:** Multi-step workflows where intermediate results feed subsequent steps (e.g., invoice processing, financial reporting, competitive intelligence).

---

## Skill Resolution Priority

```
registry.resolve(skillKey, workspaceId)
  1. Workspace override cache (TTL 60s)
     key: "${workspaceId}:${skillKey}"
     → if found and not expired: merge override config over base config
  2. Global manifest entry
     → look up config in skill-handlers.json
     → look up handler by config.type
  3. Return null if not found (registry returns error result)
```

Overrides allow per-workspace customisation (e.g., different model or provider) without modifying the global manifest.

---

## Adding a Custom Skill

1. **Add an entry to `seeds/skill-handlers.json`:**
   ```json
   "my_custom_skill": {
     "type": "llm_prompt",
     "prompt_template": "my_custom_skill",
     "fallback_type": null,
     "requires_nexus": false,
     "params_schema": {
       "type": "object",
       "properties": {
         "input": { "type": "string", "description": "The main input" }
       },
       "required": ["input"]
     }
   }
   ```

2. **Add metadata to `seeds/agent-skills.json`:**
   ```json
   "my_custom_skill": {
     "name": "My Custom Skill",
     "description": "Short description for LLM tool injection",
     "category": "custom",
     "icon": "⚙️"
   }
   ```

3. **If using `llm_prompt` type:** create a prompt template file or register the template string in `LLMPromptHandler`.

4. **If using `nexus_provider` type:** ensure the provider and methods exist in the Nexus node's provider layer and set `requires_nexus: true`.

5. **If using `integration` type:** implement the provider module and register it in `IntegrationHandler`.

6. **Restart the server** (or call `registry.load()` again if hot-reload is supported). The manifest is loaded once at boot.

---

## Task↔Skill Matching

When the LLM router receives a task, it determines which skills to invoke via one of two paths:

### 1. Explicit `skill_key` in task metadata

If the task has `metadata.skill_key = "lead_scoring"`, the executor calls `registry.execute("lead_scoring", context)` directly.

### 2. LLM tool-use selection

Skills are injected as function definitions in the agent's system context via `getSkillTools(agentSkillKeys)`. The LLM selects which tool to call based on:
- The tool `description` (from `agent-skills.json`)
- The user's request
- The `params_schema` for argument validation

The tool call name is `skill_<key>` (e.g., `skill_lead_scoring`). The router strips the `skill_` prefix to get the registry key.

---

## Nexus Provider Integration

Skills with `requires_nexus: true` use `NexusProviderHandler`, which dispatches to local nodes via the `wsConnections` Map:

```
wsConnections: Map<workspaceId, WebSocket>
  ↓
NexusProviderHandler.execute(context)
  ├─ canExecute(): wsConnections.has(workspaceId) && ws.readyState === OPEN
  └─ Sends { type: "skill.execute", skillKey, provider, methods, params }
       → awaits { type: "skill.result", ... } response
```

The `wsConnections` Map is shared with the Nexus WebSocket server and updated via `setNexusWsConnections(map)` after the server is ready:

```javascript
// In server startup:
const registry = getSkillRegistry();
// After WebSocket server is ready:
setNexusWsConnections(wsServer.connections);
```
