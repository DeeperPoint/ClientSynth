<!-- Copyright © 2026 Mustafa Uzumeri. All rights reserved. -->

# ClientSynth User's Guide

> A task-oriented manual for people *using* ClientSynth through its web interface.
> For developer setup see `DOCUMENTATION.md`; for API details see `API_REFERENCE.md`;
> for feature status see `FEATURES.md`.

---

## 1. What ClientSynth Does

ClientSynth generates **realistic synthetic data** with AI. You describe the *shape*
of the data you want (a schema), and ClientSynth generates any number of records that
fit it — names, companies, addresses, narrative text, headshot images, even PDF
documents — that are internally coherent (a generated person's job title matches
their company's industry) and diverse across records (no repeated names or
copy-paste values).

Typical uses in the DeeperPoint ecosystem: populating a prototype Cosolvent
marketplace with synthetic producers, buyers, and logistics providers so matching
and gallery features can be demonstrated before real participants exist.

### ⚠️ Read this before generating anything

Synthetic records are for **testing and demonstration only**:

- Never mix synthetic profiles with real user profiles in a live marketplace.
- Generated data carries synthetic-provenance markings; the license (BSL 1.1)
  requires those markings to be retained and forbids presenting generated records
  as real market participants or real market activity.

---

## 2. Quick Start (10 minutes)

1. **Sign up** — `/auth/sign-up`, then log in. Your account gets a personal
   organization (tenant); all schemas, jobs, and exports live inside it.
2. **Try Quick Generate** — Dashboard → **Quick Generate**. Pick a simple shape,
   generate a handful of records, and look at the output. This is the fastest way
   to see what the generator does before you invest in a schema.
