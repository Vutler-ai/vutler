# ADR-003: MinIO for Self-Hosted File Storage

**Status:** Accepted  
**Date:** 2026-02-16  
**Deciders:** Alex Lopez, Architecture Team  
**Technical Story:** Vutler file storage (agent drive)

---

## Context

Agents need to upload, store, and share files (documents, images, code, etc.) — essentially an "agent drive" like Google Drive or OneDrive. We need to choose a file storage solution that:

- **Self-hosted**: No vendor lock-in, full control
- **S3-compatible**: Standard API, easy to migrate to AWS S3 if needed
- **Scalable**: Support 100+ agents uploading files
- **Reliable**: No data loss
- **Simple**: Easy to deploy with Docker

**Options:**
1. Local filesystem (store files on disk)
2. MinIO (self-hosted S3-compatible object storage)
3. AWS S3 (cloud object storage)
4. PostgreSQL (store files as BLOBs)

---

## Decision

**We will use MinIO** (self-hosted S3-compatible object storage) for file storage.

---

## Options Considered

### Option 1: Local Filesystem

**Description:**  
Store files directly on the Vutler server's filesystem (e.g., `/var/vutler/files/`).

**Pros:**
- ✅ **Simplest**: No external service needed
- ✅ **Zero cost**: Just disk space
- ✅ **Fast access**: No network hop

**Cons:**
- ❌ **Not scalable**: Horizontal scaling requires shared filesystem (NFS) or rsync
- ❌ **No redundancy**: Single point of failure (disk failure = data loss)
- ❌ **Backup complexity**: Need to backup filesystem separately
- ❌ **No S3 API**: Can't migrate to S3 later without rewrite

**Estimated Effort:** Low  
**Risk Level:** High (data loss, scaling issues)

---

### Option 2: MinIO (Self-Hosted S3)

**Description:**  
Deploy MinIO as a Docker container. MinIO is open-source, S3-compatible object storage.

**Pros:**
- ✅ **S3-compatible**: Standard API, easy to migrate to AWS S3
- ✅ **Self-hosted**: No vendor lock-in, full control
- ✅ **Scalable**: Distributed mode for HA (post-MVP)
- ✅ **Reliable**: Built-in erasure coding (data redundancy)
- ✅ **Docker-ready**: Single container, easy to deploy
- ✅ **S3 SDKs**: Use standard AWS SDK for Node.js
- ✅ **Versioning**: Object versioning for accidental deletes

**Cons:**
- ⚠️ **Operational overhead**: One more service to manage
- ⚠️ **Storage cost**: Need persistent volumes

**Estimated Effort:** Low (1 day setup)  
**Risk Level:** Low (proven, widely used)

---

### Option 3: AWS S3 (Cloud)

**Description:**  
Use AWS S3 for object storage (SaaS).

**Pros:**
- ✅ **Zero ops**: AWS manages availability, backups, scaling
- ✅ **Infinite scale**: No capacity planning
- ✅ **S3 API**: Standard interface

**Cons:**
- ❌ **Not self-hosted**: Vendor lock-in, data in AWS
- ❌ **Cost**: Storage + egress fees ($0.023/GB + $0.09/GB egress)
- ❌ **Latency**: Network hop to AWS (vs local MinIO)
- ❌ **Philosophy mismatch**: Vutler is self-hosted, S3 is cloud

**Estimated Effort:** Low  
**Risk Level:** Low (technical), High (strategic — violates self-hosted principle)

---

### Option 4: PostgreSQL BLOBs

**Description:**  
Store files as `bytea` (binary) columns in PostgreSQL.

**Pros:**
- ✅ **Single database**: No separate storage service
- ✅ **ACID transactions**: Atomic file operations

**Cons:**
- ❌ **Performance**: Large files slow down database queries
- ❌ **Backup size**: Database backups include all files (huge)
- ❌ **Scalability**: PostgreSQL not designed for large blobs
- ❌ **No streaming**: Must load entire file into memory

**Estimated Effort:** Low  
**Risk Level:** High (performance, scalability)

---

## Decision Rationale

**Key Criteria:**

1. **Self-hosted (Weight: CRITICAL)**
   - **MinIO**: ✅ Full control
   - **AWS S3**: ❌ Cloud-only
   - **Filesystem**: ✅ Self-hosted
   - **PostgreSQL**: ✅ Self-hosted

2. **Scalability (Weight: HIGH)**
   - **MinIO**: ✅ Distributed mode available
   - **AWS S3**: ✅ Infinite scale
   - **Filesystem**: ❌ Requires NFS or rsync
   - **PostgreSQL**: ❌ Not designed for large files

