# ClientSynth Backend

FastAPI + SQLAlchemy backend for ClientSynth. It exposes APIs for auth, schema management, synthetic data job generation, export, seed images, and image generation, backed by PostgreSQL and Alembic migrations. Optional integrations include OpenRouter for AI text/image generation; by default, local deterministic stubs are used for tests and offline work.

## High-level architecture
- Framework: FastAPI (sync endpoints, simple dependency wiring)
- Persistence: SQLAlchemy 2.0 ORM + Alembic migrations (PostgreSQL in Docker; SQLite used in tests)
- Auth: JWT (password hashing with passlib, token creation/verification with python-jose)
- Job system: Synchronous job processor invoked via an endpoint (simple, deterministic for tests)
- Images: Local image provider and storage for offline/dev; optional OpenRouter provider for real image generation
- Containerization: Dockerfile + docker-compose.yml (app, db, redis)

## Directory layout

- `alembic.ini` — Alembic configuration (local dev URL). Migrations live under `alembic/versions`.
- `alembic/versions/0001_core_identity.py` — Users, Tenants, UserTenantRole tables
- `alembic/versions/0002_schemas.py` — Schemas table
- `alembic/versions/0003_seeds.py` — Seed, SeedImage, SeedUsage, SeedQualityFeedback tables
- `alembic/versions/0004_jobs.py` — Job, GeneratedData, JobLog tables
- `alembic/versions/0005_exports.py` — Export table
- `.env.example` — Example env vars (copy to `.env` for compose)
- `Dockerfile` — Image build for the FastAPI app
- `docker-compose.yml` — App + Postgres + Redis for local dev
- `requirements.txt` — Python dependencies
- `tests/` — Pytest suite with TestClient-based API tests (uses SQLite in-memory by default)

### Application code (`app/`)
- `app/main.py` — FastAPI app setup, health/ready routes, router registration
- `app/database.py` — SQLAlchemy engine/session factory and `get_db()` dependency

#### Core
- `app/core/config.py` — Pydantic Settings (`Settings`) reading env vars; exposes `settings`
- `app/core/security.py` — Password hashing, token creation/verification (JWT)

#### API (versioned under `app/api/v1/`)
- `auth.py`
  - POST `/api/v1/auth/register` — Create user, returns JWT
  - POST `/api/v1/auth/login` — OAuth2 form login, returns JWT
  - `get_current_user()` — HTTPBearer token -> user loader
- `schemas.py`
  - POST `/api/v1/schemas/` — Create schema for a tenant (requires membership)
  - GET `/api/v1/schemas/?tenant_id=...` — List schemas for tenant
  - GET `/api/v1/schemas/{schema_id}` — Get single schema
- `jobs.py`
  - POST `/api/v1/jobs/` — Create a job to generate `total_records` of data for a schema
  - POST `/api/v1/jobs/process_one` — Run the next pending job (synchronous, simple)
  - GET `/api/v1/jobs/{job_id}` — Job status/progress
  - GET `/api/v1/jobs/{job_id}/data` — Generated records
- `exports.py`
  - POST `/api/v1/exports/` — Export a job’s data to JSON or CSV, saved under `/tmp/clientsynth/exports` and returns file info
