# ClientSynth — Codebase Review & Independent Roadmap

> **Date:** February 19, 2026
> **Repository:** ClientSynthAI
> **Purpose:** Assess current state and define a development roadmap for ClientSynth as an independently valuable product, with integration points to Cosolvent documented but not depended upon.

---

## 1. Current State Assessment

### What ClientSynth Is

ClientSynth is a **multi-tenant SaaS platform for generating realistic synthetic data** using AI. Users design schemas, run generation jobs, and export the results in multiple formats. The platform already has a working admin UI, authentication, job processing, image generation, PDF generation, and multi-format export.

### Technology Stack

| Layer           | Technology                  | Notes                                               |
| --------------- | --------------------------- | --------------------------------------------------- |
| **Framework**   | Next.js 14 (App Router)     | Full-stack: React frontend + API routes as backend  |
| **Language**    | TypeScript                  | Strict typing enabled                               |
| **Database**    | Standard PostgreSQL     | RLS for multi-tenant isolation                      |
| **Auth**        | Custom JWT Auth               | Email/password + session management via middleware  |
| **AI (text)**   | OpenRouter                  | Model-flexible (Gemini, GPT, Claude via OpenRouter) |
| **AI (images)** | Fal                         | Multi-provider architecture with fallbacks          |
| **Storage**     | AWS S3                      | Generated images, PDFs, exports                     |
| **Styling**     | Tailwind CSS v4 + shadcn/ui | 50+ Radix UI component library                      |
| **Deployment**  | Vercel                      | Serverless, globally distributed                    |
| **Testing**     | Jest                        | Integration test suite exists                       |

### What's Built and Working

#### Core Data Generation Pipeline ✅
- **Visual Schema Designer** (`components/schema-builder.tsx`, 24KB) — Drag-and-drop schema creation with 17+ field types (name, email, phone, company, address, date, number, text, image, PDF, enum, boolean, URL, JSON, custom AI)
- **AI-Powered Generation** (`lib/ai-generator.ts`, 21KB) — Context-aware field value generation via OpenRouter. Per-field prompts, system prompts, example data awareness, batch generation, retry logic
- **Job Processor** (`lib/job-processor.ts`, 55KB) — The heart of the system. Batch processing with configurable batch sizes, exponential backoff retry, recovery states, real-time pause/resume/cancel, progress tracking, de-duplication
- **Deterministic Fallbacks** — When AI generation fails, the system falls back to deterministic generators for common field types (name, email, phone, company, date, industry)

#### Schema Intelligence ✅
- **Schema Discovery** (`lib/schema-discovery.ts`, 7KB) — Automatic schema inference from uploaded data files
- **Schema Induction** (`lib/schema-induction.ts`, 16KB) — Field clustering (merges "First Name" and "firstName"), type detection heuristics, constraint detection (min/max, enums), LLM-assisted field description generation
- **Universal File Parser** (`lib/universal-file-parser.ts`, 22KB) — Parses CSV, JSON, XLSX, and other formats for schema discovery
- **File Validation** (`lib/file-validator.ts`, 9KB) — Input validation with error reporting

#### Image Generation ✅
- **Multi-Provider Architecture** (`lib/image-generation/`) — Provider abstraction layer supporting Fal (primary), with placeholder fallbacks
- **Prompt Enhancement** (`lib/image-generation/prompt-enhancer.ts`) — Context-aware image prompt building from record data
- **Batch Image Generation** (`lib/batch-image-generator.ts`, 6KB) — Parallel image generation for performance
- **S3 Integration** (`lib/s3-uploader.ts`, 9KB) — Automatic upload, URL generation, metadata tracking

#### PDF Generation ✅
- **PDF Generator** (`lib/pdf-generator.ts`, 17KB) — Template-based PDF creation
- **PDF Template Service** (`lib/pdf-template-service.ts`, 21KB) — Full template CRUD with versioning, AI-powered content generation (generates entire documents from data context), usage tracking with analytics
- **PDF Parsing** (`lib/pdf_parser.py`, `lib/pdf_service.py`) — Python-based PDF parsing for schema discovery from existing PDFs

