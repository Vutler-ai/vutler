# Technology Stack Selection Guide

Framework for choosing technologies based on project needs, team capabilities, and long-term maintenance.

---

## Core Principles

### 1. Boring is Beautiful
Prefer proven, stable technologies over cutting-edge. Stability > novelty.

### 2. Team Expertise Matters More Than Tech Specs
A team productive in Technology A will outperform a struggling team using "better" Technology B.

### 3. Community & Ecosystem > Features
Strong community means better libraries, more Stack Overflow answers, easier hiring.

### 4. Total Cost of Ownership
Consider: licensing, hosting, developer time, training, maintenance, scaling costs.

### 5. Optimize for Change
Choose technologies that allow pivoting as requirements evolve.

---

## Decision Framework

### Step 1: Define Requirements

**Functional Requirements:**
- [ ] What does the system need to do?
- [ ] What are the performance targets?
- [ ] What scale are we targeting?

**Non-Functional Requirements:**
- [ ] Security & compliance needs
- [ ] Availability targets (SLA)
- [ ] Maintainability requirements
- [ ] Integration points

**Team Constraints:**
- [ ] Current expertise
- [ ] Learning capacity
- [ ] Team size
- [ ] Available time for onboarding

**Business Constraints:**
- [ ] Budget
- [ ] Timeline
- [ ] Vendor lock-in concerns
- [ ] Compliance requirements

---

### Step 2: Identify Candidates

List 2-4 viable options. More than 4 = analysis paralysis.

**For each candidate, ask:**
- Does it meet functional requirements?
- Can our team learn/use it effectively?
- Is the ecosystem healthy?
- What's the total cost?

---

### Step 3: Evaluate Against Criteria

| Criterion | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| **Functional fit** | High | Score 1-5 | Score 1-5 | Score 1-5 |
| **Team expertise** | High | Score 1-5 | Score 1-5 | Score 1-5 |
| **Community/ecosystem** | Medium | Score 1-5 | Score 1-5 | Score 1-5 |
| **Performance** | Medium | Score 1-5 | Score 1-5 | Score 1-5 |
| **Cost** | Medium | Score 1-5 | Score 1-5 | Score 1-5 |
| **Scalability** | Low | Score 1-5 | Score 1-5 | Score 1-5 |

**Adjust weights** based on project priorities.

---

### Step 4: Consider Long-Term Implications

**5-Year Test:**
- Will this technology still be supported in 5 years?
- Will we be able to hire developers with this skill?
- Can we migrate away if needed?

**Maintenance Burden:**
- How often does this require updates?
- What's the upgrade path complexity?
- How much operational overhead?

**Lock-In Risk:**
- Can we switch later if needed?
- What's the migration cost?
- Are we dependent on a single vendor?

---

## Technology Categories

### Frontend Framework

**Options:** React, Vue, Angular, Svelte, vanilla JS

**Decision Factors:**
- **React:** Largest ecosystem, most jobs, flexible, steep learning curve
- **Vue:** Easier learning curve, good docs, smaller ecosystem
- **Angular:** Enterprise-friendly, opinionated, heavyweight
- **Svelte:** Compile-time magic, small bundles, newer ecosystem
- **Vanilla JS:** No framework overhead, full control, more manual work

**Default recommendation:** React (unless team has strong preference/expertise elsewhere)

