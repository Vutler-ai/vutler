# ADR-002: PostgreSQL as Primary Database

**Status:** Accepted  
**Date:** 2026-02-16  
**Deciders:** Alex Lopez, Architecture Team  
**Technical Story:** Vutler database strategy

---

## Context

Rocket.Chat originally uses MongoDB as its primary database. For Vutler, we need to choose:
1. Keep MongoDB (maintain compatibility with Rocket.Chat)
2. Migrate fully to PostgreSQL (align with Vaultbrix)
3. Use both (dual database strategy)

**Requirements:**
- **Vaultbrix integration**: Starbox uses Vaultbrix (PostgreSQL, Supabase-compatible) as standard database
- **Relational data**: Agents, channels, messages have clear relationships (many-to-many, foreign keys)
- **ACID guarantees**: Message ordering, transactional consistency critical
- **Query flexibility**: Complex joins (agent ↔ channels ↔ messages)
- **Team expertise**: AI agents and Alex have PostgreSQL experience

**Constraints:**
- Rocket.Chat codebase assumes MongoDB (Meteor Collections)
- Migration effort required
- Must not block 2-month MVP timeline

---

## Decision

**We will use PostgreSQL (Vaultbrix) as the primary database**, with MongoDB as optional fallback during transition.

---

## Options Considered

### Option 1: Keep MongoDB (Minimal Change)

**Description:**  
Maintain Rocket.Chat's MongoDB setup, use MongoDB for all data.

**Pros:**
- ✅ **Zero migration effort**: Rocket.Chat works out of the box
- ✅ **Proven compatibility**: No Meteor adapter issues
- ✅ **Fast to MVP**: No database refactor needed

**Cons:**
- ❌ **Misalignment with Vaultbrix**: Starbox standard is PostgreSQL
- ❌ **Limited relational queries**: MongoDB joins are inefficient
- ❌ **No ACID across collections**: Potential consistency issues
- ❌ **Team preference**: Team prefers SQL for structured data
- ❌ **Vaultbrix features unavailable**: Row-level security, PostgREST, Supabase tooling

**Estimated Effort:** Low (no change)  
**Risk Level:** Low (proven), but strategic misalignment

---

### Option 2: Full PostgreSQL Migration

**Description:**  
Replace MongoDB with PostgreSQL using Meteor's `simpl-schema` + PostgreSQL adapter, or custom data layer.

**Pros:**
- ✅ **Vaultbrix alignment**: One database, standard Starbox stack
- ✅ **Relational power**: Clean joins, foreign keys, constraints
- ✅ **ACID transactions**: Consistency guarantees
- ✅ **Team expertise**: AI agents and Alex know PostgreSQL
- ✅ **SQL tooling**: pgAdmin, Supabase Studio, better debugging

**Cons:**
- ❌ **Migration effort**: Rewrite Meteor Collections to use PostgreSQL
- ❌ **Meteor compatibility**: Meteor's MongoDB adapter is first-class; PostgreSQL support via `ostrio:meteor-pg` is less mature
- ❌ **Timeline risk**: Could delay MVP if migration is complex
- ❌ **Potential bugs**: Untested with Rocket.Chat's data patterns

**Estimated Effort:** Medium-High (2-3 weeks for migration + testing)  
**Risk Level:** Medium (technical unknowns)

---

### Option 3: Dual Database (Hybrid)

**Description:**  
Keep MongoDB for Rocket.Chat core, add PostgreSQL for Vutler-specific features (agent data, email accounts, Snipara integration).

**Pros:**
- ✅ **Low risk**: Rocket.Chat core unchanged
- ✅ **Vaultbrix integration**: Use PostgreSQL for new features
- ✅ **Incremental migration**: Can move collections over time

**Cons:**
- ❌ **Complexity**: Two databases to manage, sync, backup
- ❌ **Data duplication**: Agent data might live in both
- ❌ **Transaction boundaries**: Can't have atomic ops across MongoDB + PostgreSQL
- ❌ **Operational overhead**: More moving parts

**Estimated Effort:** Medium (1-2 weeks setup)  
**Risk Level:** Medium (operational complexity)

---

### Option 4: PostgreSQL with MongoDB Adapter Layer

**Description:**  
Use PostgreSQL as storage, but keep Meteor's MongoDB API via abstraction layer (e.g., `pg-mongo` or custom ORM).

**Pros:**
- ✅ **Best of both**: PostgreSQL storage, minimal code changes
- ✅ **Vaultbrix alignment**: Single PostgreSQL database