- `images.py`
  - POST `/api/v1/images/generate` — Generate an image from a seed image and save to local storage (returns file:// URL)
- `seeds.py`
  - POST `/api/v1/seeds/upload` — Upload a zip of seed images; images are extracted and registered
  - GET `/api/v1/seeds/?tenant_id=...` — List seeds
  - GET `/api/v1/seeds/{seed_id}/images` — List seed images
  - POST `/api/v1/seeds/{seed_id}/feedback` — Submit seed quality feedback

All API files enforce tenant access via membership check on `UserTenantRole`.

#### Models (`app/models/`)
- `base.py` — Declarative base with default `__tablename__` and `created_at/updated_at`
- `identity.py` — `User`, `Tenant`, `UserTenantRole`
- `schema.py` — `Schema` (per-tenant schema_definition JSON with `fields` array)
- `jobs.py` — `Job`, `GeneratedData`, `JobLog`
- `exports.py` — `Export` (tracks file path/size/status)
- `seeds.py` — `Seed`, `SeedImage`, `SeedUsage`, `SeedQualityFeedback`

#### Services (`app/services/`)
- `ai_text.py` — `AIGenerator` with OpenRouter integration if `OPENROUTER_API_KEY` present; otherwise deterministic fallback strings
- `image_provider.py`
  - `LocalSeedImageProvider` for offline tests (solid-color PNG of requested size)
  - `OpenRouterImageProvider` for real i2i via OpenRouter multimodal API
  - `get_image_provider()` to choose based on env
- `job_processor.py` — Reads schema `fields`, generates text via `AIGenerator`, generates images via provider, stores files via `LocalStorage`, and writes `GeneratedData`
- `storage.py` — `LocalStorage` persists generated images under `/tmp/clientsynth/<tenant>/<job>/<record>/<field>.png`

### Tests (`backend/tests/`)
- `conftest.py` — In-memory SQLite engine, session fixture, TestClient wiring (overrides `get_db`)
- `test_auth.py` — Register/login flow
- `test_schemas.py` — Create/list/get schema with tenant membership
- `test_jobs.py` — Create job, process one, fetch job/data
- `test_exports.py` — Export JSON and CSV; writes under `/tmp/clientsynth/exports`
- `test_images.py` — Generate an image from a seed image
- `test_seeds.py` — Upload zip of images, list seeds/images, submit feedback

## Data model overview
- Identity: `User` ↔ `UserTenantRole` ↔ `Tenant` (role is owner/admin/member)
- Schema: `Schema` belongs to a tenant; `schema_definition` is JSON with a `fields` array
- Job: `Job` generates `GeneratedData` rows (record_index + record_data JSON); `JobLog` for simple logging
- Export: `Export` references a `Job` and materializes files
- Seeds: `Seed` has many `SeedImage`; `SeedUsage` and `SeedQualityFeedback` record usage and quality signals

## Environment variables
See `.env.example` (copy to `.env`):
- `DATABASE_URL` — `postgresql://postgres:postgres@db:5432/clientsynth` for docker-compose
- `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_ALGORITHM`
- `OPENROUTER_API_KEY` — optional; if unset, the app uses deterministic fallbacks
  - For image generation, also set `OPENROUTER_IMAGE_MODEL` to a valid, image-capable model ID. Suggested values:
    - `black-forest-labs/flux-schnell` (fast; commonly available)
    - `black-forest-labs/flux-dev`
    - `stability-ai/stable-diffusion-3.5-large`
    - If you have access, higher quality models like `black-forest-labs/flux-1.1-pro` may work, but ensure your account is entitled; otherwise you will see a 400 like "not a valid model ID".
- `AWS_*` — reserved for future S3 integration; not required for local dev
- `REDIS_URL` — reserved; not currently required by the app

## Running locally (Docker)
1) Copy env file
```sh
cp backend/.env.example backend/.env
```
2) Start services
```sh
docker compose -f backend/docker-compose.yml up --build
```
3) App will be at http://localhost:8000
   - Health: GET `/health`
   - Ready: GET `/ready`

## Running tests (no Docker)
Tests use SQLite in-memory by default; no DB setup required.
```sh
# From repo root or backend folder
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pytest -q backend/tests
```
Optional: run tests against a real DB
```sh
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clientsynth_test"
pytest -q backend/tests
```

## Common flows
- Onboard user/tenant: register user (auth), create tenant record + membership (via direct DB or a future endpoint), then create schema
- Generate data: create job for a schema; call `/api/v1/jobs/process_one` to process; fetch job/data
- Export data: POST export; download file path from response
- Manage seeds: upload a zip, list seeds/images, generate images, submit feedback

## Notes and constraints
- Passwords are hashed with `pbkdf2_sha256` (chosen to avoid bcrypt length limits and external backends)
- Image generation defaults to local provider; set `OPENROUTER_API_KEY` to use OpenRouter
- File storage uses local filesystem under `/tmp/clientsynth`; change via `LocalStorage` if needed
- This backend purposely keeps job processing synchronous and simple for transparency and test determinism; a queue/worker can be added later

## Troubleshooting
- 401 Unauthorized: Ensure `Authorization: Bearer <token>` header is present (get token from register/login)
- 403 Forbidden: Ensure the user is a member of the tenant (`UserTenantRole` exists)
- Exports path missing: Ensure the process can create `/tmp/clientsynth/exports` (app does `os.makedirs`)
- OpenRouter errors: Verify API key and model env vars; provider will raise if key is required but missing
  - The image provider will now try the configured model first and then fall back to a small set of known image-capable models. Check logs for lines like "OpenRouter image gen succeeded using fallback model" to confirm.