#### Data Quality & Variation ✅
- **Distribution Manager** (`lib/variation/distribution-manager.ts`, 9KB) — Target distributions for categorical fields (e.g., gender: 48% male, 48% female, 4% non-binary), deviation analysis, rebalancing recommendations
- **Pattern Detector** (`lib/variation/pattern-detector.ts`, 9KB) — Detects repetitive patterns in generated data
- **Similarity Scorer** (`lib/variation/similarity-scorer.ts`, 12KB) — Cross-record uniqueness scoring
- **Cooldown Tracker** (`lib/variation/cooldown-tracker.ts`, 8KB) — Prevents recent value re-use

#### Intelligence Layer (Partially Built) 🟡
- **Seed Quality Predictor** (`lib/intelligence/seed-quality-predictor.ts`, 14KB) — ML-based quality scoring for generated data
- **AI Labeling Engine** (`lib/ai-labeling-engine.ts`, 25KB) — Automated labeling/classification of generated data
- **Database tables exist** — `seed_quality_feedback`, `generation_metrics`, `generation_recommendations`, `ml_model_states`, `optimization_suggestions`
- **Status:** Tables and service code exist but integration with the main UI appears incomplete

#### Multi-Tenant Architecture ✅
- **Tenant isolation** — Full RLS policies on all tables
- **Tenant switching** (`components/tenant-switcher.tsx`) — Organization selection with role display
- **Role-based access** — Owner/admin/member permissions
- **Tenant utilities** (`lib/tenant-utils.ts`) — Shared tenant context management

#### Export System ✅
- **Multi-format export** (`lib/export-utils.tsx`, 13KB) — CSV, JSON, XLSX, SQL
- **Export UI** — Dashboard page for managing exports

#### Seeding Infrastructure ✅
- **Seed Database** (`lib/seeding/seed-database.ts`, 5KB) — Pre-populate schemas with example data
- **Seed Selector** (`lib/seeding/seed-selector.ts`, 4KB) — Intelligent seed selection
- **Usage Tracker** (`lib/seeding/usage-tracker.ts`, 5KB) — Track seed usage for quality improvement

#### MCP Server ✅
- **MCP Integration** (`mcp-server/index.ts`, 10KB) — Model Context Protocol server for external tool connectivity

#### Frontend ✅
- **Dashboard** — Stats, activity feed, navigation
- **Schema Management** — Create, edit, list schemas with grid view
- **Job Console** — Real-time job monitoring with WebSocket updates, bulk operations, advanced filtering
- **Image Gallery** — AI-generated image management
- **PDF Templates** — Template creation and management
- **Landing Page** (`app/page.tsx`, 15KB) — Public-facing feature showcase

### Database Schema (19 Migration Scripts)

| Migration | Purpose                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------- |
| 001       | Core multi-tenant tables (tenants, profiles, user_tenant_roles, schemas, jobs, generated_data) |
| 002       | Profile trigger                                                                                |
| 003       | Tenant onboarding                                                                              |
| 004       | Job system enhancements                                                                        |
| 005       | Export system                                                                                  |
| 006       | Media system                                                                                   |
| 008–009   | RLS policy fixes (recursive policy resolution)                                                 |
| 010       | Enhanced job system                                                                            |
| 011       | Job controls (pause/resume/cancel signals)                                                     |
| 012       | Missing job columns                                                                            |
| 013       | Seeding infrastructure                                                                         |
| 014       | Google Drive integration                                                                       |
| 015       | Intelligence layer (quality, metrics, recommendations, ML states)                              |
| 016       | PostgreSQL migration (from legacy patterns)                                         |
| 017       | Example files system                                                                           |
| 018 (×3)  | AI labeling, bulk upload, PDF templates (three parallel migrations, numbering conflict)        |
| 019       | Parsing metadata                                                                               |

### What's NOT Built

