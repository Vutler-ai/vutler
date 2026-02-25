# Sprint 9 (Backlog) — Agent Templates Marketplace

**Priority:** P1 — Right after n8n integration
**Source:** github.com/Shubhamsaboo/awesome-llm-apps (47k ⭐, open source)
**Goal:** 20+ ready-to-deploy agent templates in Vutler Marketplace

## Template Format (Vutler Standard)
```yaml
# template.vutler.yaml
name: "Data Analyst"
description: "Analyze datasets, generate reports, create visualizations"
category: "analytics"
icon: "📊"
author: "Vutler"
license: "MIT"
version: "1.0.0"
tags: ["data", "analytics", "reporting", "charts"]
llm:
  provider: "openai"
  model: "gpt-4o"
  fallback: "claude-sonnet"
system_prompt: |
  You are a data analyst agent...
integrations:
  - drive (read CSV/Excel)
  - email (send reports)
tools:
  - python_executor
  - chart_generator
config:
  temperature: 0.3
  max_tokens: 4096
```

## Wave 1 — Core Templates (10 agents)

| # | Template | Source | Category | Priority |
|---|----------|--------|----------|----------|
| 1 | **Customer Support** | ai_customer_support_agent | Support | P0 |
| 2 | **Data Analyst** | ai_data_analysis_agent | Analytics | P0 |
| 3 | **Email Manager** | ai_email_agent | Productivity | P0 |
| 4 | **Research Assistant** | ai_research_agent | Research | P0 |
| 5 | **Content Writer** | ai_blog_to_podcast_agent | Content | P1 |
| 6 | **Sales Assistant** | ai_shopping_agent | Sales | P1 |
| 7 | **Finance Tracker** | ai_finance_agent | Finance | P1 |
| 8 | **Code Reviewer** | ai_code_review_agent | Engineering | P1 |
| 9 | **Social Media Manager** | - | Marketing | P2 |
| 10 | **Meeting Summarizer** | - | Productivity | P2 |

## Wave 2 — Vertical Templates (10 agents)

| # | Template | Category |
|---|----------|----------|
| 11 | **Legal Document Analyzer** | Legal |
| 12 | **HR Recruiter** | HR |
| 13 | **Medical Triage** | Healthcare |
| 14 | **Real Estate Agent** | Real Estate |
| 15 | **Travel Planner** | Travel |
| 16 | **Education Tutor** | Education |
| 17 | **DevOps Monitor** | Engineering |
| 18 | **Compliance Checker** | Legal/Finance |
| 19 | **Inventory Manager** | Operations |
| 20 | **Newsletter Curator** | Content |

## Stories

### Story 9.1: Template Schema & Registry (3 pts)
- Define `template.vutler.yaml` schema
- PostgreSQL table `agent_templates` (name, config, category, downloads, rating)
- API: GET /api/v1/templates, POST /api/v1/templates/install
- Seed with Wave 1 templates

### Story 9.2: Port 10 Templates from awesome-llm-apps (5 pts)
- Clone repo, extract system prompts + tool configs
- Adapt to Vutler template format
- Test each with Vutler API
- Write descriptions + icons

### Story 9.3: Marketplace UI (3 pts)
- Grid view with search, filter by category
- Template detail page (description, preview, install button)
- "Installed" badge for active templates
- Rating/review system (later)

### Story 9.4: One-Click Deploy (3 pts)
- Install template → creates agent with pre-configured prompt + integrations
- User can customize before deploying
- Track installs per template (analytics)

### Story 9.5: Community Submissions (2 pts)
- Submit template form (later: GitHub PR flow)
- Review/approve workflow
- "Community" vs "Official" badges

## Competitive Advantage
- **GPTs Store** (OpenAI) → locked to OpenAI models
- **Vutler Marketplace** → any LLM, self-hosted, open source templates
- Fork advantage: users can modify templates, not just use them