**Cons:**
- ❌ **Adapter complexity**: Need to build/maintain adapter
- ❌ **Performance**: Extra translation layer
- ❌ **Maturity**: No proven adapter for Meteor + PostgreSQL at scale

**Estimated Effort:** High (3-4 weeks to build/test adapter)  
**Risk Level:** High (unproven approach)

---

## Decision Rationale

**Key Criteria:**

1. **Vaultbrix alignment (Weight: HIGH)**
   - **PostgreSQL (Option 2)**: ✅ Perfect alignment
   - **MongoDB (Option 1)**: ❌ Requires separate infrastructure
   - **Dual (Option 3)**: ⚠️ Partial alignment
   - **Adapter (Option 4)**: ✅ Alignment, but complex

2. **Development velocity (Weight: CRITICAL for MVP)**
   - **PostgreSQL (Option 2)**: ⚠️ Migration effort (2-3 weeks)
   - **MongoDB (Option 1)**: ✅ Zero effort
   - **Dual (Option 3)**: ⚠️ Moderate effort (1-2 weeks)
   - **Adapter (Option 4)**: ❌ High effort (3-4 weeks)

3. **Data model fit (Weight: HIGH)**
   - **PostgreSQL (Option 2)**: ✅ Relational model perfect for agents/channels/messages
   - **MongoDB (Option 1)**: ⚠️ Works, but joins are inefficient
   - **Dual (Option 3)**: ⚠️ Split brain (which data where?)
   - **Adapter (Option 4)**: ✅ Same as PostgreSQL

4. **Long-term maintainability (Weight: HIGH)**
   - **PostgreSQL (Option 2)**: ✅ Single source of truth, standard stack
   - **MongoDB (Option 1)**: ❌ Diverges from Starbox standards
   - **Dual (Option 3)**: ❌ Operational complexity
   - **Adapter (Option 4)**: ❌ Custom code to maintain

5. **Risk (Weight: CRITICAL)**
   - **PostgreSQL (Option 2)**: ⚠️ Medium (migration complexity)
   - **MongoDB (Option 1)**: ✅ Low (proven)
   - **Dual (Option 3)**: ⚠️ Medium (operational)
   - **Adapter (Option 4)**: ❌ High (unproven)

**Decision:**

**Full PostgreSQL migration (Option 2)** wins on strategic alignment and long-term value, despite the migration effort. Here's the plan to mitigate timeline risk:

1. **Week 1**: Keep MongoDB running alongside PostgreSQL (dual mode)
2. **Week 2-3**: Migrate core collections (agents, channels, messages) to PostgreSQL
3. **Week 4**: Test thoroughly, fix migration bugs
4. **Week 5+**: Deprecate MongoDB for Vutler (keep as optional fallback)

**Why not Option 1 (MongoDB)?**
While it's the fastest path to MVP, it creates strategic debt:
- Vaultbrix features (Supabase Studio, PostgREST, row-level security) unavailable
- Starbox standard is PostgreSQL; MongoDB is an outlier
- Future integrations (reporting, analytics) are easier with SQL

**Why not Option 3 (Dual)?**
Operational complexity isn't worth it. We'd have to:
- Backup/restore two databases
- Sync data between them (consistency nightmare)
- Decide "which data goes where" for every feature

**Why not Option 4 (Adapter)?**
Building a custom adapter is a 4-week project on its own. Not viable for 2-month MVP.

**Migration strategy:**

We'll use **Meteor's simplSchema + custom PostgreSQL layer** instead of Meteor's MongoDB Collections. This means:
- Define schemas with TypeScript types
- Use a thin ORM (e.g., Prisma or Kysely) for PostgreSQL
- Refactor Meteor Methods to call ORM instead of `Collection.insert/update`

This is a **2-3 week effort**, acceptable for a 2-month MVP given the strategic benefits.

---

## Consequences

### Positive
- ✅ **Vaultbrix alignment**: Single PostgreSQL database, Supabase tooling available
- ✅ **Relational power**: Clean foreign keys (agent ↔ channels ↔ messages)
- ✅ **ACID transactions**: Consistent message ordering, no race conditions
- ✅ **SQL queries**: Complex queries (e.g., "agents in channel X who sent messages today") are simple
- ✅ **Starbox standard**: Aligns with rest of Starbox infrastructure
- ✅ **Future-proof**: Easier to add features (analytics, reporting, row-level security)

