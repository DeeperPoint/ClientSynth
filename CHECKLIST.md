## Backend Rebuild Checklist (Python FastAPI)

Link to detailed plan: [PLAN.md](PLAN.md)

- [ ] Foundations
  - [ ] Repo structure finalized (`v0 (version 0)/`, `backend/`)
  - [ ] Environment variables template and secrets strategy
  - [ ] Docker + Compose for dev (DB, Redis optional)

- [ ] Data Model & Migrations
  - [ ] Tenants, Users, Roles (RBAC)
  - [ ] Schemas, Jobs, GeneratedRecords, JobLogs, JobControls
  - [ ] Media, Exports
  - [ ] Seeds, SeedImages, SeedUsage, SeedQualityFeedback, SeedSelectionIntelligence
  - [ ] Indexes, constraints, quotas, retention

- [ ] Authentication & Authorization
  - [ ] JWT issuance/verification
  - [ ] Tenant membership checks & role enforcement
  - [ ] Session hygiene, rate limits

- [ ] Core Services
  - [ ] Text generation (OpenRouter) abstractions
  - [ ] Image generation (Fal) with image-to-image via seeds
  - [ ] S3 storage wrappers (generated, seeds, exports)
  - [ ] Prompt sanitization + safety filters

- [ ] Seeds Workflow
  - [ ] Zip validation, safe extraction, metadata
  - [ ] S3 upload (zip + images), dedupe by hash
  - [ ] State machine: pending → processing → completed/failed
  - [ ] Seed selection (scoring, cooldowns, caching)
  - [ ] Feedback and usage tracking

- [ ] Job Processing
  - [ ] Idempotent job claim & recovery state
  - [ ] Batch processing, retries, backoff
  - [ ] Pause/resume/cancel/retry controls
  - [ ] Metrics and structured logging

- [ ] Exports
  - [ ] Formats: CSV/JSON/XLSX/SQL/XML/Parquet
  - [ ] Streaming/chunked generation
  - [ ] Upload and retention

- [ ] Intelligence Layer
  - [ ] Seed scoring (historical, quality, usage, relevance)
  - [ ] Outcome prediction & optimization suggestions
  - [ ] Scheduled recompute + cache invalidation

- [ ] Observability & Ops
  - [ ] Health checks, readiness, graceful shutdown
  - [ ] Dashboards: throughput, errors, latency, selection health
  - [ ] Alerts: stuck jobs, provider errors, export failures

- [ ] Security & Compliance
  - [ ] Multi-tenant isolation tests
  - [ ] Upload security, quotas, content policy
  - [ ] Secrets & PII handling, audit logs

- [ ] QA & Rollout
  - [ ] E2E tests, load tests, chaos drills
  - [ ] Feature flags: require seeds for image fields
  - [ ] Migration playbook and rollback