3. **S3 compatibility (Weight: HIGH)**
   - **MinIO**: ✅ Full S3 API
   - **AWS S3**: ✅ Native S3
   - **Filesystem**: ❌ Custom API
   - **PostgreSQL**: ❌ Custom API

4. **Simplicity (Weight: MEDIUM)**
   - **MinIO**: ✅ Single Docker container
   - **AWS S3**: ✅ Zero setup
   - **Filesystem**: ✅ Very simple
   - **PostgreSQL**: ⚠️ Adds load to database

5. **Cost (Weight: MEDIUM)**
   - **MinIO**: ✅ Just disk space
   - **AWS S3**: ❌ Ongoing monthly fees
   - **Filesystem**: ✅ Free
   - **PostgreSQL**: ✅ Free

**Decision:**

**MinIO (Option 2)** is the clear winner:
- Self-hosted (aligns with Vutler philosophy)
- S3-compatible (easy to migrate to AWS S3 if needed)
- Scalable (distributed mode for HA)
- Simple (Docker container)
- Proven (used by Slack, Adobe, others)

**Why not AWS S3?**
Violates self-hosted principle. Vutler is designed for teams who want full control. MinIO gives us S3 compatibility without cloud dependence.

**Why not Filesystem?**
No redundancy, hard to scale horizontally, no S3 API.

**Why not PostgreSQL BLOBs?**
Performance and scalability issues. PostgreSQL is great for structured data, not 10MB PDFs.

---

## Consequences

### Positive
- ✅ **S3-compatible**: Use standard AWS SDK, easy migration to AWS S3 if needed
- ✅ **Self-hosted**: Full control, no vendor lock-in
- ✅ **Scalable**: Distributed MinIO for HA (post-MVP)
- ✅ **Docker-ready**: Single container, easy to deploy
- ✅ **Object versioning**: Accidental deletes recoverable
- ✅ **Access control**: Per-object permissions via S3 policies

### Negative
- ⚠️ **One more service**: Need to manage MinIO (backups, monitoring)
- ⚠️ **Storage cost**: Need persistent volumes (disk space)

### Neutral
- ℹ️ **MinIO console**: Web UI for managing buckets (http://localhost:9001)
- ℹ️ **Backup strategy**: MinIO supports snapshots, cross-region replication

---

## Implementation Plan

**Phase 1: Setup (Week 1)**
- [ ] Add MinIO to Docker Compose
- [ ] Create bucket: `vutler-files`
- [ ] Generate access key + secret key
- [ ] Test upload/download with AWS SDK

**Phase 2: Integration (Week 2)**
- [ ] Build File Module (upload, download, delete)
- [ ] Store file metadata in PostgreSQL (`files` table: id, agent_id, filename, s3_key, size)
- [ ] Implement REST API: `POST /api/v1/files`, `GET /api/v1/files/:id`
- [ ] Implement permissions (agents can only access their files or shared files)

**Phase 3: Features (Week 3)**
- [ ] File sharing (share file link with other agents)
- [ ] File browser UI (list files, upload, download)
- [ ] Thumbnail generation (images)

**Timeline:** 3 weeks  
**Owner:** AI agents

---

## Validation & Success Criteria

**How we'll know this was the right decision:**

1. **Upload performance**: 10MB file uploads in < 2s (target)
2. **Reliability**: Zero file corruption or data loss
3. **Scalability**: Supports 100+ agents uploading files concurrently
4. **S3 compatibility**: Can switch to AWS S3 by changing endpoint URL (no code changes)
5. **Operational simplicity**: MinIO stays up, logs are clear, backups work

**When to revisit this decision:**

- **If** MinIO becomes a bottleneck (throughput, latency)
- **If** we need global CDN (MinIO doesn't have CDN) → Migrate to AWS S3 + CloudFront
- **If** storage costs exceed $500/month → Evaluate cheaper options

---

## References

- [MinIO Documentation](https://min.io/docs/)
- [MinIO Docker Hub](https://hub.docker.com/r/minio/minio/)
- [AWS SDK for JavaScript (S3)](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)

---

## Notes

**MinIO distributed mode (post-MVP):**
For HA, MinIO can run in distributed mode (4+ nodes with erasure coding). For MVP, single-node is sufficient.

**Backup strategy:**
- Daily snapshots of MinIO data volume
- Optional: MinIO replication to second instance (disaster recovery)

**CDN (future):**
If we need global file distribution, we can:
1. Keep MinIO as origin
2. Add CloudFlare or AWS CloudFront as CDN
3. Or migrate to AWS S3 + CloudFront
