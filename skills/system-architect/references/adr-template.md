# ADR-XXX: [Short Title of Decision]

**Date:** [YYYY-MM-DD]  
**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-YYY]  
**Deciders:** [List people involved in decision]  
**Tags:** [database, infrastructure, frontend, etc.]

---

## Context and Problem Statement

[Describe the context and problem forcing this decision. What challenge or question are we addressing? What are the driving forces behind this decision?]

**Example:**
> We need to choose a primary database for our application. The system will handle user profiles, orders, and product catalogs. We expect 100k users in year 1, with potential to scale to 1M+ users.

---

## Decision Drivers

[What factors influence this decision? List the key requirements, constraints, and priorities.]

- [Driver 1: e.g., "Must support complex relational queries"]
- [Driver 2: e.g., "Team has strong PostgreSQL experience"]
- [Driver 3: e.g., "Need ACID guarantees for financial transactions"]
- [Driver 4: e.g., "Budget constraints: prefer open-source"]
- [Driver 5: e.g., "Must integrate with existing AWS infrastructure"]

---

## Considered Options

### Option 1: [Name of Option]

**Description:**  
[Brief description of this option]

**Pros:**
- ✅ [Pro 1]
- ✅ [Pro 2]
- ✅ [Pro 3]

**Cons:**
- ❌ [Con 1]
- ❌ [Con 2]
- ❌ [Con 3]

**Cost:** [Estimated cost: free, $X/month, etc.]  
**Risk:** [Low / Medium / High]  
**Team Familiarity:** [Low / Medium / High]

---

### Option 2: [Name of Option]

**Description:**  
[Brief description of this option]

**Pros:**
- ✅ [Pro 1]
- ✅ [Pro 2]

**Cons:**
- ❌ [Con 1]
- ❌ [Con 2]

**Cost:** [Estimated cost]  
**Risk:** [Low / Medium / High]  
**Team Familiarity:** [Low / Medium / High]

---

### Option 3: [Name of Option]

[Repeat format for each option considered]

---

## Decision Outcome

**Chosen option:** [Option X]

**Rationale:**  
[Explain WHY this option was chosen. Reference decision drivers and how this option addresses them better than alternatives.]

**Example:**
> We chose PostgreSQL because:
> 1. Our data is highly relational (users ↔ orders ↔ products)
> 2. Team has 5+ years of PostgreSQL experience
> 3. ACID guarantees are critical for payments
> 4. Open-source with strong AWS RDS support
> 5. Performance benchmarks show it handles our projected scale

**Expected Outcomes:**
- [Positive outcome 1: e.g., "Faster development due to team familiarity"]
- [Positive outcome 2: e.g., "Reliable transaction handling"]
- [Positive outcome 3: e.g., "Cost-effective scaling with RDS read replicas"]

**Trade-offs Accepted:**
- [Trade-off 1: e.g., "Less flexible than NoSQL for schema evolution"]
- [Trade-off 2: e.g., "Vertical scaling limits compared to distributed databases"]

---

## Consequences

### Positive Consequences

- [Positive 1: e.g., "Faster onboarding for new engineers (familiar tech)"]
- [Positive 2: e.g., "Strong ecosystem for monitoring and tooling"]
- [Positive 3: e.g., "Built-in support for full-text search"]

### Negative Consequences

- [Negative 1: e.g., "May need to re-evaluate if we hit 10M+ users"]
- [Negative 2: e.g., "JSON querying less performant than MongoDB"]

### Mitigation of Negative Consequences

- [Mitigation 1: e.g., "Plan for sharding or migration to distributed DB if we hit scale limits"]
- [Mitigation 2: e.g., "Use JSONB columns sparingly, denormalize where needed"]

---

## Implementation Plan

**Next Steps:**
1. [Step 1: e.g., "Set up PostgreSQL instance on AWS RDS"]
2. [Step 2: e.g., "Define initial schema and migrations"]
3. [Step 3: e.g., "Configure backup and monitoring"]
4. [Step 4: e.g., "Document connection pooling strategy"]

**Timeline:** [When will this be implemented?]  
**Owner:** [Who is responsible for implementation?]

