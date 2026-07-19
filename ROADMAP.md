# ClientSynth — Codebase Review & Independent Roadmap

> **Date:** July 18, 2026 (supersedes February 19, 2026 edition)
> **Repository:** ClientSynth
> **Purpose:** Assess current state and define a development roadmap for ClientSynth as an independently valuable product, with integration points to Cosolvent and CommonContext documented but not depended upon.
>
> **Revision note:** This edition is a fresh audit of the roadmap against the codebase as of commit `5a46728`. It documents work landed since February (CommonContext ingestion, Cosolvent streaming export, participant types, licensing) and **corrects four status claims from the February edition that overstated completion** (see §1.5). The public-facing `webroadmap.md` (March 6) predates most of this and needs a matching refresh.

---

## 1. Current State Assessment

### What ClientSynth Is

ClientSynth is a **multi-tenant platform for generating realistic synthetic data** using AI. Users design participant schemas, run generation jobs, and export the results in multiple formats — including streaming directly into a running Cosolvent instance. Schemas can now also be *imported* programmatically from CommonContext (MarketForge's knowledge layer), carrying domain seed rules that constrain generation.

Synthetic participants are used **exclusively** for testing and demonstration. This is now a license obligation, not just policy: the BSL 1.1 Additional Use Grant requires generated records to retain their synthetic-provenance markings.

### Licensing (new since February)

**Business Source License 1.1** (adopted July 2026, commit `5a46728`):

- Production use permitted, **except** offering ClientSynth as a commercial hosted/managed service without a separate license.
- Generated synthetic populations **must retain provenance markings** and must never be presented as real market participants or activity.
- Change date **2030-07-05**, converting to **MIT**.

### Technology Stack

| Layer           | Technology                    | Notes                                                                 |
| --------------- | ----------------------------- | --------------------------------------------------------------------- |
| **Framework**   | Next.js 14 (App Router)       | Full-stack: React frontend + API routes as backend                    |
| **Language**    | TypeScript                    | Strict typing enabled; Python sidecar for PDF/DOCX parsing            |
| **Database**    | PostgreSQL (self-hosted)      | `docker-compose.yml` Postgres 15; `lib/postgres/` client; RLS for multi-tenant isolation |
| **Auth**        | Custom JWT                    | Email/password + session middleware; Supabase fully removed           |
| **AI (text)**   | OpenRouter                    | Model-flexible (Gemini, GPT, Claude via OpenRouter)                   |
| **AI (images)** | Fal                           | Multi-provider architecture with fallbacks                            |
| **Storage**     | AWS S3 + local fallback       | `lib/local-file-storage.ts` enables fully local operation             |
| **Styling**     | Tailwind CSS v4 + shadcn/ui   | 50+ Radix UI component library                                        |
| **Deployment**  | Vercel or self-host (Docker)  | Local Docker stack is the current dev/demo path                       |
| **Testing**     | Jest                          | Integration test suites now cover all major endpoint families (auth, tenants, schemas, jobs, images, exports, PDF, participant types, models, dashboard, db, user) |

### What's Built and Working

#### Core Data Generation Pipeline ✅
- **Visual Schema Designer** (`components/schema-builder.tsx`) — Drag-and-drop schema creation with 17+ field types
- **AI-Powered Generation** (`lib/ai-generator.ts`) — Context-aware field value generation via OpenRouter; per-field prompts, system prompts, example data awareness, batch generation, retry logic; **seed-rule injection into prompts (CS-103)**
- **Job Processor** (`lib/job-processor.ts`) — Batch processing with configurable batch sizes, exponential backoff retry, recovery states, real-time pause/resume/cancel, progress tracking, de-duplication, **CS-302 continuous-hydration webhook to Cosolvent**, **post-generation rule validation (CS-102/103)**
- **Deterministic Fallbacks** — When AI generation fails, deterministic generators cover common field types
- **Diversity fixes (PR #28/#29)** — duplicate detection repaired; diverse person identities enforced across generated records

#### CommonContext Integration (NEW — not in the February roadmap) ✅
The wiki→schema→generation path that connects ClientSynth to MarketForge:
- **Schema ingestion endpoint** (`app/api/v1/schemas/import`, CS-101) — accepts a schema definition (fields + seed rules + metadata) from CommonContext and creates a ClientSynth schema
- **Seed rules in the schema type system** (`lib/types/schema-extensions.ts`) — `SeedRule`, `LinkedFieldConfig` (field dependencies), `DistributionConfig`
- **RuleValidator** (`lib/validation/rule-validator.ts`, CS-102) — enforces dependency rules (e.g., value of `country` constrains `state`; multi-select fields validated per allowed-value maps) during and after generation
- **Prompt injection** (CS-103) — seed rules relevant to a field are injected into its generation prompt
- **Output validator** (`lib/validation/output-validator.ts`) — post-generation validation pass over produced records
- *(Naming: code comments still say "Knowledge Slot" in places; the global rename to CommonContext landed in `4aa5f89` — remaining stragglers are cosmetic.)*

#### Cosolvent Integration ✅ (C0 complete — via API, better than planned)
- **CosolventExporter** (`lib/cosolvent-exporter.ts`, CS-301) — streams generated records into Cosolvent's `profile_service` via `POST {base}/profile/api/register` (multipart/form-data), with batching and retries
- **`cosolvent` export format** — first-class option in `app/api/exports/create` alongside csv/json/xlsx/sql/xml/parquet
- **Continuous hydration** (CS-302) — job processor fires webhook streaming per batch, so a running Cosolvent instance hydrates while a job executes
- The February plan's file-based C0.4 loader script was deliberately skipped — the API path made it unnecessary

#### Market Participant Modeling (NEW) ✅
- **Migration 020** — `participant_types` lookup table (producer, buyer, logistics_provider, supplier, distributor, retailer, service_provider, other) and a `participant_type` column on schemas
- **Participant-types API** (`app/api/participant-types`) with test coverage
- This seeds Track C1's "participant type awareness" but ratio balancing and cross-type semantics remain unbuilt

#### Persona-Coherent Generation (NEW) ✅
- **PersonaGenerator** (`lib/intelligence/persona-generator.ts`) — generates a root persona context ("truth object") per record so all fields cohere (company name ↔ industry ↔ region ↔ size). This is *record-level* coherence — see §1.5 for what it is not.

#### Schema Intelligence ✅
- Schema Discovery, Schema Induction (field clustering, type/constraint detection, LLM-assisted descriptions), Universal File Parser (CSV/JSON/XLSX), File Validation — as in February.

#### Image & PDF Generation ✅
- Multi-provider image architecture (Fal primary), prompt enhancement, batch generation, S3 upload — as in February.
- PDF generator + template service (CRUD, versioning, AI content generation, usage analytics); Python-based PDF/DOCX parsing for schema discovery.

#### Data Quality & Variation ✅
- Distribution Manager (target distributions, deviation analysis, rebalancing), Pattern Detector, Similarity Scorer, Cooldown Tracker — as in February.

#### Intelligence Layer 🟡 (unchanged)
- Seed Quality Predictor, AI Labeling Engine, and their database tables exist; dashboard integration remains incomplete (F.4 still open).

#### Multi-Tenant, Export, Seeding, MCP, Frontend ✅
- As in February, plus: export format list now includes **XML and Parquet** (S2.4 partially delivered), and the job console gained partial raw-data export and pause/cancel UI fixes (PR #28).

#### Documentation ✅ (new)
- **API_REFERENCE.md** — the February "No API documentation" observation is resolved (an OpenAPI spec is still absent)
- **FEATURES.md** product sheet; **EDGE_CASE_SYNTHESIS.md** (trade-press-profile synthesis for edge cases); README rewritten around the digital-twin role and ethical boundaries

### Database Schema (21 migration scripts)

Migrations 001–019 as in February, plus:

| Migration | Purpose                                                        |
| --------- | -------------------------------------------------------------- |
| 020       | Participant types lookup + `schemas.participant_type` + indexes |

Unresolved hygiene: **no 007**, and **three parallel `018_*.sql` files** (ai_labeling, bulk_upload, pdf_templates) still conflict (F.1 remains open).

### 1.5 Status Corrections (claims from the February edition, audited against code)

The February edition's "What's NOT Built" table was edited mid-cycle to mark several capabilities "✅ Built." The audit finds those claims **overstated**; corrected status:

| Capability                           | Feb claim | Audited status | What actually exists / what's missing |
| ------------------------------------ | --------- | -------------- | -------------------------------------- |
| **Cosolvent API contract**           | ✅ Built  | ✅ **Confirmed** | CS-301/CS-302 streaming to `profile/api/register` is real and wired into exports and the job processor |
| **Scenario-based generation**        | ✅ Built  | 🟡 **Partial** | PersonaGenerator gives *record-level* coherence. There is no scenario definition language, no population composition ("50 producers, 20 importers, 10 logistics"), no C2.1 |
| **Inter-record relationships**       | ✅ Built  | 🟡 **Partial** | RuleValidator + LinkedFieldConfig enforce *intra-record* field dependencies (S1.2 territory). Cross-schema foreign-key relationships (orders→customers, S1.1) do not exist |
| **Behavioural scripting**            | ✅ Built  | ❌ **Not built** | No time-series, action/event, or simulation code exists anywhere in `lib/`. Track D has not started |
| **Population-level quality scoring** | ✅ Built  | 🟡 **Partial** | DistributionManager scores categorical distributions per batch. Market-realism scoring (buyer/seller ratios, capacity matching, C2.5) does not exist |
| **Webhook/API mode**                 | 🟡 Partial | 🟡 **Partial (unchanged)** | CS-302 webhooks exist for Cosolvent hydration; there is still no general headless API — the one `v1` endpoint uses session auth, not API keys |
| **Real-time collaboration**          | Not built | Not built      | — |
| **Version control for schemas**      | Not built | Not built      | — |
| **Field-level generation rules**     | Partial   | 🟢 **Mostly built** | Linked fields + seed rules + validators now cover conditional generation; computed/derived fields (S1.3) remain |
| **Domain-specific templates**        | Not built | 🟡 **Partial** | Participant types provide domain categories; no reusable schema template library (F.7) |

---

## 2. Independent Roadmap

Tracks unchanged: **S (Standalone)**, **C (Cosolvent)**, **D (Digital Twin)** — plus the now-real **K (CommonContext/MarketForge)** thread, which was not anticipated in February but has become the differentiating pipeline.

### Foundation Phase — status audit

| #       | Item                                                      | Status | Notes |
| ------- | --------------------------------------------------------- | ------ | ----- |
| **F.1** | Fix migration numbering (three 018s, missing 007)         | ❌ Open | Still < 1 day; do before the next migration lands |
| **F.2** | Rename `my-v0-project` → `clientsynth` in package.json    | ❌ Open | Still < 1 hour |
| **F.3** | Structured logging (Pino/Winston + request correlation)   | ❌ Open | `console.*` throughout |
| **F.4** | Intelligence Layer UI integration                         | ❌ Open | Tables + services exist, dashboard unwired |
| **F.5** | Schema versioning                                         | ❌ Open | More urgent now: CommonContext re-imports overwrite silently |
| **F.6** | Headless API mode (API-key auth, job CRUD, results)       | 🟡 Partial | `v1/schemas/import` exists but session-authenticated; no API-key layer, no headless job creation |
| **F.7** | Pre-built schema templates                                | 🟡 Partial | Participant types exist; no template library |

### Track K — CommonContext / MarketForge Pipeline (NEW)

The wiki→schema→population path. CS-101/102/103 are done; the natural continuations:

| #        | Item | Dependency | Effort |
| -------- | ---- | ---------- | ------ |
| **K.1**  | Finish the CommonContext rename sweep (code comments, doc strings still say "Knowledge Slot") | None | < 1 day |
| **K.2**  | Round-trip contract test — a CommonContext export ingests, generates, validates, and streams to Cosolvent end-to-end in CI | None | 2–3 days |
| **K.3**  | Ingest-boundary provenance enforcement — stamp synthetic-provenance markings at generation time so the BSL obligation and Cosolvent's watermark check are mechanically satisfied | None | 2–3 days |
| **K.4**  | Seed-rule coverage expansion — richer rule types beyond `dependency` (ranges tied to context, mutual exclusion, cardinality) | K.2 | 3–5 days |

### Track S — Standalone Product Enhancements

#### S1: Generation Quality

| #        | Item | Status / Dependency | Effort |
| -------- | ---- | ------------------- | ------ |
| **S1.1** | Inter-record relationships (cross-schema FKs: orders→customers) | ❌ Open — **still the #1 gap**; F.6 | 5–7 days |
| **S1.2** | Conditional field generation | 🟢 **Done** via LinkedFieldConfig + seed rules | — |
| **S1.3** | Computed/derived fields | ❌ Open | 2–3 days |
| **S1.4** | Multi-model generation strategy (per-field model choice) | ❌ Open (PersonaGenerator already pins a cheap model — pattern exists) | 3–4 days |
| **S1.5** | Locale-aware generation | ❌ Open — prerequisite for credible Canada/Ethiopia/Mexico demo populations | 3–5 days |

#### S2: User Experience

| #        | Item | Status | Effort |
| -------- | ---- | ------ | ------ |
| **S2.1** | Schema import from database | ❌ Open | 5–7 days |
| **S2.2** | Real-time generation preview | ❌ Open | 3–5 days |
| **S2.3** | Generation profiles | ❌ Open | 2–3 days |
| **S2.4** | Improved export formats | 🟢 **Mostly done** (XML, Parquet shipped); Avro + direct DB insert remain | 1–2 days |
| **S2.5** | Job scheduling | ❌ Open; F.6 | 3–5 days |

#### S3: Monetization & Platform

Unchanged from February (S3.1–S3.6 all open). Note the BSL no-hosted-service clause means S3.2 (Stripe/billing) is for the licensor's own deployment or licensed operators only.

### Track C — Cosolvent Integration

**C0 — ✅ Complete**, and completed *above* the original spec: instead of file export + loader script, CS-301/CS-302 stream directly into Cosolvent's profile-registration API, including live hydration during job runs. The February integration-maturity ladder's "C2 (Future): API contract" is, for the ClientSynth→Cosolvent direction, already reality.

**C1 — MarketDefinition awareness** (start when Cosolvent's MarketDefinition stabilizes):

| #        | Item | Status | Effort |
| -------- | ---- | ------ | ------ |
| **C1.1** | MarketDefinition import → auto-generate schemas per participant type | ❌ Open — the `v1/schemas/import` endpoint is the natural landing point | 4–6 days |
| **C1.2** | Participant type awareness + balanced ratios | 🟡 Types + schema tagging exist (migration 020); ratio logic absent | 2–4 days |
| **C1.3** | Cross-type field semantic compatibility (producer `certification` ↔ buyer `certification_required`) | ❌ Open; C1.1 + seed rules make this tractable now | 4–6 days |

**C2 — Synthetic Population Engine** (unchanged; all open): scenario definition language (C2.1), geographic distribution controls (C2.2), inter-participant consistency (C2.3), supporting-document generation (C2.4), population-level quality scoring (C2.5). This is now the **highest-value unbuilt work** — everything below it in the stack is done.

### Track D — Digital Twin & Simulation

**Not started** (contrary to the February edition's completion marks). D1.1–D1.5 stand as specified: time-series generation, action/event generation, market event simulation, Cosolvent simulation API, simulation analytics. D1.4's integration surface now exists (CS-301/302), which removes its former blocker.

---

## 3. Priority Recommendations (July 2026)

1. **Foundation debt sprint (F.1–F.3, K.1)** — four items, ~1 week total, all embarrassing-to-explain later. The migration conflict now blocks clean self-host onboarding (docker-entrypoint runs `scripts/` in filename order).
2. **F.6 headless API with API-key auth** — the single unlock for programmatic use by the Ethiopian team's service company, CI round-trips (K.2), and job scheduling. The `v1` namespace already exists; extend it.
3. **C2.1 scenario definitions + C1.2 ratio logic** — with generation, rules, personas, participant types, and Cosolvent streaming all in place, population-level composition is the remaining step from "record generator" to "population engine." This is the differentiating capability.
4. **S1.1 inter-record relationships** — still the biggest generic-product gap.
5. **K.3 provenance stamping** — turns a license obligation into a mechanical guarantee, and matches the ingest-boundary watermark contract on the Cosolvent side.

---

## 4. Effort Summary (remaining work only)

| Track                              | Open items | Effort (dev-weeks) | AI-assisted (dev-weeks) |
| ---------------------------------- | ---------- | ------------------ | ----------------------- |
| **Foundation** (F.1–F.7 residual)  | 7          | 3–4                | 1–1.5                   |
| **K: CommonContext** (K.1–K.4)     | 4          | 1.5–2.5            | ~1                      |
| **S: Standalone** (open items)     | 13         | 9–14               | 4–6                     |
| **C1–C2: Cosolvent**               | 8          | 6–9                | 3–4                     |
| **D: Digital Twin** (D1)           | 5          | 6–9                | 3–5                     |
| **Total remaining**                | 37         | 25–38              | **12–17**               |

Delivered since February (for calibration): all of C0 (as APIs), CS-101/102/103, migration 020 + participant-types API, PersonaGenerator, output validator, generation-diversity fixes, XML/Parquet export, endpoint test suites, Supabase removal, BSL licensing — roughly the February plan's "Foundation + C0" tranche by value, though via a different route than planned.

---

## 5. Key Architectural Observations

### Strengths (all still true, some strengthened)

1. **Multi-tenant with proper RLS isolation** — production-grade.
2. **Schema-driven and now rule-driven** — seed rules + linked fields + validators make generation constrainable by external knowledge, which is the MarketForge thesis in code.
3. **Job processor is robust** — and now also an integration engine (live Cosolvent hydration mid-job).
4. **Provider abstraction** for text and image AI.
5. **Test coverage materially improved** — every endpoint family has an integration suite.

### Areas to Watch

1. **No queue infrastructure** (unchanged) — job processing lives in API route handlers; high-volume use needs a worker/queue (BullMQ or a dedicated service). The CS-302 webhook work makes long-running jobs *more* common, so this is rising in priority.
2. **Python sidecar** (unchanged) — `pdf_parser.py`/`pdf_service.py`/`docx_parser.py` require a Python runtime alongside Node; now slightly better contained (interpreter path un-committed for cross-OS use, `.venv` ignored).
3. **Migration hygiene** — three 018s and no 007; the Docker init mount executes migrations in lexical order, so the conflict is no longer cosmetic.
4. **Session-only auth on the `v1` API** — an externally-consumed namespace without API-key auth invites misuse of session cookies in scripts; resolve with F.6.
5. **API documentation** — API_REFERENCE.md exists; an OpenAPI spec would let Cosolvent and CommonContext generate clients instead of hand-coding.
6. **Doc drift discipline** — the February roadmap accumulated optimistic in-place status edits that this audit had to unwind. Future status changes should cite the commit/PR that delivered them (as this edition does).
