## Backend Rebuild Plan (Python FastAPI)

Linked checklist: [CHECKLIST.md](CHECKLIST.md)

### 1) Foundations

- Repo Layout
  - Keep legacy app in `v0 (version 0)/` untouched.
  - Build new Python backend in `backend/`.
- Environment Strategy
  - `.env.example` with: DATABASE_URL, SECRET_KEY, OPENROUTER_API_KEY, FAL_KEY, AWS creds, REDIS_URL, LOG_LEVEL.
  - Secrets via local `.env` (gitignored). Production via platform secrets manager.
- Containers
  - Dockerfile: Python 3.11 slim, app user, healthcheck.
  - Compose: services `app`, `db` (Postgres), `redis`, optional `worker`.

### 2) Data Model & Migrations

Tables (tenant-scoped unless noted):
- Identity: `users`, `tenants`, `user_tenant_roles`.
- Generation: `schemas`, `jobs`, `generated_data`, `job_logs`, `job_controls`.
- Media & Exports: `media`, `exports`.
- Seeds: `seeds`, `seed_images`, `seed_usage`, `seed_quality_feedback`, `seed_selection_intelligence`.

Constraints & Indexes:
- Unique constraints: `(jobs.id, generated_data.record_index)`, `(user_id, tenant_id)`.
- Indexes on job status, created_at, tenant_id groupings; seed tables by tenant/category.

Migrations:
- Alembic phases: 01_core_identity, 02_generation, 03_media_exports, 04_seeds, 05_intelligence.

Retention & Quotas:
- Configurable per-tenant caps: storage, records/day, API calls.
- Cleanup jobs for old exports and media per policy.

### 3) Authentication & Authorization

- JWT (HS256): access tokens with `sub` (user id), optional `tenant` context, expiry configs.
- Role checks: `owner > admin > member`. Middleware enforces tenant membership on routes.
- Rate limits per IP and per token for auth endpoints.

### 4) Core Services (Interfaces)

- AuthService: `authenticate(email, password)`, `issueToken(userId)`, `authorize(tenantId, role)`.
- SchemaService: `createSchema()`, `updateSchema()`, `validateSchema(def)`, `getSchema(id)`, `listSchemas(tenantId)`.
- TextGenService (OpenRouter): `generateFieldValue(context)`, `setModel(model)`, `sanitizePrompt(text)`.
- ImageGenService (Fal): `generateFromSeed(seedUrl, prompt, style, controls)`, `generateTextToImage(prompt, style)`.
- StorageService (S3): `uploadSeedZip()`, `uploadSeedImage()`, `uploadGeneratedImage()`, `uploadExport()`.
- SeedsService: `createSeed(tenantId, name, category, zip)`, `listSeeds()`, `listSeedImages(seedId)`, `submitSeedFeedback()`, `getBestSeedImage(tenantId, fieldType, fieldName, context)`, `recordSeedUsage()`.
- JobService: `createJob()`, `getJob()`, `listJobs()`, `controlJob()`, `getJobLogs()`, `getRecoveryState()`.
- ExportService: `createExport(jobId, format, filters)`, `listExports(tenantId)`, `getExport(exportId)`.
- IntelligenceService: `scoreSeedCandidates()`, `predictOutcome()`, `computeOptimizationSuggestions()`.

### 5) Seeds Workflow

Validation:
- Only `.zip`. Enforce max zip size, max files, allowed image types.
- Zip-bomb safe extraction (size and depth checks). Path sanitization.

Processing:
- Upload original zip to S3 (for audit). Extract images in stream.
- For each image: compute hash; dedupe; extract metadata (width/height/format/size).
- Persist `seed_images` rows; update `seeds` status: pending → processing → completed/failed.

Selection Algorithm:
- Candidate seeds: `status=completed` for tenant and matching category.
- Score per seed with weights: historicalPerformance 0.3, imageQuality 0.3, usagePatterns 0.2, contextRelevance 0.2.
- Cooldowns: avoid repeating the same seed within a sliding window.
- Cache top-k per (tenant, fieldType) with TTL; invalidate on feedback upload or new seeds.