**Validation:**
- [How we'll validate this decision was correct: performance benchmarks, team velocity, etc.]

---

## Related Decisions

- [ADR-XXX: Link to related decision]
- [ADR-YYY: Another related decision]

---

## References

- [Link to research, benchmarks, blog posts, documentation]
- [Another reference]

---

## Notes

[Any additional context, discussions, or thoughts that don't fit above]

---

## Example ADR: Use PostgreSQL for Primary Database

**Date:** 2025-01-15  
**Status:** Accepted  
**Deciders:** Mike (Architect), Luna (PM), Backend Team  
**Tags:** database, infrastructure

### Context and Problem Statement

We need to choose a primary database for our SaaS application. The system will handle user profiles, subscriptions, and product usage data. We expect 50k users in year 1, growing to 500k+ within 3 years. Data is primarily relational (users have subscriptions, usage events, billing history).

### Decision Drivers

- Must support complex relational queries (JOIN across users, subscriptions, events)
- ACID guarantees required for billing transactions
- Team has strong PostgreSQL and MySQL experience, limited NoSQL experience
- Need robust backup/recovery for production data
- Budget-conscious: prefer open-source with managed service option
- Must integrate with AWS infrastructure (current hosting)

### Considered Options

#### Option 1: PostgreSQL (AWS RDS)

**Pros:**
- ✅ Excellent for relational data with complex queries
- ✅ Team has 5+ years PostgreSQL experience
- ✅ ACID compliant, strong consistency guarantees
- ✅ Rich ecosystem (extensions, full-text search, JSONB)
- ✅ AWS RDS provides managed backups, monitoring, read replicas
- ✅ Open-source, no licensing costs

**Cons:**
- ❌ Vertical scaling limits (need to plan for sharding at 10M+ records)
- ❌ Less flexible schema evolution than NoSQL

**Cost:** ~$200-500/month for production RDS instance  
**Risk:** Low  
**Team Familiarity:** High

#### Option 2: MongoDB (Atlas)

**Pros:**
- ✅ Flexible schema, easy to evolve data model
- ✅ Horizontal scaling with sharding built-in
- ✅ Fast for document-oriented queries

**Cons:**
- ❌ Team has limited MongoDB experience (learning curve)
- ❌ Weak consistency by default (eventual consistency)
- ❌ Complex queries (JOINs) are harder and less performant
- ❌ Not ideal for financial transactions (billing)

**Cost:** ~$300-600/month for Atlas  
**Risk:** Medium (team unfamiliarity, consistency concerns)  
**Team Familiarity:** Low

#### Option 3: MySQL (AWS RDS)

**Pros:**
- ✅ Strong relational support
- ✅ Team has MySQL experience
- ✅ Good AWS RDS support
- ✅ ACID compliant

**Cons:**
- ❌ Less feature-rich than PostgreSQL (no JSONB, weaker full-text search)
- ❌ PostgreSQL has better geospatial and advanced data type support
- ❌ Slightly less vibrant ecosystem than PostgreSQL

**Cost:** ~$200-500/month  
**Risk:** Low  
**Team Familiarity:** High

### Decision Outcome

**Chosen option:** PostgreSQL (AWS RDS)

**Rationale:**
1. **Relational data model:** Our data is highly relational (users ↔ subscriptions ↔ events ↔ billing)
2. **Team expertise:** 5+ years PostgreSQL experience = faster development, fewer bugs
3. **ACID guarantees:** Critical for billing and financial transactions
4. **Feature-rich:** JSONB for flexible fields, full-text search, GIS extensions if needed
5. **Cost-effective:** Open-source with solid AWS RDS managed service
6. **Proven at scale:** Many companies run PostgreSQL at 100M+ records

**Expected Outcomes:**
- Faster development (no learning curve)
- Reliable transaction handling for billing
- Easy integration with existing AWS services
- Strong monitoring and backup capabilities via RDS

**Trade-offs Accepted:**
- Schema changes require migrations (less flexible than NoSQL)
- Vertical scaling limits (but sufficient for projected scale; can shard if needed later)

### Consequences

**Positive:**
- Fast onboarding for new engineers (widely known technology)
- Strong tooling ecosystem (ORMs, migration tools, monitoring)
- JSONB allows semi-structured data where needed
- RDS handles backups, patching, read replicas automatically

**Negative:**
- If we hit 10M+ users, may need to evaluate sharding or distributed database
- Schema evolution requires planning (not as flexible as schemaless DBs)

**Mitigation:**
- Monitor database size and query performance; plan migration to sharded setup or distributed DB (e.g., CockroachDB) if we approach scale limits
- Use JSONB columns for non-critical flexible data, but keep core schema relational

### Implementation Plan

1. Provision PostgreSQL 14 instance on AWS RDS (Multi-AZ for HA)
2. Set up schema migrations with Prisma/TypeORM
3. Configure automated backups (daily snapshots, 7-day retention)
4. Set up read replicas for analytics queries
5. Integrate with Datadog for monitoring

**Timeline:** Week 1 of implementation sprint  
**Owner:** Mike (Backend Lead)

**Validation:**
- Measure query performance under load (target: p95 < 50ms)
- Track team velocity (should maintain or increase due to familiarity)
- Monitor database costs vs. projections

### Related Decisions

- ADR-002: Use Prisma for ORM (leverages PostgreSQL strengths)
- ADR-005: Use Redis for caching (offload read-heavy queries)

### References

- [PostgreSQL vs. MongoDB: When to Use Each](https://www.mongodb.com/compare/mongodb-postgresql)
- [AWS RDS PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [PostgreSQL Performance at Scale](https://www.postgresql.org/docs/current/performance-tips.html)
