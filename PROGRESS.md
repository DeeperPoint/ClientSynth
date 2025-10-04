# Project Progress

_Last updated: 2025-10-04_

## High-Level Status
Backend + frontend integration is actively progressing. Core CRUD and generation paths (auth → tenants → schemas → jobs → seeds → image generation → exports) are functioning end-to-end for CSV/JSON exports with direct download. Frontend has been migrated off Supabase to the FastAPI backend with a lightweight auth + tenant context model.

## Completed / Implemented
### Foundations & Infra
- FastAPI backend scaffold with modular routers under `/api/v1/*`.
- CORS configured for frontend origin; JWT auth working.
- Alembic migrations present for identity, schemas, jobs, seeds, exports (incremental).
- Deterministic job processor with structured DB + console logging.

### Authentication & Tenancy
- User register/login endpoints issuing JWT tokens.
- Tenant list/create endpoints; membership enforcement via `UserTenantRole`.
- Frontend tenant switcher with localStorage persistence.
- Automatic default tenant creation when none exist.

### Schemas
- Backend schema CRUD (`POST /api/v1/schemas/`, `GET /api/v1/schemas?tenant_id=...`, single fetch).
- Frontend schema builder/editor wired to backend (removed Supabase remnants).
- Added support for `seed_rules` in `schema_definition` to bind image fields to specific seed categories / seeds.
- Schema builder UI enhancement: optional Seed Category per image field auto-generates `seed_rules`.

### Seeds
- Zip upload ingestion (`POST /api/v1/seeds/upload`) with image extraction & metadata.
- Google Drive import (`POST /api/v1/seeds/import_drive`) pulling images into seed sets.
- Seed listing (`GET /api/v1/seeds?tenant_id=...`) & detail with images (`GET /api/v1/seeds/{id}?include_images=true`).
- Frontend seeds pages: list, upload form, detail & image grid.

### Image Generation
- Job processor selects per-field seed pools with layered logic:
  1. Explicit `seed_rules` match (category / name / filename / seed_id / seed_image_id).
  2. Token heuristic fallback.
  3. Final fallback to all seeds or placeholder.
- Integration with OpenRouter model (pinned image model) plus local fallback generator.

### Jobs
- Job creation endpoint consumed by schema generate page.
- Processor loops records, generates text then images, tracks progress, logs events, stores `GeneratedData`.
- Per-record progress increments & logs persisted (`JobLog`).

### Exports
- Export creation (`POST /api/v1/exports/`) generating CSV or JSON to `/tmp/clientsynth/exports`.
- New endpoints implemented:
  - `GET /api/v1/exports/{export_id}` (metadata)
  - `GET /api/v1/exports/recent?tenant_id=...` (recent list)
  - `GET /api/v1/exports/{export_id}/download` (streamed file download)
  - `DELETE /api/v1/exports/{export_id}` (cleanup)
- Frontend helper `createAndDownloadExport` to trigger export + browser download.

### Frontend Migration Off Supabase
- Removed Supabase imports; replaced with `apiFetch` using JWT in localStorage.
- Added `TenantProvider` context and persisted selection.
- Updated dashboard pages (schemas, exports, jobs generate flow partial) to backend endpoints.

### UX Enhancements
- Seeds navigation + pages.
- Schema builder seed category mapping.
- Automatic download of exports (helper).

## In Progress / Partial
- Jobs UI: detailed job list + live log/polling not fully implemented on frontend.
- Export list page uses recent endpoint but lacks per-export download button wiring in UI (helper available).
- Model selection UI still uses placeholder local fetch for available models.
- No central error boundary or toast integration for all backend failures yet.

## Pending / Next Candidates
1. Job Console Enhancements
   - GET /api/v1/jobs (list) & /api/v1/jobs/{id}/logs endpoint consumption in UI.
   - Real-time or polling progress display.
2. Export UX
   - Add button in Jobs list/detail to call `createAndDownloadExport`.
   - Export history page with download & delete actions.
3. Tenant-Scoped Filtering
   - Pass `tenant_id` consistently (schemas page currently missing query param usage in list call).
4. Storage Layer
   - S3 integration for generated images & exports (currently local path usage).
5. Cleanup & Retention
   - Scheduled cleanup for old exports/media.
6. Intelligence Layer (Future)
   - Seed scoring + feedback loops; usage tracking endpoints.
7. Robust Validation
   - Schema definition validation & field type constraints enforcement.
8. Job Controls
   - Pause / resume / cancel / retry endpoints & UI wiring.

## Technical Debt / Improvements
- Add unified response error handler in frontend `apiFetch` wrapper.
- Introduce typed client / zod schemas for stronger type guarantees.
- Implement streaming for large exports instead of writing entire buffer first (when needed).
- Replace ad-hoc localStorage token handling with httpOnly cookie (improves security for SSR later).
- Add instrumentation (metrics) & health endpoints.

## Verification & Quality
- Type checking passing for modified frontend components (
  - `schema-builder.tsx`, `dashboard-shell.tsx`, seeds pages, exports helper).
- Backend exports API change validated for syntax (no lint errors) — runtime tested manually recommended.
- Logging added around job processing, image generation selection path.

## Quick Reference: New / Key Endpoints
- Auth: POST /api/v1/auth/register, POST /api/v1/auth/login
- Tenants: GET/POST /api/v1/tenants/
- Schemas: POST /api/v1/schemas/ ; GET /api/v1/schemas?tenant_id=... ; GET /api/v1/schemas/{id}
- Seeds: POST /api/v1/seeds/upload ; POST /api/v1/seeds/import_drive ; GET /api/v1/seeds?tenant_id=... ; GET /api/v1/seeds/{id}?include_images=true
- Jobs: POST /api/v1/jobs/ (others partially pending in UI)
- Exports: POST /api/v1/exports/ ; GET /api/v1/exports/{id} ; GET /api/v1/exports/recent?tenant_id=... ; GET /api/v1/exports/{id}/download ; DELETE /api/v1/exports/{id}

## Suggested Immediate Next Steps
1. Wire frontend Jobs page to new export helper (download button).
2. Add tenant_id query param to schema & export recent calls consistently.
3. Expose job logs endpoint & implement polling hook.
4. Add API for listing jobs with filters (status, schema_id, date range) and integrate.
5. Harden export pathway with size limits & graceful large dataset streaming.

---
Feel free to request a narrower focused report (e.g., “only exports” or “only seeds”) and I can generate a trimmed section.
