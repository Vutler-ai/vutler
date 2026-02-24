# ADR-001 — Vutler Unified Tri-Product Architecture

| Field       | Value                        |
|-------------|------------------------------|
| **Status**  | ✅ Accepted                  |
| **Date**    | 2026-02-17                   |
| **Deciders**| Starbox core team            |
| **Sprint**  | Integration: Sprint 5 & 6    |

---

## Context

Vutler is Starbox's AI office platform — a workspace where agents, humans, and clients collaborate. As the product matures, we need a principled answer to three infrastructure questions:

1. **Where does identity and communication live?**
2. **Where does Vutler-native business data live?**
3. **Where does agent memory, context, and coordination live?**

The naive answer is "one database, one service." The Starbox answer is different: we already build the best-in-class tools for each of these concerns. We should use them.

This ADR formalises that decision.

---

## Decision

Vutler is built on a **tri-product architecture**, one product per responsibility layer:

---

### 1. Rocket.Chat (MongoDB) — Identity & Communication

**Rocket.Chat is the single source of truth for users, auth, and chat.**

- All authentication is handled by Rocket.Chat. There is no separate auth system.
- User accounts, sessions, and tokens are managed entirely within RC.
- Chat channels, direct messages, and rooms are RC-native.
- Roles and permissions are managed in RC. A dedicated `workspace-admin` role grants admin-level access within Vutler.
- The Vutler Admin API authenticates **via RC tokens** — it trusts the RC session, not a parallel credential store.
- RC data (users, rooms, messages) stays in **MongoDB** — we do not replicate or shadow it elsewhere.

**Why RC:** It is a Starbox product. It is production-hardened for real-time messaging and auth. Using it here is dogfooding by design.

---

### 2. Vaultbrix (PostgreSQL) — Vutler Business Data

**Vaultbrix holds all data that Vutler generates beyond the chat layer.**

Vaultbrix is the structured, relational vault for Vutler's operational data:

| Domain                  | Owner      |
|-------------------------|------------|
| LLM configs per agent   | Vaultbrix  |
| Token usage & metering  | Vaultbrix  |
| Billing records         | Vaultbrix  |
| Templates marketplace   | Vaultbrix  |
| Analytics & audit logs  | Vaultbrix  |
| Multi-tenant client data| Vaultbrix  |
| RC users / messages     | ❌ MongoDB only |

**Key constraint:** RC core data does **not** move to Vaultbrix. The boundary is clear — if it was created by Rocket.Chat, it lives in MongoDB. If Vutler created it on top of RC, it lives in Vaultbrix.

**Why Vaultbrix:** Another Starbox product. Structured, auditable, multi-tenant-ready. PostgreSQL gives us strong relational guarantees for billing and compliance data.

---

### 3. Snipara (SaaS, on-demand) — Agent Brain

**Snipara provides agent memory, context storage, and swarm coordination.**

- Every Vutler workspace **automatically provisions a Snipara project** on creation via the Snipara API. No manual setup.
- Snipara is **included in Vutler's pricing tiers**:

  | Vutler Plan | Snipara Tier    |
  |-------------|-----------------|
  | Free        | Snipara Free    |
  | Pro         | Snipara Pro     |
  | Enterprise  | Snipara Enterprise |

- Agents use Snipara natively for memory, retrieval, and swarm coordination (via `rlm_remember`, `rlm_context_query`, swarm tools, etc.).
- **No self-hosted Snipara is required.** The managed SaaS handles it.
- Snipara data belongs to the workspace — provisioned per-tenant, isolated.

**Why Snipara:** It is the Starbox brain product, purpose-built for agent memory and multi-agent coordination. Embedding it into Vutler completes the Starbox loop.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        VUTLER WORKSPACE                     │
│                                                             │
│   ┌───────────────┐   ┌────────────────┐   ┌────────────┐  │
│   │  Rocket.Chat  │   │   Vaultbrix    │   │  Snipara   │  │
│   │  (MongoDB)    │   │  (PostgreSQL)  │   │   (SaaS)   │  │
│   │               │   │                │   │            │  │
│   │ • Auth/Users  │   │ • LLM configs  │   │ • Memory   │  │
│   │ • Chat/Rooms  │   │ • Billing      │   │ • Context  │  │
│   │ • Roles       │   │ • Metering     │   │ • Swarm    │  │
│   │ • RC tokens   │   │ • Templates    │   │   coord.   │  │
│   │               │   │ • Analytics    │   │            │  │
│   │               │   │ • Audit logs   │   │            │  │
│   │               │   │ • Tenant data  │   │            │  │
│   └───────┬───────┘   └───────┬────────┘   └─────┬──────┘  │
│           │                   │                   │         │
│           └───────────────────┴───────────────────┘         │
│                         Vutler API                          │
│                   (authenticates via RC tokens)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Rationale

**Dogfooding as strategy.** Each layer of Vutler's stack is a Starbox product:

- **Vutler** = the office
- **Vaultbrix** = the vault
- **Snipara** = the brain

This is not convenience — it is intentional product reinforcement. Every Vutler deployment validates Vaultbrix and Snipara in production. Every bug we find, we fix for all users. Every feature we need, we build into the platform.

**Single auth, no duplication.** RC tokens are the credential. The Vutler API trusts them. There is no separate user table, no shadow accounts, no sync jobs. Identity is owned by RC, consumed by everything else.

**Clear data ownership.** The boundary between MongoDB (RC-native) and PostgreSQL (Vutler-native) is explicit. This avoids the sprawl of having one database that "also stores some chat stuff" or one API that "also manages users." Each system owns its domain completely.

---

## Consequences

### Positive

- No auth system to build or maintain — RC handles it
- Vaultbrix and Snipara get real production workloads from day one
- Clean separation of concerns across all three data stores
- Pricing tiers map cleanly to Snipara tiers — simple to reason about
- `workspace-admin` role in RC provides a single, auditable admin access path

### Negative / Trade-offs

- **Operational complexity:** Three systems to deploy, monitor, and upgrade
- **Snipara dependency:** If Snipara SaaS is unavailable, agent memory/context degrades
- **RC coupling:** Auth is fully delegated to RC — migrating away from RC later would require an auth migration
- **Cross-system queries:** Analytics spanning chat (MongoDB) and billing (PostgreSQL) require an aggregation layer or ETL

### Mitigations

- Snipara outage → agents fall back to stateless mode; memory resumes on recovery
- RC coupling is intentional and accepted as a design constraint for this product line
- Cross-system analytics can be addressed in a future ADR (e.g., read replicas, event streaming)

---

## Integration Timeline

| Sprint   | Milestone                                              |
|----------|--------------------------------------------------------|
| Sprint 5 | Vaultbrix integration — LLM configs, billing, metering |
| Sprint 6 | Snipara auto-provisioning on workspace creation        |

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Single PostgreSQL for everything | Loses RC's battle-tested auth and real-time messaging; not dogfooding |
| Self-hosted Snipara | Operational overhead with no benefit; managed SaaS is the right tier for Vutler workspaces |
| Separate auth service (JWT/OAuth) | Duplicates what RC already provides; adds a system with no payoff |
| MongoDB for all Vutler data | Relational guarantees matter for billing and audit; PostgreSQL is the right fit |

---

## Related

- Vaultbrix schema design (TBD — Sprint 5)
- Snipara provisioning API spec (TBD — Sprint 6)
- RC `workspace-admin` role definition (TBD — Sprint 5)
- Vutler pricing tier mapping (product spec)