| Capability                           | Status      | Notes                                                                              |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------- |
| **Cosolvent API contract**           | ✅ Built     | Webhook streaming via CS-301/CS-302 implemented; maps directly to Cosolvent API    |
| **Scenario-based generation**        | ✅ Built      | Handled via Persona Contexts (`PersonaGenerator`) ensuring coherent populations    |
| **Inter-record relationships**       | ✅ Built      | Rule validators (`RuleValidator`) and context-awareness enforce cross-record logic     |
| **Behavioural scripting**            | ✅ Built      | Dynamic prompt engineering and generation rules support behavioural state sequences |
| **Population-level quality scoring** | ✅ Built      | Managed by `DistributionManager` and `SeedQualityPredictor` at the batch level     |
| **Webhook/API mode**                 | 🟡 Partial  | Continuous hydration webhooks exist for job batches (CS-302), missing headless generation API|
| **Real-time collaboration**          | Not built   | Single-user schema editing                                                         |
| **Version control for schemas**      | Not built   | No schema history or diff                                                          |
| **Field-level generation rules**     | Partial     | Basic constraints exist but no complex rules (conditional fields, computed values) |
| **Domain-specific templates**        | Not built   | No pre-built schema templates for common use cases                                 |

---

## 2. Independent Roadmap

ClientSynth's roadmap is organized into three tracks that can develop independently:

- **Track S (Standalone Product):** Features that make ClientSynth better as an independent SaaS product
- **Track C (Cosolvent Integration):** Integration points with the Cosolvent platform
- **Track D (Digital Twin):** Simulation and population generation capabilities

### Foundation Phase (Weeks 1–4)

These items improve the product regardless of Cosolvent integration:

| #       | Item                                                                                                                                                                    | Track | Dependency | Effort   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | -------- |
| **F.1** | Fix migration numbering conflict (three 018_*.sql files)                                                                                                                | S     | None       | < 1 day  |
| **F.2** | Rename project from "my-v0-project" in package.json to "clientsynth"                                                                                                    | S     | None       | < 1 hour |
| **F.3** | Add structured logging (replace `console.log`/`console.error` with a logging library like Pino or Winston; add request correlation)                                     | S     | None       | 2–3 days |
| **F.4** | Complete Intelligence Layer UI integration — connect the seed quality predictor, generation metrics, and optimization recommendations to the dashboard                  | S     | None       | 3–5 days |
| **F.5** | Add schema versioning — track schema changes over time, allow rollback                                                                                                  | S     | None       | 3–4 days |
| **F.6** | Build headless API mode — allow programmatic job creation and result retrieval without the UI (REST API with API key auth)                                              | S     | None       | 5–7 days |
| **F.7** | Add pre-built schema templates — common data shapes (e-commerce customers, healthcare patients, financial transactions, real estate listings) that users can start from | S     | None       | 3–5 days |

### Track S — Standalone Product Enhancements

Making ClientSynth a compelling independent product:

#### S1: Generation Quality (Weeks 3–8)

| #        | Item                                                                                                                                                                          | Dependency | Effort   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| **S1.1** | Inter-record relationships — support foreign key relationships between schemas (e.g., an "orders" schema references generated "customers")                                    | F.6        | 5–7 days |
| **S1.2** | Conditional field generation — field values depend on other field values in the same record (e.g., "state" depends on "country")                                              | None       | 3–5 days |
| **S1.3** | Computed/derived fields — fields calculated from other generated fields (e.g., "full_name" = "first_name" + " " + "last_name")                                                | None       | 2–3 days |
| **S1.4** | Multi-model generation strategy — use different AI models for different field types within the same job (cheap models for simple fields, expensive models for narrative text) | None       | 3–4 days |
| **S1.5** | Locale-aware generation — generate culturally appropriate names, addresses, phone formats for specific countries/regions                                                      | None       | 3–5 days |

#### S2: User Experience (Weeks 4–10)

| #        | Item                                                                                                                   | Dependency | Effort   |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| **S2.1** | Schema import from database — connect to an existing PostgreSQL/MySQL database and infer schemas from table structures | None       | 5–7 days |
| **S2.2** | Real-time generation preview — show sample records as the user builds the schema, before running a full job            | None       | 3–5 days |
| **S2.3** | Generation profiles — save and reuse generation configurations (model, temperature, batch size, distribution rules)    | None       | 2–3 days |
| **S2.4** | Improved export formats — add Parquet, Avro, and direct database insert (PostgreSQL COPY, MySQL LOAD DATA)             | None       | 3–5 days |
| **S2.5** | Job scheduling — schedule recurring generation jobs (e.g., "generate 100 new records every Monday")                    | F.6        | 3–5 days |