**Red flags:**
- Choosing framework for novelty
- Team has no JS experience but picking hardest option
- Over-engineering (simple site doesn't need React)

---

### Backend Framework

**Options:** Node.js (Express, Fastify), Python (Django, Flask, FastAPI), Ruby (Rails), Java (Spring), Go, Rust

**Decision Factors:**
- **Node.js:** JavaScript across stack, async I/O, fast iteration, callback hell risk
- **Python:** Great for data/ML, readable, slower than compiled languages
- **Ruby on Rails:** Convention over configuration, rapid prototyping, scaling concerns
- **Java/Spring:** Enterprise-grade, verbose, strong typing, heavy
- **Go:** Simple, fast, compiled, limited libraries compared to older languages
- **Rust:** Blazing fast, memory safe, steep learning curve

**Default recommendation:** 
- **Startups/MVPs:** Node.js or Python (FastAPI)
- **Enterprise:** Java/Spring or Go
- **High performance needs:** Go or Rust

**Red flags:**
- Choosing "because it's fast" without profiling
- Team has no experience but picking hardest language (Rust)
- Rewriting working system for framework hype

---

### Database

**Options:** PostgreSQL, MySQL, MongoDB, DynamoDB, Cassandra, Redis

**Decision Factors:**
- **PostgreSQL:** ACID, relational, JSON support, excellent for most use cases
- **MySQL:** Similar to Postgres, slightly different feature set
- **MongoDB:** Document store, schema flexibility, eventual consistency risks
- **DynamoDB:** Serverless, auto-scaling, vendor lock-in, NoSQL
- **Cassandra:** Distributed, high availability, operational complexity
- **Redis:** In-memory, caching, pub/sub, not durable by default

**Default recommendation:** PostgreSQL for transactional data, Redis for caching

**When to use NoSQL:**
- Schema is truly unpredictable (not just "we haven't designed it yet")
- Write-heavy workloads at massive scale
- Specific use case (time-series → InfluxDB, search → Elasticsearch)

**Red flags:**
- "NoSQL is web-scale" without understanding CAP theorem
- Choosing MongoDB to avoid learning SQL
- Using Redis as primary database

---

### Infrastructure/Cloud

**Options:** AWS, GCP, Azure, DigitalOcean, Heroku, Vercel, Railway

**Decision Factors:**
- **AWS:** Most mature, broadest services, steeper learning curve, pricey
- **GCP:** ML/data tools, Kubernetes-native, simpler pricing, smaller ecosystem
- **Azure:** Microsoft shop integration, enterprise contracts
- **DigitalOcean:** Simpler, cheaper, fewer services
- **Heroku:** Easiest, expensive at scale, limited customization
- **Vercel/Netlify:** JAMstack/frontend focus, serverless functions

**Default recommendation:**
- **Most projects:** AWS or GCP
- **Early-stage startups:** DigitalOcean or Railway (simplicity + cost)
- **Frontend-heavy:** Vercel or Netlify
- **Microsoft shops:** Azure

**Red flags:**
- Choosing cloud provider based on free tier without long-term cost analysis
- Using every service from the provider (tight coupling)
- Multi-cloud without strong justification (complexity > benefits)

---

### Hosting/Deployment

**Options:** Kubernetes, Docker Compose, Serverless (Lambda/Cloud Functions), VMs, PaaS (Heroku, Railway)

**Decision Factors:**
- **Kubernetes:** Complex, powerful, overkill for small teams
- **Docker Compose:** Simple, local dev parity, limited scaling
- **Serverless:** Auto-scaling, pay-per-use, cold starts, vendor lock-in
- **VMs:** Full control, manual setup, traditional ops burden
- **PaaS:** Fast setup, less control, scaling costs

**Default recommendation:**
- **Small teams (<5 devs):** PaaS or Serverless
- **Medium teams (5-20 devs):** Docker + managed orchestration
- **Large teams (20+ devs):** Kubernetes (with dedicated platform team)

**Red flags:**
- Kubernetes for a team of 2 developers
- No containerization strategy
- Serverless for long-running workloads

---

## Common Scenarios

### Scenario 1: Startup MVP

**Context:** 2-person team, 3-month deadline, need to iterate fast

**Recommendation:**
- **Frontend:** React + Vercel (fast deploys, free tier)
- **Backend:** Node.js + Express or Python + FastAPI
- **Database:** PostgreSQL (managed via Supabase or Railway)
- **Auth:** Auth0 or Clerk (don't build auth yourself)
- **Hosting:** Vercel/Netlify frontend, Railway/Render backend

**Rationale:** Speed to market > scalability. Use managed services. Avoid operational overhead.

---

### Scenario 2: Enterprise SaaS

**Context:** 10-person team, compliance requirements, 100k+ users expected

**Recommendation:**
- **Frontend:** React + TypeScript
- **Backend:** Node.js or Go, microservices if org structure demands
- **Database:** PostgreSQL (with read replicas)
- **Infrastructure:** AWS or GCP (whichever has enterprise contract)
- **Deployment:** Kubernetes (with dedicated platform engineers)
- **Observability:** Datadog or New Relic

**Rationale:** Reliability, compliance, team scaling. Worth the operational complexity.

---

### Scenario 3: Data-Heavy Analytics Platform

**Context:** 5-person team, ingesting millions of events/day, complex queries

**Recommendation:**
- **Frontend:** React or Vue
- **Backend:** Python (FastAPI) for API layer
- **Database:** PostgreSQL for transactional data
- **Analytics Database:** ClickHouse or BigQuery
- **Data Pipeline:** Apache Airflow or Dagster
- **Storage:** S3/GCS for raw data lake

**Rationale:** Optimize for data processing and query performance. Python ecosystem for data tooling.

---

### Scenario 4: Real-Time Collaborative App

**Context:** 4-person team, need low-latency updates, websockets

**Recommendation:**
- **Frontend:** React
- **Backend:** Node.js (WebSocket support)
- **Real-time:** Socket.io or native WebSockets
- **Database:** PostgreSQL + Redis (Pub/Sub)
- **Infrastructure:** Railway or AWS with load balancer sticky sessions

**Rationale:** Node.js + WebSockets is natural fit. Redis Pub/Sub for scaling real-time.

---

## Red Flags Checklist

- [ ] **Resume-Driven Development:** Choosing tech to learn, not to solve problem
- [ ] **Hype-Driven:** "Everyone's using X, so should we"
- [ ] **Over-Engineering:** Kubernetes for a blog
- [ ] **Under-Engineering:** No database, just JSON files (for production app)
- [ ] **Technology Mismatch:** Using screwdriver for a nail
- [ ] **Ignoring Team:** Choosing tech team doesn't know without training plan
- [ ] **Vendor Lock-In Blindness:** Not considering exit strategy
- [ ] **Premature Optimization:** Designing for 1M users when you have 0

---

## Decision Documentation

Every technology choice should be documented in an ADR (Architecture Decision Record).

**Minimum information:**
- What we chose
- What alternatives we considered
- Why we chose this option
- When to revisit (conditions or timeline)

**See:** `templates/adr-template.md`

---

## When to Revisit Technology Choices

**Trigger conditions:**
- Team expertise has changed significantly
- Technology is no longer maintained/supported
- Performance/scalability limits are reached
- Cost has become prohibitive
- Better option with clear migration path emerges
- Compliance requirements change

**Regular reviews:**
- Annually for core stack
- Quarterly for libraries/dependencies

---

## Key Takeaways

1. **Boring technology wins** - Proven > exciting
2. **Team expertise matters most** - Productive team > "best" tech
3. **Start simple, evolve** - Don't over-engineer for hypothetical scale
4. **Document decisions** - Future you will thank you
5. **Total cost includes time** - Developer productivity is expensive
6. **Community = insurance** - Strong ecosystem reduces risk