### Negative
- ⚠️ **Migration effort**: 2-3 weeks to refactor Meteor Collections to PostgreSQL
- ⚠️ **Meteor compatibility**: Meteor's PostgreSQL support is less mature than MongoDB
- ⚠️ **Potential bugs**: Migration bugs could delay MVP
- ⚠️ **Learning curve**: AI agents must learn PostgreSQL + ORM patterns

### Neutral
- ℹ️ **MongoDB as fallback**: Keep MongoDB in Docker Compose for first 4 weeks as safety net
- ℹ️ **ORM choice**: Will evaluate Prisma vs Kysely in Week 1 (see ADR-005)
- ℹ️ **Vaultbrix features**: Row-level security, PostgREST deferred to post-MVP

---

## Implementation Plan

**Phase 1: Setup (Week 1)**
- [ ] Add PostgreSQL to Docker Compose (Vaultbrix image)
- [ ] Install ORM (Prisma or Kysely)
- [ ] Define schemas for core entities (Agent, Channel, Message)
- [ ] Keep MongoDB running (dual mode)

**Phase 2: Migration (Weeks 2-3)**
- [ ] Refactor Meteor Collections to use PostgreSQL ORM
  - [ ] Agents collection → `agents` table
  - [ ] Channels collection → `channels` table
  - [ ] Messages collection → `messages` table
  - [ ] File metadata → `files` table
- [ ] Update Meteor Methods (e.g., `sendMessage` → ORM insert)
- [ ] Update DDP publications (read from PostgreSQL)
- [ ] Migrate existing data (if any) from MongoDB → PostgreSQL

**Phase 3: Testing (Week 4)**
- [ ] Integration tests (CRUD operations via API)
- [ ] Load test (1,000 messages, check latency)
- [ ] Verify real-time (DDP subscriptions work with PostgreSQL)

**Phase 4: Deprecation (Week 5+)**
- [ ] Remove MongoDB from production deployment
- [ ] Keep MongoDB as optional local dev environment

**Timeline:** 4 weeks (overlaps with feature development)  
**Owner:** AI agents + Alex

---

## Validation & Success Criteria

**How we'll know this was the right decision:**

1. **Migration completes in 3 weeks**: No timeline slip
2. **API latency unchanged**: PostgreSQL is as fast as MongoDB for our queries (< 200ms p95)
3. **Vaultbrix features work**: Can use Supabase Studio to inspect data
4. **No data loss**: All messages, agents, channels persisted correctly
5. **Team productivity**: AI agents can work with PostgreSQL + ORM efficiently

**When to revisit this decision:**

- **If** migration takes > 3 weeks → Revert to MongoDB, defer PostgreSQL to post-MVP
- **If** PostgreSQL performance is worse than MongoDB → Optimize queries, add indexes, or revert
- **After** MVP: Evaluate if dual database (MongoDB + PostgreSQL) makes sense for specific use cases

**Rollback plan:**
Keep MongoDB in Docker Compose for first 4 weeks. If PostgreSQL migration fails, switch back to MongoDB and ship MVP with MongoDB.

---

## References

- [Meteor PostgreSQL Support (ostrio:meteor-pg)](https://github.com/VeliovGroup/ostrio-neo4jdriver)
- [Prisma ORM](https://www.prisma.io/)
- [Kysely (Type-safe SQL)](https://github.com/koskimas/kysely)
- [Vaultbrix PostgreSQL](https://vaultbrix.starbox.ai)
- [Supabase (Postgres-as-a-service)](https://supabase.com)

---

## Notes

**Why not just use Supabase directly?**
Vaultbrix is Supabase-compatible but self-hosted. We get the same features (PostgREST, row-level security) without vendor lock-in.

**Schema design:**
We'll follow PostgreSQL best practices:
- `snake_case` for table/column names (e.g., `created_at`, `agent_id`)
- Foreign keys with cascading deletes (e.g., delete agent → delete their messages)
- Indexes on commonly queried columns (e.g., `messages(channel_id, timestamp)`)

**Migration script:**
We'll write a one-time migration script to copy data from MongoDB → PostgreSQL if we have test data in MongoDB during development.

**ORM vs raw SQL:**
We'll use an ORM (Prisma or Kysely) for:
- Type safety (auto-generated TypeScript types)
- Migration management (schema versioning)
- Query builder (avoid raw SQL injection risks)

For complex queries, we'll use raw SQL with parameterized queries.