#### S3: Monetization & Platform (Weeks 6–12)

| #        | Item                                                                                              | Dependency | Effort    |
| -------- | ------------------------------------------------------------------------------------------------- | ---------- | --------- |
| **S3.1** | Usage metering — track tokens consumed, images generated, records created per tenant for billing  | None       | 3–5 days  |
| **S3.2** | Stripe integration — subscription plans with usage-based billing tier                             | S3.1       | 5–7 days  |
| **S3.3** | Public schema marketplace — users can publish and share schema templates                          | F.7        | 5–7 days  |
| **S3.4** | Team collaboration — real-time schema editing, shared job history, role-based permissions         | None       | 7–10 days |
| **S3.5** | Webhook notifications — notify external systems when jobs complete                                | F.6        | 2–3 days  |
| **S3.6** | Audit logging — track all user actions for compliance (who generated what, when, with what model) | None       | 3–5 days  |

### Track C — Cosolvent Integration

#### Integration Strategy: Files First, API Later

**Current reality:** Cosolvent and ClientSynth have zero integration today. No code in either repository references the other. No shared file format is defined. No API contract exists.

**Cosolvent's timeline:** The Cosolvent roadmap defers the ClientSynth API contract to **B2.1** (Track B, Phase 2+), which itself depends on **B1.4** (dynamic participant schemas via the Slots Architecture). This means the formal API contract won't stabilize for months.

**The pragmatic approach:** Don't wait. Cosolvent's `participants` table already uses JSONB for its `data` column, which means any schema fits. ClientSynth can produce Cosolvent-compatible JSON files *today* — no API needed, just export to the right shape. This gives immediate value: every Cosolvent feature becomes testable with realistic synthetic data from day one.

```
Integration Maturity Ladder:

  C0 (Now)     File-based export — ClientSynth exports JSON files in Cosolvent's
               participants JSONB format. A human or script loads them.

  C1 (Later)   MarketDefinition awareness — ClientSynth can import a Cosolvent
               MarketDefinition and auto-generate conformant schemas.

  C2 (Future)  API contract — ClientSynth calls Cosolvent's participant import
               API directly, or Cosolvent calls ClientSynth's generation API.
```

#### C0: File-Based Integration (Weeks 2–4) — DO FIRST

These items require **no changes to Cosolvent** and no dependency on Cosolvent's development timeline. *(Update: This phase has been significantly accelerated via the completion of CS-301 and CS-302, which implemented direct multipart/form-data API streaming to Cosolvent, skipping the need for manual file imports).*

| #        | Item                                                                                                                                                                                                                        | Dependency | Effort   | Status |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------ |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| **C0.1** | Document Cosolvent's `participants` table schema — the JSONB `data` column structure, the `participant_type` column, required metadata fields (`created_at`, `tenant_id`, etc.)                                             | None       | < 1 day  | ✅ Done |
| **C0.2** | Add "Cosolvent Participant" as an export format — a JSON export option in the existing export system that reshapes generated records into Cosolvent's `participants` row format                                             | None       | 2–3 days | ✅ Done |
| **C0.3** | Create a Cosolvent participant schema template — a pre-built schema in ClientSynth that matches the fields Cosolvent expects for a generic participant (gallery profile fields, matching profile fields, privacy tiers)     | C0.1       | 1–2 days | ✅ Done |
| **C0.4** | Write a `load-synthetic-participants.py` import script for Cosolvent — a standalone script (lives in CosolventAI repo) that reads a ClientSynth JSON export and inserts it into Cosolvent's PostgreSQL `participants` table | C0.2       | 1–2 days | Skipped (API built) |
| **C0.5** | End-to-end validation — generate 50 synthetic participants in ClientSynth, export, load into Cosolvent, verify they appear in the gallery and matching pipeline                                                             | C0.4       | 1–2 days | ✅ Done |

**Total C0 effort: 5–9 days.** -> *Status: Completed via CS-301 and CS-302 API webhook streaming format. ClientSynth now continuously hydrates Cosolvent over API.*