Feedback & Usage:
- On every generated image: write `seed_usage` with context (field, prompt, style).
- Users submit `seed_quality_feedback` (1–5) per seed/seed image.
- Nightly job recomputes `seed_selection_intelligence` aggregated scores.

### 6) Job Processing Engine

State Machine:
- `pending → processing → paused|cancelled|failed|completed`; `failed → pending` on retry.

Flow:
- Securely claim a job with CAS. Load schema and config.
- Iterate by batches. For each record:
  - Generate text fields (AI or deterministic fallback).
  - For each image field:
    - Get best seed image; run image-to-image with controls; upload result.
    - On failure: retry with backoff; final fallback to placeholder.
  - Persist record; checkpoint recovery after each record.
  - Update progress and logs.

Controls:
- `pause`: stop after current record; persist state.
- `resume`: continue from recovery checkpoint.
- `cancel`: stop permanently; keep generated so far.
- `retry`: move failed → pending; reuse recovery state.

Idempotency & Safety:
- Unique constraint on `(job_id, record_index)`.
- S3 keys include hashes or UUIDs; double-writes are harmless.
- Provider outages: exponential backoff + jitter; circuit breaker; DLQ for diagnostics.

### 7) Exports

- Supported: CSV, JSON, XLSX, SQL, XML, Parquet.
- Streamed generation for large datasets; chunk uploads to S3.
- Retention period for exports; auto-cleanup.

### 8) Intelligence Layer

- Seed scoring inputs: ratings, success rate, resolution/size/diversity, recent and field-specific usage, context heuristics.
- Outcome prediction (optional): estimate duration/success/cost from historical jobs and config.
- Optimization suggestions: batch size, seed variety, model options, cooldown tuning.

### 9) Observability & Ops

- Metrics: jobs/sec, gen latency, retries, error rates, export time, seed selection hit rate.
- Structured logs with correlation ids (tenantId/jobId/recordIndex).
- Health/readiness endpoints; graceful shutdown preserving recovery.
- Alerts: stuck jobs, provider failure spikes, selection/caching failures, export errors.

### 10) Security & Compliance

- Tenant isolation on every DAO call.
- Upload safety: mime/extension checks; max sizes; zip traversal prevention; optional AV scan.
- Secrets via env or vault; no secrets in logs.
- PII minimization in logs; signed URLs where possible.

### 11) QA & Rollout

- Testing:
  - Unit: selection scoring, zip ingestion, state transitions, prompt sanitization.
  - Integration: end-to-end job with seeds, pause/resume, export streaming.
  - Load: 100k records, multi-tenant parallel jobs.
  - Chaos: provider outages, S3 failures, DB restarts.
- Feature flags:
  - Require seeds for image fields (gradual enforcement).
  - Toggle fallback to text-to-image.
- Migration plan:
  - Read-only cutover of v0; start dual-run pilots; ramp tenants gradually; rollback ready.

### Phase Execution in backend/

- phases/00_docs: copy PLAN & CHECKLIST references; ADRs as needed.
- phases/01_bootstrap: app skeleton, env, Docker, health endpoints.
- phases/02_auth: JWT, users, tenants, roles, RBAC middleware, seed sample data.
- phases/03_schemas: schema CRUD, validation.
- phases/04_seeds: upload/ingest, metadata, selection, feedback, usage.
- phases/05_images: provider adapters, prompt sanitize, i2i generation, S3 storage.
- phases/06_jobs: processor, controls, recovery, metrics.
- phases/07_exports: streaming exports, S3, retention.
- phases/08_intelligence: scoring recompute, suggestions, caches.
- phases/09_observability: metrics, logs, alerts.
- phases/10_hardening: rate limits, quotas, security review, perf tuning.