3. **Create your first schema** — Dashboard → **Schemas → New**. Add a few fields
   (e.g., `name`, `company`, `email`, `job_title`), give the schema a one-line
   description of who these records are ("procurement managers at mid-size
   Canadian food importers"), and save.
4. **Run a generation job** — from the schema's page choose **Generate**, set the
   record count (start with 10–25), and start the job.
5. **Watch it in the Job Console** — Dashboard → **Jobs**. The job page shows live
   progress; you can pause, resume, or cancel at any time.
6. **Export** — from the finished job, open **Export** and download CSV, JSON,
   XLSX, SQL, XML, or Parquet.

---

## 3. Core Concepts

| Term | Meaning |
| --- | --- |
| **Schema** | The blueprint for one kind of record: an ordered list of fields with types, prompts, and constraints. |
| **Field** | One column/attribute. Each field has a type (see §4.2) and can carry its own generation prompt and constraints. |
| **Job** | One generation run: "produce N records for schema X." Jobs run in batches with retry and recovery, and can be paused/resumed/cancelled. |
| **Record** | One generated row. Records are de-duplicated and diversity-checked within a job. |
| **Export** | A snapshot of a job's records in a chosen format — file download or a direct stream into Cosolvent. |
| **Organization (tenant)** | The isolation boundary. Members see only their organization's data. Roles: owner / admin / member. |
| **Participant type** | An optional tag on a schema (producer, buyer, logistics provider, supplier, distributor, retailer, service provider, other) identifying its role in a marketplace population. |
| **Seed rules** | Constraints attached to a schema (often imported from CommonContext) that the generator must respect — e.g., "if `country` is Ethiopia, `certifications` must come from this list." |

---

## 4. Building Schemas

You can create a schema three ways: by hand in the visual builder, by inferring it
from an existing data file, or by importing it programmatically from CommonContext.

### 4.1 The visual schema builder (Schemas → New)

Add fields one at a time. For each field you set:

- **Name** — the column name in generated output.
- **Type** — see the table below. Type determines both the generator used and the
  deterministic fallback if AI generation fails.
- **Required / optional**.
- **Prompt / description** — per-field guidance to the AI ("a specialty-coffee
  import company based in the EU"). The more specific your schema-level and
  field-level descriptions, the more realistic and on-theme the output.
- **Constraints** — depending on type: allowed values (select/enum), min/max,
  formats.

### 4.2 Field types

| Category | Types | Notes |
| --- | --- | --- |
| **Identity** | name, email, phone | Coherent per record (email matches the name). |
| **Organization** | company, industry, job_title | Generated consistently with each other. |
| **Location** | address, city, country | |
| **Value** | number, date, boolean, select (enum), list | Constraints supported (ranges, allowed values). |
| **Text** | text, long_text | Long text is where model quality matters most — see §5.2. |
| **Media** | image, pdf | Generate an AI image (e.g., headshot) or a templated PDF document per record — see §6 and §7. |
| **Structured** | url, json, group | |
| **Custom AI** | custom | Fully prompt-driven — describe anything ("a 2-sentence LinkedIn summary in the person's voice"). |

### 4.3 Linked fields (dependencies)

A field can **depend on** another field: when `country` is "Canada", `city` and
phone formats should be Canadian; when `industry` is "Technology", `company`
should read like a tech company. Configure the dependency on the dependent field.
Dependencies are enforced twice — injected into the generation prompt, and checked
by the post-generation validator, which flags or regenerates violating values.

### 4.4 Distributions

For categorical fields you can set **target distributions** (e.g., region: 60%
Sidama / 40% Guji). The distribution manager tracks actual vs. target during the
job and rebalances subsequent batches toward the target.

### 4.5 Schema discovery from files (Schemas → Discover)

Upload an existing **CSV, JSON, or XLSX** file (or a PDF — parsed structurally)
and ClientSynth infers a schema from it: field names and types, min/max
constraints, detected enums. It also clusters near-duplicate columns ("First
Name" vs `firstName`) and drafts field descriptions. Review and edit the inferred
schema before saving — inference is a starting point, not gospel.

You can also attach **example files** to an existing schema: uploaded examples
teach the generator your preferred style and vocabulary without becoming part of
the output.

### 4.6 Importing a schema from CommonContext

Schemas can be created programmatically via `POST /api/v1/schemas/import` with a
JSON body of fields plus optional **seed rules** — this is how a MarketForge/
CommonContext knowledge pack becomes a generation-ready schema. Imported seed
rules behave like linked-field constraints: injected into prompts and enforced by
the validator. See `API_REFERENCE.md` for the payload shape. (Note: this endpoint
currently authenticates with your logged-in session.)

### 4.7 Participant types

When a schema represents a marketplace role, tag it with a **participant type**
(producer, buyer, logistics provider, …). The tag categorizes schemas for
population work and Cosolvent export; it does not change generation by itself.

---

## 5. Generating Data

### 5.1 Quick Generate vs. Jobs

- **Quick Generate** (Dashboard → Quick Generate) — small, immediate runs for
  exploring; minimal setup.
- **Jobs** (from a schema page → Generate) — the production path: batch
  processing, progress tracking, retries, recovery, and export history.

### 5.2 Job settings that matter

- **Record count** — start small (10–25) to validate the schema, then scale up.
- **Model** — text generation runs through OpenRouter, so you can pick the model.
  Cheap/fast models (e.g., Gemini Flash) are fine for structured fields; pick a
  stronger model when long-form text quality matters.
- **Batch size** — how many records generate per batch. Larger batches are
  faster; smaller batches give finer progress and pause granularity.

### 5.3 Monitoring and control (Dashboard → Jobs)

The Job Console lists all jobs with filtering and bulk operations. A job's detail
page shows live progress and gives you:

- **Pause / Resume** — takes effect at the next batch boundary.
- **Cancel** — stops the job; records generated so far are kept and exportable
  (partial export is supported).
- **Retry behaviour** — failed batches retry automatically with exponential
  backoff; if AI generation keeps failing for a common field type, a
  deterministic fallback fills the value rather than leaving blanks.

### 5.4 What the quality machinery does for you (automatic)

Every job runs with:

- **De-duplication** — duplicate records are detected and regenerated.
- **Diversity enforcement** — person identities are varied across records;
  a cooldown tracker prevents recently-used names/companies/addresses from
  reappearing in consecutive records.
- **Pattern detection & similarity scoring** — catches the AI falling into
  repetitive templates; too-similar records are flagged.
- **Persona coherence** — each record is generated from a root "persona context"
  so its fields agree with each other.
- **Rule validation** — records violating seed rules or field dependencies are
  caught by the output validator.

You don't configure these; you'll simply see fewer duplicates and more plausible
variety than raw LLM calls would give.

---

## 6. Images

Add an **image** field to a schema and each record gets an AI-generated image
whose prompt is built from the record itself — a headshot field on a "coffee
producer" schema yields contextually appropriate portraits. Generation runs in
parallel batches through the provider layer (Fal primary, with fallbacks) and
uploads to storage automatically.

Browse everything in the **Image Gallery** (per job: Jobs → job → Images).

---

## 7. PDF Documents

**PDF Templates** (Dashboard → PDF Templates) define document layouts —
certificates, invoices, compliance documents, reports. Templates support
versioning and AI-powered content generation (the document text is written from
the record's data context). Attach a **pdf** field to a schema and each generated
record gets its own filled document.

You can also upload an existing PDF to *discover* a schema from it (§4.5).

---

## 8. Exporting

From a finished (or partially complete) job, open its **Export** page, or manage
everything from Dashboard → **Exports**.

### 8.1 File formats

**CSV, JSON, XLSX, SQL, XML, Parquet.** Choose per export; exports are recorded
in the export history.

### 8.2 Cosolvent (direct streaming)

The **cosolvent** export format doesn't produce a file — it **streams records
directly into a running Cosolvent instance** (its participant-registration API),
in batches with retries. You need the Cosolvent base URL (supplied in the export
request or configured by your administrator as `COSOLVENT_BASE_URL`).

Jobs can also **hydrate Cosolvent continuously while they run** — each completed
batch is pushed as it finishes, so a demo marketplace fills up live during
generation.

Remember the usage restriction (§1): streamed synthetic participants are for
test/demo instances only.

---

## 9. Organizations, Roles, and Accounts

- **Switching organizations** — use the tenant switcher in the dashboard shell;
  your role in each organization is displayed.
- **Roles** — *Owner* (full control), *Admin* (manage schemas/jobs/members),
  *Member* (use the platform). Data never crosses organization boundaries —
  isolation is enforced at the database level.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Generated values ignore my instructions | Tighten the *field-level* prompt (schema description alone is weak guidance); add constraints or an example file (§4.5). |
| Records feel repetitive | Lower batch size, raise the record count gradually, or strengthen field prompts. The pattern detector helps, but vague prompts converge. |
| Job stuck in "processing" | Open the job page and check batch progress; pause and resume to force recovery from the last checkpoint. Cancelled/failed jobs keep partial results. |
| Image fields empty | Image provider credentials missing/exhausted — ask your administrator to check the Fal configuration. Failed images fall back to placeholders. |
| Export to Cosolvent fails immediately | Base URL missing or the Cosolvent instance isn't reachable; check `COSOLVENT_BASE_URL` or the URL supplied in the export. |
| "No organization found" on import API | Your user has no tenant yet — log into the UI once and complete onboarding first. |
| A field's values violate a dependency | Confirm the dependency is on the *dependent* field and its allowed-value map covers the source values actually being generated. |

---

## 11. What ClientSynth Is Not

- It does **not run a marketplace** — that's Cosolvent.
- It does **not define market rules** — that's MarketForge configuration.
- It does **not curate domain knowledge** — that's CommonContext; ClientSynth
  *consumes* that knowledge as schemas and seed rules.
- It must **never supply "real" users** — synthetic populations exist so the
  rest of the stack is testable before real participants arrive.

## 12. Document Map

| You want… | Read |
| --- | --- |
| This guide — using the product | `USER_GUIDE.md` |
| Feature-by-feature status | `FEATURES.md` |
| REST API payloads | `API_REFERENCE.md` |
| Architecture & internals | `ARCHITECTURE.md`, `DOCUMENTATION.md` |
| Development roadmap | `ROADMAP.md` |
| Local setup / self-hosting | Copy `.env.example` to `.env`, then `docker compose up` (app on port 3000, Postgres migrated automatically); details in `DOCUMENTATION.md` |
| Testing | `TESTING.md` |