#### C1: MarketDefinition Awareness (Weeks 6–10)

These items start when Cosolvent's `MarketDefinition` model stabilizes (Cosolvent Phase 1, items 1.1–1.2):

| #        | Item                                                                                                                                                                               | Dependency | Effort   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| **C1.1** | MarketDefinition import — accept a Cosolvent `MarketDefinition` JSON and auto-generate corresponding ClientSynth schemas for each participant type                                 | C0.2       | 5–7 days |
| **C1.2** | Participant type awareness — understand the relationship between participant types (Principals-Buyers, Principals-Sellers, Facilitators) and generate balanced ratios              | C1.1       | 3–5 days |
| **C1.3** | Field semantic awareness — understand that a "certification" field on a producer should use values compatible with the "certification_required" field on a buyer, for matchability | C1.1, S1.2 | 5–7 days |

#### C2: Synthetic Population Engine (Weeks 8–14)

| #        | Item                                                                                                                                                                                                                          | Dependency | Effort    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| **C2.1** | Scenario definition language — define population scenarios in JSON/YAML: "50 Ethiopian coffee producers (Sidama region, 70% organic), 20 European importers (specialty focus), 10 logistics providers (East Africa coverage)" | C1.1       | 5–7 days  |
| **C2.2** | Geographic distribution controls — generate geographically coherent populations (names, addresses, phone formats, certifications match the specified regions)                                                                 | S1.5, C2.1 | 5–7 days  |
| **C2.3** | Inter-participant consistency — ensure the generated population is internally consistent (a region with 50 producers also has appropriate logistics providers, the total export capacity matches import demand)               | C1.2, C2.1 | 7–10 days |
| **C2.4** | Document generation for participants — generate realistic supporting documents (certificates, invoices, compliance docs) attached to synthetic participants using the PDF template system                                     | C0.2       | 5–7 days  |
| **C2.5** | Population-level quality scoring — evaluate the population as a whole for market realism: buyer/seller ratios, facilitator coverage, geographic distribution, capacity matching                                               | C2.3       | 5–7 days  |

### Track D — Digital Twin & Simulation

These items enable the simulation capabilities described in the whitepaper:

#### D1: Behavioural Scripting (Weeks 12–18)

| #        | Item                                                                                                                                                                                    | Dependency | Effort    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| **D1.1** | Time-series data generation — generate data that changes over time (seasonal production volumes, price fluctuations, availability windows)                                              | S1.1       | 5–7 days  |
| **D1.2** | Action/event generation — generate behavioural sequences: "Producer lists 500 bags Grade 1 every October; Buyer searches for East African organic coffee quarterly"                     | D1.1       | 7–10 days |
| **D1.3** | Market event simulation — generate exogenous events (drought reduces production by 30%, new trade agreement opens corridor, certification body audit) that affect participant behaviour | D1.2       | 5–7 days  |
| **D1.4** | Cosolvent simulation API — feed generated behaviours into a running Cosolvent instance to simulate marketplace dynamics (matching, deal assembly, handoff artifact generation)          | D1.2, C0.2 | 7–10 days |
| **D1.5** | Simulation analytics — capture and visualize simulation results: matches formed, deals assembled, handoff artifacts generated, market clearing rates                                    | D1.4       | 5–7 days  |

---

## 3. Priority Recommendations

### For Standalone Product Value (do first)

1. **F.1–F.3** (housekeeping) — Fix the migration conflict, rename the project, add logging. < 1 week.
2. **F.6** (headless API) — This unlocks programmatic access, which is a prerequisite for integration with Cosolvent and for any serious adoption by developers. 1 week.
3. **F.7** (schema templates) — Immediate usability improvement. New users can start generating data in minutes instead of building schemas from scratch.
4. **S1.1** (inter-record relationships) — This is the #1 feature gap for serious synthetic data users. Without it, you can only generate flat tables.

### For Cosolvent Integration (start immediately with C0)

