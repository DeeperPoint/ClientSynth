# Client Synth - System Architecture

Comprehensive technical architecture documentation.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Layers](#architecture-layers)
3. [Data Flow](#data-flow)
4. [Component Diagrams](#component-diagrams)
5. [Database Architecture](#database-architecture)
6. [Security Architecture](#security-architecture)
7. [Deployment Architecture](#deployment-architecture)
8. [Scalability Considerations](#scalability-considerations)

---

## System Overview

Client Synth is a multi-tenant SaaS platform built on a modern, serverless architecture using Next.js 14, PostgreSQL, and AI services.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT TIER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Browser    │  │  Mobile Web  │  │   API Client │              │
│  │   (React)    │  │   (React)    │  │   (cURL)     │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                       │
│                            │                                          │
└────────────────────────────┼──────────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION TIER                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              Next.js 14 App Router (Vercel)                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │  │
│  │  │   Frontend   │  │  API Routes  │  │   Server     │        │  │
│  │  │  Components  │  │  (Edge/Node) │  │  Components  │        │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            │                                          │
│         ┌──────────────────┼──────────────────┐                      │
│         ▼                  ▼                  ▼                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Auth      │  │   Business  │  │   Storage   │                 │
│  │   Layer     │  │   Logic     │  │   Layer     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   DATA TIER     │  │  PROCESSING     │  │  EXTERNAL       │
│                 │  │  TIER           │  │  SERVICES       │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │PostgreSQL │  │  │  │Job        │  │  │  │OpenRouter │  │
│  │    15+    │  │  │  │Processor  │  │  │  │  AI API   │  │
│  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │  AWS S3   │  │  │  │AI         │  │  │  │  AWS S3   │  │
│  │  Storage  │  │  │  │Generator  │  │  │  │  Storage  │  │
│  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │
│                 │  │  ┌───────────┐  │  │  ┌───────────┐  │
│                 │  │  │PDF        │  │  │  │  Python   │  │
│                 │  │  │Generator  │  │  │  │  Runtime  │  │
│                 │  │  └───────────┘  │  │  └───────────┘  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Architecture Layers

### 1. Presentation Layer

**Technology**: Next.js 14 with App Router, React Server Components

**Components**:
- **Pages**: Route handlers and page components
- **UI Components**: Reusable UI elements (shadcn/ui + Radix UI)
- **Client Components**: Interactive components with state
- **Server Components**: Data-fetching components

**Responsibilities**:
- Render user interface
- Handle user interactions
- Form validation
- Client-side routing
- State management

**Key Files**:
```
app/
├── (auth)/              # Authentication pages
├── dashboard/           # Dashboard pages
│   ├── schemas/        # Schema management
│   ├── jobs/           # Job management
│   └── exports/        # Export management
└── api/                # API routes
```

---

### 2. API Layer

**Technology**: Next.js API Routes (Edge & Node.js runtimes)

**Components**:
- **Authentication APIs**: Login, register, logout
- **Resource APIs**: CRUD operations for schemas, jobs, exports
- **Processing APIs**: Job processing, image generation
- **Utility APIs**: File uploads, dashboard stats

**Responsibilities**:
- Request validation
- Authentication & authorization
- Business logic orchestration
- Response formatting
- Error handling

**API Structure**:
```
app/api/
├── auth/
│   ├── register/route.ts
│   ├── login/route.ts
│   └── me/route.ts
├── schemas/
│   ├── create/route.ts
│   ├── [id]/
│   │   ├── route.ts
│   │   └── examples/
│   │       └── upload/route.ts
├── jobs/
│   ├── create/route.ts
│   ├── process/route.ts
│   └── control/route.ts
├── exports/
│   └── create/route.ts
└── dashboard/
    └── stats/route.ts
```

---

### 3. Business Logic Layer

**Technology**: TypeScript classes and modules

**Core Services**:

#### JobProcessor
```typescript
class JobProcessor {
  - processNextJob(): Promise<boolean>
  - processJob(jobId: string): Promise<void>
  - generateSingleRecord(): Promise<Record>
  - handleJobError(): Promise<void>
  - updateJobProgress(): Promise<void>
}
```

**Responsibilities**:
- Orchestrate data generation
- Manage job lifecycle
- Handle errors and retries
- Track progress

#### AIGenerator
```typescript
class AIGenerator {
  - generateFieldValue(context): Promise<string>
  - fetchExampleData(schemaId, fieldName): Promise<string[]>
  - buildPrompt(context, examples): string
  - systemPromptFor(fieldType): string
}
```

**Responsibilities**:
- Generate text using AI
- Incorporate example data
- Build context-aware prompts
- Handle AI API calls

#### ImageGenerationService
```typescript
class ImageGenerationService {
  - generateAndUploadImage(request): Promise<Result>
  - enhancePrompt(options): Promise<string>
}
```

**Responsibilities**:
- Generate AI images
- Enhance prompts with context
- Upload to S3
- Track metadata

#### PDFGenerator
```typescript
class PDFGenerator {
  - createFromContent(options): Promise<PDFResult>
  - uploadPDFToS3(base64, tenantId, jobId, filename): Promise<UploadResult>
}
```

**Responsibilities**:
- Create PDF documents
- Format content
- Upload to S3

#### ExportGenerator
```typescript
class ExportGenerator {
  - generateExport(jobId, options): Promise<Buffer|string>
  - generateCSV(records): string
  - generateJSON(records): string
  - generateXLSX(records): Promise<Buffer>
  - generateSQL(records, jobId): string
}
```

**Responsibilities**:
- Export data in multiple formats
- Apply filters
- Generate download files

---

### 4. Data Access Layer

**Technology**: PostgreSQL with `pg` library

**Components**:

#### Database Client
```typescript
// lib/postgres/client.ts
export async function query(text: string, params?: any[]): Promise<QueryResult>
export async function getCurrentUser(): Promise<User | null>
```

**Responsibilities**:
- Execute SQL queries
- Connection pooling
- Transaction management
- Query logging

#### Database Functions
```sql
-- Helper functions
get_examples_for_field(schema_id, field_name, limit)
get_schema_examples(schema_id)
send_job_control_signal(job_id, signal_type, metadata)
```

---

### 5. Storage Layer

**Components**:

#### S3Uploader
```typescript
class S3Uploader {
  - uploadImage(buffer, options): Promise<UploadResult>
  - uploadBuffer(buffer, key, contentType): Promise<UploadResult>
  - uploadFile(options): Promise<UploadResult>
}
```

#### LocalFileStorage (Development)
```typescript
class LocalFileStorage {
  - saveFile(buffer, key): Promise<string>
  - getFile(key): Promise<Buffer>
  - deleteFile(key): Promise<void>
}
```

---

## Data Flow

### User Registration Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Submit registration form
     ▼
┌─────────────────────────────────┐
│  POST /api/auth/register        │
│  - Validate input               │
│  - Hash password (bcrypt)       │
└────┬────────────────────────────┘
     │ 2. Create user
     ▼
┌─────────────────────────────────┐
│  PostgreSQL                     │
│  - INSERT INTO auth.users       │
│  - INSERT INTO profiles         │
│  - INSERT INTO tenants          │
│  - INSERT INTO user_tenant_roles│
└────┬────────────────────────────┘
     │ 3. Generate JWT
     ▼
┌─────────────────────────────────┐
│  JWT Token Generation           │
│  - Sign with JWT_SECRET         │
│  - 7-day expiration             │
└────┬────────────────────────────┘
     │ 4. Return token + user data
     ▼
┌──────────┐
│  User    │
│  (Logged │
│   In)    │
└──────────┘
```

---

### Job Processing Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Create job
     ▼
┌─────────────────────────────────┐
│  POST /api/jobs/create          │
│  - Validate schema_id           │
│  - Create job record            │
│  - Status: "pending"            │
└────┬────────────────────────────┘
     │ 2. Job created
     ▼
┌─────────────────────────────────┐
│  POST /api/jobs/process         │
│  (Triggered by cron/webhook)    │
└────┬────────────────────────────┘
     │ 3. Fetch pending job
     ▼
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Update status: "running"     │
│  - Fetch schema definition      │
│  - Load example data            │
└────┬────────────────────────────┘
     │ 4. Process in batches
     ▼
┌─────────────────────────────────┐
│  For each record (batch of 10): │
│  ┌───────────────────────────┐  │
│  │ 1. Generate text fields   │  │
│  │    ├─ AIGenerator         │  │
│  │    └─ OpenRouter API      │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 2. Generate image fields  │  │
│  │    ├─ ImageService        │  │
│  │    ├─ OpenRouter Image    │  │
│  │    └─ S3 Upload           │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 3. Generate PDF fields    │  │
│  │    ├─ AIGenerator         │  │
│  │    ├─ PDFGenerator        │  │
│  │    ├─ Python Service      │  │
│  │    └─ S3 Upload           │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 4. Store record           │  │
│  │    └─ INSERT generated_data│ │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 5. Update progress        │  │
│  │    └─ UPDATE jobs         │  │
│  └───────────────────────────┘  │
└────┬────────────────────────────┘
     │ 6. All records generated
     ▼
┌─────────────────────────────────┐
│  Job Completion                 │
│  - Update status: "completed"   │
│  - Set completed_at timestamp   │
│  - Calculate metrics            │
└────┬────────────────────────────┘
     │ 7. Job complete
     ▼
┌──────────┐
│  User    │
│  (View   │
│   Data)  │
└──────────┘
```

---

### AI Text Generation Flow

```
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Need to generate field value │
└────┬────────────────────────────┘
     │ 1. Request generation
     ▼
┌─────────────────────────────────┐
│  AIGenerator                    │
│  - Fetch example data (if any)  │
└────┬────────────────────────────┘
     │ 2. Query examples
     ▼
┌─────────────────────────────────┐
│  PostgreSQL                     │
│  SELECT example_value           │
│  FROM example_data              │
│  WHERE field_name = $1          │
└────┬────────────────────────────┘
     │ 3. Examples returned
     ▼
┌─────────────────────────────────┐
│  AIGenerator                    │
│  - Build system prompt          │
│  - Build user prompt            │
│  - Include examples             │
│  - Include existing field data  │
└────┬────────────────────────────┘
     │ 4. Call AI API
     ▼
┌─────────────────────────────────┐
│  OpenRouter API                 │
│  POST /chat/completions         │
│  {                              │
│    model: "gemini-2.0-flash",   │
│    messages: [...],             │
│    response_format: json_schema │
│  }                              │
└────┬────────────────────────────┘
     │ 5. AI response
     ▼
┌─────────────────────────────────┐
│  AIGenerator                    │
│  - Parse JSON response          │
│  - Extract value                │
│  - Return to JobProcessor       │
└────┬────────────────────────────┘
     │ 6. Field value
     ▼
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Add to record                │
└─────────────────────────────────┘
```

---

### Image Generation Flow

```
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Need to generate image       │
└────┬────────────────────────────┘
     │ 1. Request image
     ▼
┌─────────────────────────────────┐
│  ImageGenerationService         │
│  - Enhance prompt with context  │
│  - Build detailed prompt        │
└────┬────────────────────────────┘
     │ 2. Call OpenRouter
     ▼
┌─────────────────────────────────┐
│  OpenRouter Image API           │
│  POST /images/generations       │
│  {                              │
│    prompt: "enhanced...",       │
│    width: 512,                  │
│    height: 512                  │
│  }                              │
└────┬────────────────────────────┘
     │ 3. Image data URL
     ▼
┌─────────────────────────────────┐
│  ImageGenerationService         │
│  - Convert data URL to buffer   │
│  - Calculate MD5 hash           │
└────┬────────────────────────────┘
     │ 4. Upload to S3
     ▼
┌─────────────────────────────────┐
│  S3Uploader                     │
│  - Generate unique key          │
│  - Upload buffer                │
│  - Set public permissions       │
└────┬────────────────────────────┘
     │ 5. Public URL
     ▼
┌─────────────────────────────────┐
│  ImageGenerationService         │
│  - Return URL + metadata        │
└────┬────────────────────────────┘
     │ 6. Image URL
     ▼
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Add URL to record            │
└─────────────────────────────────┘
```

---

### PDF Generation Flow

```
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Need to generate PDF         │
└────┬────────────────────────────┘
     │ 1. Generate content
     ▼
┌─────────────────────────────────┐
│  AIGenerator                    │
│  - Use document prompt          │
│  - max_tokens: 2000             │
│  - Generate full document text  │
└────┬────────────────────────────┘
     │ 2. Document content
     ▼
┌─────────────────────────────────┐
│  PDFGenerator (TypeScript)      │
│  - Call Python service          │
└────┬────────────────────────────┘
     │ 3. Spawn Python process
     ▼
┌─────────────────────────────────┐
│  pdf_service.py                 │
│  - Parse content                │
│  - Create PDF with ReportLab    │
│  - Format text (bold, bullets)  │
│  - Handle page breaks           │
│  - Return base64                │
└────┬────────────────────────────┘
     │ 4. PDF base64
     ▼
┌─────────────────────────────────┐
│  PDFGenerator (TypeScript)      │
│  - Convert base64 to buffer     │
└────┬────────────────────────────┘
     │ 5. Upload to S3
     ▼
┌─────────────────────────────────┐
│  S3Uploader                     │
│  - Generate key path            │
│  - Upload buffer                │
│  - Set content-type: pdf        │
└────┬────────────────────────────┘
     │ 6. Public URL
     ▼
┌─────────────────────────────────┐
│  JobProcessor                   │
│  - Add PDF URL to record        │
└─────────────────────────────────┘
```

---

## Component Diagrams

### Authentication System

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Flow                       │
└─────────────────────────────────────────────────────────────┘

User Input
    │
    ▼
┌─────────────────┐
│  Login Form     │
│  - Email        │
│  - Password     │
└────┬────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  POST /api/auth/login           │
│  ┌───────────────────────────┐  │
│  │ 1. Validate input         │  │
│  │ 2. Query user from DB     │  │
│  │ 3. Verify password        │  │
│  │    (bcrypt.compare)       │  │
│  │ 4. Generate JWT           │  │
│  │    (jsonwebtoken.sign)    │  │
│  │ 5. Return token + user    │  │
│  └───────────────────────────┘  │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Client Storage                 │
│  - Store token in localStorage  │
│  - Set Authorization header     │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Subsequent Requests            │
│  Authorization: Bearer <token>  │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Middleware Verification        │
│  ┌───────────────────────────┐  │
│  │ 1. Extract token          │  │
│  │ 2. Verify signature       │  │
│  │    (jsonwebtoken.verify)  │  │
│  │ 3. Check expiration       │  │
│  │ 4. Extract user ID        │  │
│  │ 5. Attach to request      │  │
│  └───────────────────────────┘  │
└────┬────────────────────────────┘
     │
     ▼
API Handler
```

---

### Multi-Tenancy System

```
┌─────────────────────────────────────────────────────────────┐
│                   Multi-Tenant Architecture                  │
└─────────────────────────────────────────────────────────────┘

User Request
    │
    ▼
┌─────────────────────────────────┐
│  Authentication                 │
│  - Verify JWT                   │
│  - Extract user_id              │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Tenant Resolution              │
│  SELECT tenant_id, role         │
│  FROM user_tenant_roles         │
│  WHERE user_id = $1             │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Authorization Check            │
│  - Verify user has access       │
│  - Check role permissions       │
│    (owner > admin > member)     │
└────┬────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Data Access (RLS)              │
│  - All queries filtered by      │
│    tenant_id automatically      │
│  - PostgreSQL RLS policies      │
│    enforce isolation            │
└────┬────────────────────────────┘
     │
     ▼
Response (Tenant-scoped data only)

┌─────────────────────────────────────────────────────────────┐
│                    Database Level (RLS)                      │
└─────────────────────────────────────────────────────────────┘

CREATE POLICY "tenant_isolation" ON schemas
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

Result: Users can ONLY see data from their tenants
```

---

## Database Architecture

### Entity Relationship Diagram

```
┌──────────────┐
│  auth.users  │
│──────────────│
│ id (PK)      │──┐
│ email        │  │
│ password_hash│  │
└──────────────┘  │
                  │
                  │ 1:1
                  │
                  ▼
┌──────────────┐  │
│  profiles    │  │
│──────────────│  │
│ id (PK,FK)   │◀─┘
│ email        │
│ full_name    │──┐
│ avatar_url   │  │
└──────────────┘  │
                  │ 1:N
                  │
                  ▼
┌────────────────────┐
│ user_tenant_roles  │
│────────────────────│
│ id (PK)            │
│ user_id (FK)       │◀─┐
│ tenant_id (FK)     │  │
│ role               │  │
└────────────────────┘  │
         │              │
         │ N:1          │
         ▼              │
┌──────────────┐        │
│   tenants    │        │
│──────────────│        │
│ id (PK)      │────────┘
│ name         │
│ slug         │──┐
└──────────────┘  │
                  │ 1:N
                  │
                  ▼
┌──────────────┐  │
│   schemas    │  │
│──────────────│  │
│ id (PK)      │◀─┘
│ tenant_id(FK)│──┐
│ name         │  │
│ definition   │  │
│ created_by   │  │
└──────────────┘  │
         │        │
         │ 1:N    │
         ▼        │
┌──────────────┐  │
│     jobs     │  │
│──────────────│  │
│ id (PK)      │◀─┘
│ tenant_id(FK)│
│ schema_id(FK)│──┐
│ name         │  │
│ status       │  │
│ progress     │  │
└──────────────┘  │
         │        │
         │ 1:N    │
         ▼        │
┌─────────────────┐│
│ generated_data  ││
│─────────────────││
│ id (PK)         ││
│ job_id (FK)     │◀┘
│ tenant_id (FK)  │
│ record_index    │
│ record_data     │
└─────────────────┘
         │
         │ 1:N
         ▼
┌──────────────┐
│    media     │
│──────────────│
│ id (PK)      │
│ job_id (FK)  │
│ record_id(FK)│
│ s3_key       │
│ public_url   │
└──────────────┘
```

---

### Data Isolation Strategy

```
Application Level:
┌─────────────────────────────────┐
│  API Route Handler              │
│  1. Authenticate user           │
│  2. Fetch user's tenant IDs     │
│  3. Filter queries by tenant_id │
└─────────────────────────────────┘

Database Level (RLS):
┌─────────────────────────────────┐
│  PostgreSQL Row Level Security  │
│  - Automatic filtering          │
│  - Cannot be bypassed           │
│  - Enforced at query execution  │
└─────────────────────────────────┘

Result: Defense in depth
```

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                         │
└─────────────────────────────────────────────────────────────┘

Layer 1: Network Security
├─ HTTPS/TLS encryption
├─ CORS policies
└─ Rate limiting

Layer 2: Authentication
├─ JWT tokens (HS256)
├─ Bcrypt password hashing
├─ Token expiration (7 days)
└─ Secure token storage

Layer 3: Authorization
├─ Role-based access control
├─ Tenant membership verification
└─ Permission checks

Layer 4: Data Security
├─ Row Level Security (RLS)
├─ Parameterized queries
├─ Input validation (Zod)
└─ XSS prevention

Layer 5: Application Security
├─ Environment variable protection
├─ Secret management
├─ Secure file uploads
└─ Error message sanitization
```

---

### Authentication Flow Diagram

```
┌──────────┐                    ┌──────────┐
│  Client  │                    │  Server  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │  1. POST /api/auth/login      │
     │  { email, password }          │
     ├──────────────────────────────>│
     │                               │
     │                               │ 2. Query user
     │                               ├─────────┐
     │                               │         │
     │                               │<────────┘
     │                               │
     │                               │ 3. Verify password
     │                               │    bcrypt.compare()
     │                               ├─────────┐
     │                               │         │
     │                               │<────────┘
     │                               │
     │                               │ 4. Generate JWT
     │                               │    jwt.sign()
     │                               ├─────────┐
     │                               │         │
     │                               │<────────┘
     │                               │
     │  5. { token, user }           │
     │<──────────────────────────────┤
     │                               │
     │ 6. Store token                │
     ├─────────┐                     │
     │         │                     │
     │<────────┘                     │
     │                               │
     │  7. GET /api/schemas          │
     │  Authorization: Bearer token  │
     ├──────────────────────────────>│
     │                               │
     │                               │ 8. Verify token
     │                               │    jwt.verify()
     │                               ├─────────┐
     │                               │         │
     │                               │<────────┘
     │                               │
     │                               │ 9. Extract user_id
     │                               │    Check RLS
     │                               ├─────────┐
     │                               │         │
     │                               │<────────┘
     │                               │
     │  10. { schemas: [...] }       │
     │<──────────────────────────────┤
     │                               │
```

---

## Deployment Architecture

### Production Deployment (Vercel)

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   CDN      │  │   Edge     │  │   DDoS     │            │
│  │  Caching   │  │  Functions │  │ Protection │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Application                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Serverless Functions (Node.js 18)                     │ │
│  │  - API Routes                                          │ │
│  │  - Server Components                                   │ │
│  │  - Background Jobs                                     │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ PostgreSQL  │  │   AWS S3    │  │ OpenRouter  │
│  Database   │  │   Storage   │  │   AI API    │
│             │  │             │  │             │
│ - Vercel    │  │ - Images    │  │ - Text Gen  │
│   Postgres  │  │ - PDFs      │  │ - Image Gen │
│ - or        │  │ - Examples  │  │             │
│  PostgreSQL │  │             │  │             │
│ - or        │  │             │  │             │
│   AWS RDS   │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

### Development Environment

```
┌─────────────────────────────────────────────────────────────┐
│                    Local Development                         │
└─────────────────────────────────────────────────────────────┘

Developer Machine
    │
    ├─ Next.js Dev Server (localhost:3000)
    │  └─ Hot Module Replacement
    │
    ├─ Docker PostgreSQL (localhost:5433)
    │  └─ Volume-mounted data
    │
    ├─ Python Runtime (for PDF generation)
    │  └─ pypdf + reportlab
    │
    └─ Local File Storage (uploads/)
       └─ Fallback for S3 in development

External Services:
    ├─ OpenRouter API (production)
    └─ AWS S3 (optional, can use local storage)
```

---

## Scalability Considerations

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                             │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Next.js    │  │  Next.js    │  │  Next.js    │
│  Instance 1 │  │  Instance 2 │  │  Instance N │
└─────────────┘  └─────────────┘  └─────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
                ┌─────────────────┐
                │   PostgreSQL    │
                │ Connection Pool │
                └─────────────────┘
```

### Database Scaling

```
Read Replicas:
┌─────────────┐
│   Primary   │───writes──┐
│  Database   │           │
└─────────────┘           │
       │                  │
       │ replication      │
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│  Read       │    │  Read       │
│  Replica 1  │    │  Replica 2  │
└─────────────┘    └─────────────┘
       │                  │
       └────reads─────────┘
```

### Job Processing Scaling

```
Queue-Based Processing (Future):

┌─────────────┐
│  Job Queue  │
│  (Redis)    │
└─────────────┘
       │
       ├─ Job 1
       ├─ Job 2
       ├─ Job 3
       └─ Job N
       │
       ▼
┌─────────────────────────────────┐
│     Worker Pool                 │
│  ┌────────┐  ┌────────┐        │
│  │Worker 1│  │Worker 2│  ...   │
│  └────────┘  └────────┘        │
└─────────────────────────────────┘
```

### Caching Strategy

```
Multi-Level Caching:

Level 1: Browser Cache
├─ Static assets (images, CSS, JS)
└─ Cache-Control headers

Level 2: CDN Cache (Vercel Edge)
├─ Static pages
├─ API responses (short TTL)
└─ Generated images

Level 3: Application Cache (Redis - Future)
├─ Schema definitions
├─ User sessions
└─ Frequently accessed data

Level 4: Database Query Cache
└─ PostgreSQL query results
```

---

## Performance Metrics

### Target Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Page Load Time | < 2s | ~1.5s |
| API Response Time | < 500ms | ~300ms |
| Job Processing (100 records) | < 5min | ~3min |
| Database Query Time | < 100ms | ~50ms |
| Image Generation | < 10s | ~8s |
| PDF Generation | < 5s | ~3s |

---

## Monitoring & Observability

### Logging Strategy

```
Application Logs:
├─ [v0] prefix for all logs
├─ Structured JSON logging
├─ Log levels: info, warning, error, debug
└─ Contextual data (jobId, tenantId, userId)

Database Logs:
├─ Query execution time
├─ Slow query detection (> 1s)
└─ Connection pool metrics

Error Tracking:
├─ Error messages
├─ Stack traces
├─ Request context
└─ User context
```

---

**Architecture Version**: 1.0.0  
**Last Updated**: October 26, 2025  
**Maintained By**: Development Team