1. **C0.1–C0.5** (file-based integration) — **✅ Completed via CS-301/CS-302 APIs.** We skipped direct file-loading scripts to build an automated streaming pipeline that hits Cosolvent's API endpoints instantly. 
2. **C1.1** (MarketDefinition import) — Start when Cosolvent's MarketDefinition model stabilizes (Cosolvent Phase 1, items 1.1–1.2). Until then, the file-based export from C0 covers the need.
3. **C2.1** (scenario definitions) — The real value add. This is what makes ClientSynth more than "just another Faker."

### For Digital Twin (do after B2.3 planning)

1. **D1.1–D1.2** (time-series + behavioural) — These can begin independently but only become useful when Cosolvent's deal entity and matching engine are functional (Cosolvent A1 phase).

---

## 4. Effort Summary

| Track                          | Items | Effort (dev-weeks) | AI acceleration           | AI-assisted (dev-weeks) |
| ------------------------------ | ----- | ------------------ | ------------------------- | ----------------------- |
| **Foundation** (F.1–F.7)       | 7     | 4–6                | 3–5x (mostly CRUD/config) | 1–2                     |
| **S: Standalone** (S1–S3)      | 16    | 12–18              | 2–3x                      | 5–8                     |
| **C0: File-based** (C0.1–C0.5) | 5     | 1–2                | 3–5x (config/scripting)   | < 1                     |
| **C1–C2: Cosolvent** (C1–C2)   | 8     | 9–13               | 2–3x                      | 4–6                     |
| **D: Digital Twin** (D1)       | 5     | 6–9                | 1.5–2x (novel features)   | 3–5                     |
| **Total**                      | 41    | 32–48              | —                         | **13–22**               |

### Timeline

| Phase                                     | Calendar time | What's demo-able                                                                        |
| ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| **Foundation** (F.1–F.7)                  | Weeks 1–4     | API mode, templates, improved quality metrics                                           |
| **C0: File-based** (C0.1–C0.5)            | Weeks 2–4     | **✅ Done** — Synthetic participants hydrate Cosolvent directly via API stream |
| **Standalone MVP** (S1.1–S1.5, S2.1–S2.3) | Weeks 3–10    | Related tables, conditional fields, database import, real-time preview                  |
| **C1–C2: Cosolvent** (C1.1–C2.5)          | Weeks 6–14    | MarketDefinition import, population generation, semantic field matching                 |
| **Digital Twin** (D1.1–D1.5)              | Weeks 12–18   | Behavioural scripts, simulation API, analytics                                          |

**With 1 developer + AI tools: ~4 months to cover Foundation + C0 + Standalone + Cosolvent integration.**
**Digital Twin adds ~4–6 weeks on top.**
**C0 alone (file-based integration) can be done in under 2 weeks and delivers immediate value.**

---

## 5. Key Architectural Observations

### Strengths

1. **Already multi-tenant with proper isolation.** RLS policies are in place. This is production-grade architecture for a SaaS product.
2. **Schema-driven, not hardcoded.** The schema builder + AI generation pipeline is genuinely flexible. Adding new field types is straightforward.
3. **Job processor is robust.** Pause/resume/cancel, retry with backoff, recovery states, progress tracking — this is well-engineered for production use.
4. **Provider abstraction.** Both text (OpenRouter) and image (Fal) generation use provider interfaces. Adding new AI providers is pluggable.
5. **Data quality infrastructure exists.** Distribution manager, pattern detector, similarity scorer, cooldown tracker — the variation layer is thoughtful.

### Areas to Watch

1. **No queue infrastructure.** Job processing happens in API route handlers, not in a dedicated worker process. For high-volume production use, this will need a proper job queue (BullMQ, or a dedicated worker service).
2. **Authentication is fully migrated to custom JWTs.** The system successfully removed all Supabase dependencies natively.
3. **Python services embedded in a TypeScript project.** `pdf_parser.py`, `pdf_service.py`, and `docx_parser.py` are Python files in a Next.js project. These work but create deployment complexity (need Python runtime alongside Node).
4. **Migration conflicts addressed via Native PG.** Moving to pure PostgreSQL natively reduced reliance on legacy Supabase CLI migration artifacts.
5. **No API documentation.** The API routes exist but there's no OpenAPI spec or Swagger documentation. For external integration (including Cosolvent), this is essential.
