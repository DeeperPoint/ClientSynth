# Client Synth - Comprehensive Technical Documentation

**Version:** 1.0.0  
**Last Updated:** October 24, 2025  
**Author:** Tinsae Tadesse

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Core Features](#core-features)
6. [API Reference](#api-reference)
7. [Authentication & Authorization](#authentication--authorization)
8. [Data Generation Engine](#data-generation-engine)
9. [File Storage & Management](#file-storage--management)
10. [Frontend Architecture](#frontend-architecture)
11. [Deployment & Infrastructure](#deployment--infrastructure)
12. [Development Setup](#development-setup)
13. [Testing Strategy](#testing-strategy)
14. [Security Considerations](#security-considerations)
15. [Performance Optimization](#performance-optimization)
16. [Troubleshooting Guide](#troubleshooting-guide)
17. [API Changelog](#api-changelog)

---

## Executive Summary

### What is Client Synth?

Client Synth is an enterprise-grade, multi-tenant SaaS platform designed to generate realistic synthetic data for testing, development, and demonstration purposes. Unlike traditional data generation tools that produce random or Lorem Ipsum-style data, Client Synth leverages cutting-edge AI models to create contextually coherent, realistic datasets that include:

- **AI-Generated Text**: Names, addresses, job titles, company information, and custom fields
- **AI-Generated Images**: Professional headshots and contextual images
- **AI-Generated Documents**: Complete PDF documents (resumes, reports, contracts)
- **Structured Data**: JSON, CSV, Excel, SQL, XML, and Parquet exports

### Key Differentiators

1. **Context-Aware Generation**: Fields reference each other intelligently (e.g., a person's job title matches their company's industry)
2. **Example-Based Learning**: Upload CSV/JSON/Excel files with examples to guide AI generation style
3. **Multi-Format Support**: 18 field types including text, numbers, dates, images, PDFs, URLs, and more
4. **Enterprise Multi-Tenancy**: Complete data isolation with role-based access control
5. **Scalable Architecture**: Process jobs with millions of records using batch processing and retry logic

### Use Cases

- **QA Testing**: Generate realistic test data for application testing
- **Demo Environments**: Create convincing demo datasets for sales presentations
- **Development**: Populate development databases with realistic data
- **Data Science**: Generate synthetic training data for ML models
- **Privacy Compliance**: Replace sensitive production data with synthetic alternatives

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  Next.js 14 App Router │ React Server Components │ Tailwind CSS │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (Next.js API Routes)              │
│  Authentication │ Job Management │ Schema Management │ Exports   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│    PROCESSING LAYER          │  │    DATA LAYER                │
│  • JobProcessor              │  │  • PostgreSQL 15+            │
│  • AIGenerator               │  │  • Row Level Security        │
│  • ImageService              │  │  • JSONB for schemas         │
│  • PDFGenerator              │  │  • Connection pooling        │
│  • BatchImageGenerator       │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ OpenRouter  │ │   AWS S3    │ │   Python    │
│  AI APIs    │ │   Storage   │ │ PDF Service │
└─────────────┘ └─────────────┘ └─────────────┘
```

### Component Breakdown

#### 1. Frontend Layer (Next.js 14)
- **Framework**: Next.js 14 with App Router
- **Rendering**: React Server Components for optimal performance
- **Styling**: Tailwind CSS v4 with custom design system
- **UI Components**: Radix UI primitives + shadcn/ui (50+ components)
- **State Management**: React hooks with server-side data fetching
- **Forms**: React Hook Form with Zod validation

#### 2. API Layer (Next.js API Routes)
- **Runtime**: Edge & Node.js runtimes
- **Authentication**: Custom JWT-based system
- **Database Access**: Direct SQL with parameterized queries (pg library)
- **File Handling**: Multipart form data processing
- **Error Handling**: Structured error responses with logging

#### 3. Processing Layer
- **Job Processor**: Orchestrates data generation workflows
- **AI Generator**: Interfaces with OpenRouter for text generation
- **Image Service**: Manages AI image generation via OpenRouter
- **PDF Generator**: Creates PDF documents using Python (ReportLab)
- **Batch Processor**: Handles large-scale image generation

#### 4. Data Layer
- **Database**: PostgreSQL 15+ with full ACID compliance
- **Security**: Row Level Security (RLS) for tenant isolation
- **Schema Storage**: JSONB for flexible schema definitions
- **Indexing**: Optimized indexes for query performance
- **Migrations**: 17 migration scripts for schema evolution

#### 5. External Services
- **OpenRouter**: AI text and image generation (100+ models)
- **AWS S3**: File storage for images, PDFs, and example files
- **Python Runtime**: PDF generation and manipulation

---

## Technology Stack

### Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.2.16 | Full-stack React framework |
| **TypeScript** | 5.x | Type-safe development |
| **PostgreSQL** | 15+ | Primary database |
| **Node.js** | 18+ | Runtime environment |
| **Python** | 3.9+ | PDF generation |
| **pg** | 8.16.3 | PostgreSQL client |
| **bcryptjs** | 2.4.3 | Password hashing |
| **jsonwebtoken** | 9.0.2 | JWT authentication |

### AI & ML Services

| Service | Purpose | Models |
|---------|---------|--------|
| **OpenRouter** | Text generation | Gemini 2.5 Flash, GPT-4, Claude 3.5, Llama 3.1 |
| **OpenRouter Image API** | Image generation | FLUX.1, Stable Diffusion, DALL-E |
| **Google Gemini** | Default text model | Gemini 2.5 Flash |

### Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18 | UI library |
| **Tailwind CSS** | 4.1.9 | Utility-first CSS |
| **Radix UI** | Latest | Accessible UI primitives |
| **shadcn/ui** | Latest | Pre-built components |
| **React Hook Form** | 7.60.0 | Form management |
| **Zod** | 3.25.67 | Schema validation |
| **Lucide React** | 0.454.0 | Icon library |

### Storage & Infrastructure

| Service | Purpose |
|---------|---------|
| **AWS S3** | File storage (images, PDFs, examples) |
| **Vercel** | Application hosting |
| **Docker** | Local PostgreSQL container |

### Development Tools

| Tool | Purpose |
|------|---------|
| **Jest** | Unit & integration testing |
| **TypeScript ESLint** | Code linting |
| **Prettier** | Code formatting |
| **tsx** | TypeScript execution |

---

## Database Schema

### Core Tables

#### 1. Authentication & Users

```sql
-- auth.users (managed by authentication system)
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2. Multi-Tenancy

```sql
-- Tenants (organizations)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Tenant relationships with roles
CREATE TABLE public.user_tenant_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);
```

#### 3. Schema Management

```sql
-- Data generation schemas
CREATE TABLE public.schemas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  schema_definition JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Schema Definition Structure (JSONB):**
```json
{
  "fields": [
    {
      "name": "first_name",
      "type": "name",
      "description": "Person's first name",
      "required": true
    },
    {
      "name": "profile_image",
      "type": "image",
      "description": "Professional headshot",
      "required": false
    },
    {
      "name": "resume",
      "type": "pdf",
      "description": "Complete resume document",
      "required": true
    }
  ]
}
```

#### 4. Job Management

```sql
-- Generation jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'processing', 'completed', 'failed', 'paused', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_records INTEGER NOT NULL,
  generated_records INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  can_be_paused BOOLEAN DEFAULT true,
  can_be_cancelled BOOLEAN DEFAULT true,
  can_be_retried BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job execution logs
CREATE TABLE public.job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job control signals
CREATE TABLE public.job_control_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('pause', 'resume', 'cancel', 'retry')),
  issued_by UUID REFERENCES public.profiles(id),
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);
```

#### 5. Generated Data

```sql
-- Generated records
CREATE TABLE public.generated_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_index INTEGER NOT NULL,
  record_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Record Data Structure (JSONB):**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "job_title": "Senior Software Engineer",
  "company": "Tech Corp",
  "profile_image": "https://bucket.s3.amazonaws.com/synthetic-data/tenant-id/2025-10-26/job-id/record-0/profile_image.png",
  "resume": "https://bucket.s3.amazonaws.com/tenant-id/job-id/record_0_resume.pdf"
}
```

#### 6. Media Management

```sql
-- Media files (images, PDFs)
CREATE TABLE public.media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.generated_data(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'pdf', 'document')),
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  md5_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 7. Export System

```sql
-- Data exports
CREATE TABLE public.exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'xlsx', 'sql', 'xml', 'parquet')),
  file_size INTEGER,
  record_count INTEGER NOT NULL,
  s3_key TEXT,
  download_url TEXT,
  filters JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);
```

#### 8. Example Files System

```sql
-- Example files for AI learning
CREATE TABLE public.example_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'json', 'xlsx', 'xls')),
  file_size INTEGER NOT NULL,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  md5_hash TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Parsed example data
CREATE TABLE public.example_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  example_file_id UUID NOT NULL REFERENCES public.example_files(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  example_value TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 9. Intelligence & Analytics

```sql
-- Seed management for variation
CREATE TABLE public.seeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.seed_categories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  seed_type VARCHAR(50) NOT NULL,
  quality_score INTEGER DEFAULT 50 CHECK (quality_score >= 0 AND quality_score <= 100),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generation metrics
CREATE TABLE public.generation_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4) NOT NULL,
  metric_metadata JSONB DEFAULT '{}',
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Row Level Security (RLS)

All tenant-scoped tables have RLS policies ensuring complete data isolation:

```sql
-- Example RLS policy for schemas table
CREATE POLICY "Users can view schemas from their tenants" ON public.schemas
  FOR SELECT USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );
```

### Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_jobs_tenant_status ON public.jobs(tenant_id, status);
CREATE INDEX idx_jobs_schema ON public.jobs(schema_id);
CREATE INDEX idx_generated_data_job ON public.generated_data(job_id);
CREATE INDEX idx_generated_data_tenant ON public.generated_data(tenant_id);
CREATE INDEX idx_media_job_field ON public.media(job_id, field_name);
CREATE INDEX idx_example_files_schema ON public.example_files(schema_id);
CREATE INDEX idx_example_data_file_field ON public.example_data(example_file_id, field_name);
```

---

## Core Features

### 1. Schema Designer

The Schema Designer allows users to create flexible data structures with 18 supported field types.

#### Supported Field Types

| Field Type | Description | Example Output |
|------------|-------------|----------------|
| **name** | Person's full name | "John Smith" |
| **first_name** | First name only | "John" |
| **last_name** | Last name only | "Smith" |
| **email** | Email address | "john.smith@example.com" |
| **phone** | Phone number | "+1-555-123-4567" |
| **address** | Street address | "123 Main St, Apt 4B" |
| **city** | City name | "San Francisco" |
| **state** | State/province | "California" |
| **zip** | Postal code | "94102" |
| **country** | Country name | "United States" |
| **company** | Company name | "Tech Innovations Inc." |
| **job_title** | Job position | "Senior Software Engineer" |
| **industry** | Industry sector | "Technology" |
| **date** | Date value | "2025-10-26" |
| **number** | Numeric value | "42" |
| **text** | Free-form text | "Lorem ipsum..." |
| **url** | Website URL | "https://example.com" |
| **image** | AI-generated image | S3 URL to PNG image |
| **pdf** | AI-generated PDF document | S3 URL to PDF file |

#### Schema Creation Flow

```typescript
// Frontend: Schema creation request
const schema = {
  name: "Client Profiles",
  description: "Realistic client data for testing",
  schema_definition: {
    fields: [
      {
        name: "full_name",
        type: "name",
        description: "Client's full name",
        required: true
      },
      {
        name: "email",
        type: "email",
        description: "Professional email address",
        required: true
      },
      {
        name: "profile_photo",
        type: "image",
        description: "Professional headshot",
        required: false
      },
      {
        name: "resume",
        type: "pdf",
        description: "Complete resume with experience",
        required: true
      }
    ]
  }
};

// API: POST /api/schemas/create
```

### 2. Example-Based Learning

Upload CSV, JSON, or Excel files with example data to guide AI generation.

#### How It Works

1. **File Upload**: User uploads example file (CSV/JSON/Excel)
2. **Parsing**: `FileParser` extracts field names and values
3. **Field Mapping**: System suggests mappings to schema fields
4. **Storage**: Examples stored in `example_files` and `example_data` tables
5. **AI Integration**: Examples included in AI prompts during generation

#### Example File Format

**CSV Example:**
```csv
first_name,last_name,job_title,company
John,Smith,Software Engineer,Tech Corp
Jane,Doe,Product Manager,Innovation Labs
```

**JSON Example:**
```json
[
  {
    "first_name": "John",
    "last_name": "Smith",
    "job_title": "Software Engineer",
    "company": "Tech Corp"
  },
  {
    "first_name": "Jane",
    "last_name": "Doe",
    "job_title": "Product Manager",
    "company": "Innovation Labs"
  }
]
```

#### API Endpoints

```typescript
// Upload example file
POST /api/schemas/[id]/examples/upload
Content-Type: multipart/form-data

// Get field mapping suggestions
POST /api/schemas/[id]/examples/mapping
Body: { fieldNames: string[], schemaFields: string[] }

// Fetch examples for generation
GET /api/schemas/[id]/examples
```

### 3. Job Processing Engine

The Job Processor orchestrates data generation with advanced features.

#### Job Lifecycle

```
pending → running → processing → completed
                    ↓
                  failed (can retry)
                    ↓
                  paused (can resume)
                    ↓
                cancelled
```

#### Job Configuration

```typescript
interface JobConfig {
  total_records: number;      // Number of records to generate
  batch_size?: number;         // Records per batch (default: 10)
  max_retries?: number;        // Retry attempts (default: 3)
  retry_delay?: number;        // Delay between retries (ms)
  ai_model?: string;           // OpenRouter model ID
  image_model?: string;        // Image generation model
  enable_variation?: boolean;  // Use seed variation
  context_awareness?: boolean; // Enable field relationships
}
```

#### Job Processing Flow

```typescript
// 1. Job Creation
POST /api/jobs/create
{
  schema_id: "uuid",
  name: "Test Data Generation",
  total_records: 100,
  config: { batch_size: 10 }
}

// 2. Job Processing (automatic)
// JobProcessor.processNextJob() runs via cron or manual trigger

// 3. Record Generation Loop
for (let i = 0; i < total_records; i++) {
  // Generate text fields using AI
  // Generate image fields using OpenRouter Image API
  // Generate PDF fields using Python service
  // Store record in generated_data table
  // Update job progress
}

// 4. Job Completion
// Update job status to 'completed'
// Calculate final metrics
```

#### Job Control

```typescript
// Pause job
POST /api/jobs/control
{ jobId: "uuid", action: "pause" }

// Resume job
POST /api/jobs/control
{ jobId: "uuid", action: "resume" }

// Cancel job
POST /api/jobs/control
{ jobId: "uuid", action: "cancel" }

// Retry failed job
POST /api/jobs/control
{ jobId: "uuid", action: "retry" }
```

### 4. AI Text Generation

Powered by OpenRouter with support for 100+ models.

#### Generation Process

```typescript
class AIGenerator {
  async generateFieldValue(context: GenerationContext): Promise<string> {
    // 1. Fetch example data if available
    const examples = await this.fetchExampleData(
      context.schemaId,
      context.fieldName
    );
    
    // 2. Build context-aware prompt
    const systemPrompt = this.systemPromptFor(context.fieldType);
    const userPrompt = this.buildPrompt(context, examples);
    
    // 3. Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'field_value',
            strict: true,
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value']
            }
          }
        },
        max_tokens: context.fieldType.includes('pdf') ? 2000 : 150
      })
    });
    
    // 4. Parse and return result
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content).value;
  }
}
```

#### Context-Aware Prompts

The AI generator uses existing field values to generate coherent data:

```typescript
// Example: Generating job_title based on company
const context = {
  fieldType: 'job_title',
  fieldName: 'job_title',
  existingData: {
    company: 'Tech Innovations Inc.',
    industry: 'Technology'
  }
};

// Generated prompt includes context:
// "Generate a job_title for a person working at Tech Innovations Inc. 
//  in the Technology industry. Examples: Software Engineer, Product Manager..."
```

#### PDF Document Generation

For PDF fields, the AI generates complete document content:

```typescript
// System prompt for PDF/resume generation
const systemPrompt = `You are generating a complete professional resume document.
Include the following sections:

**CONTACT INFORMATION**
Full name, email, phone, location

**PROFESSIONAL SUMMARY**
2-3 sentence career overview

**WORK EXPERIENCE**
3-4 positions with:
- Company name and dates
- Job title
- 3-5 bullet points of achievements

**EDUCATION**
Degree, institution, graduation year

**SKILLS**
Technical and soft skills

Format with markdown: **Section Headers** and - bullet points`;
```

### 5. AI Image Generation

Professional images generated via OpenRouter Image API.

#### Image Generation Flow

```typescript
class ImageGenerationService {
  async generateAndUploadImage(request: ImageGenerationRequest) {
    // 1. Enhance prompt with context
    const enhancedPrompt = await this.promptEnhancer.enhancePrompt({
      basePrompt: request.prompt,
      recordData: request.recordData,
      fieldDescription: request.fieldDescription,
      style: request.style || 'professional'
    });
    
    // 2. Generate image via OpenRouter
    const result = await this.provider.generateImage({
      prompt: enhancedPrompt,
      width: 512,
      height: 512,
      quality: 'standard'
    });
    
    // 3. Upload to S3
    const uploadResult = await this.s3Uploader.uploadImage(result.buffer, {
      tenantId: request.tenantId,
      jobId: request.jobId,
      recordId: request.recordId,
      fieldName: request.fieldName,
      contentType: result.contentType
    });
    
    // 4. Return public URL
    return {
      url: uploadResult.publicUrl,
      s3Key: uploadResult.key,
      fileSize: result.buffer.length,
      md5Hash: uploadResult.md5Hash
    };
  }
}
```

#### Prompt Enhancement

```typescript
// Base prompt: "professional headshot"
// Record data: { name: "John Smith", job_title: "CEO", company: "Tech Corp" }

// Enhanced prompt:
"Professional headshot photo of person named John Smith, 
working as CEO at Tech Corp. Professional, high-quality, 
realistic photo. Business attire, neutral background, 
confident expression."
```

### 6. PDF Document Generation

Complete PDF documents with formatted content.

#### PDF Generation Architecture

```
TypeScript (Node.js)          Python Service
┌─────────────────┐          ┌──────────────────┐
│ PDFGenerator    │          │ pdf_service.py   │
│                 │──JSON──▶ │                  │
│ createFromContent│          │ pdf_content_create│
└─────────────────┘          └──────────────────┘
         │                            │
         │                            ▼
         │                   ┌──────────────────┐
         │                   │ ReportLab        │
         │                   │ - Text rendering │
         │                   │ - Bold headers   │
         │                   │ - Bullet points  │
         │                   │ - Page breaks    │
         │                   └──────────────────┘
         │                            │
         │◀────────base64 PDF─────────┘
         │
         ▼
┌─────────────────┐
│ S3Uploader      │
│ uploadBuffer()  │
└─────────────────┘
```

#### PDF Creation Process

```typescript
// 1. Generate content using AI
const pdfContent = await aiGenerator.generateFieldValue({
  fieldType: 'pdf',
  fieldName: 'resume',
  fieldDescription: 'Complete professional resume',
  recordIndex: 0,
  existingData: { name: 'John Smith', job_title: 'Software Engineer' }
});

// 2. Create PDF from content
const pdfResult = await pdfGenerator.createFromContent({
  title: 'Resume - John Smith',
  content: pdfContent,
  pageSize: 'A4',
  marginMm: 20
});

// 3. Upload to S3
const s3Result = await pdfGenerator.uploadPDFToS3(
  pdfResult.pdfBase64,
  tenantId,
  jobId,
  'record_0_resume.pdf'
);

// 4. Store URL in record
record.resume = s3Result.url;
```

#### PDF Formatting Features

- **Bold Headers**: Text wrapped in `**` becomes bold
- **Bullet Points**: Lines starting with `- ` become bullet lists
- **Text Wrapping**: Automatic line wrapping within margins
- **Page Breaks**: Automatic pagination
- **Custom Margins**: Configurable page margins
- **Page Sizes**: A4 or Letter format

### 7. Export System

Export generated data in 6 formats with flexible filtering.

#### Supported Formats

| Format | Extension | Max Records | Use Case |
|--------|-----------|-------------|----------|
| **CSV** | .csv | 1M | Spreadsheet import |
| **JSON** | .json | 500K | API integration |
| **Excel** | .xlsx | 1M | Business analysis |
| **SQL** | .sql | 10M | Database import |
| **XML** | .xml | 500K | Legacy systems |
| **Parquet** | .parquet | 10M | Big data analytics |

#### Export API

```typescript
POST /api/exports/create
{
  job_id: "uuid",
  format: "csv",
  filters: {
    fields: ["name", "email", "company"],  // Select specific fields
    limit: 1000,                            // Limit records
    offset: 0                               // Pagination offset
  }
}

// Response
{
  export_id: "uuid",
  download_url: "https://...",
  file_size: 245678,
  record_count: 1000,
  expires_at: "2025-11-02T00:00:00Z"
}
```

#### Export Generation

```typescript
class ExportGenerator {
  async generateExport(jobId: string, options: ExportOptions) {
    // 1. Fetch generated data
    const records = await this.fetchRecords(jobId, options.filters);
    
    // 2. Apply field filtering
    const filteredRecords = this.filterFields(records, options.filters.fields);
    
    // 3. Generate format-specific output
    switch (options.format) {
      case 'csv':
        return this.generateCSV(filteredRecords);
      case 'json':
        return this.generateJSON(filteredRecords);
      case 'xlsx':
        return await this.generateXLSX(filteredRecords);
      case 'sql':
        return this.generateSQL(filteredRecords, jobId);
      case 'xml':
        return this.generateXML(filteredRecords);
      case 'parquet':
        return await this.generateParquet(filteredRecords);
    }
  }
}
```

---

## API Reference

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "John Smith"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Smith"
  },
  "token": "jwt-token",
  "tenant": {
    "id": "uuid",
    "name": "John Smith's Workspace"
  }
}
```

#### POST /api/auth/login
Authenticate user and receive JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Smith"
  }
}
```

#### GET /api/auth/me
Get current authenticated user.

**Headers:**
```
Authorization: Bearer jwt-token
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Smith",
    "tenants": [
      {
        "id": "uuid",
        "name": "Workspace",
        "role": "owner"
      }
    ]
  }
}
```

### Schema Endpoints

#### POST /api/schemas/create
Create a new data generation schema.

**Request:**
```json
{
  "name": "Client Profiles",
  "description": "Realistic client data",
  "schema_definition": {
    "fields": [
      {
        "name": "full_name",
        "type": "name",
        "description": "Client's full name",
        "required": true
      },
      {
        "name": "email",
        "type": "email",
        "description": "Email address",
        "required": true
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "schema": {
    "id": "uuid",
    "name": "Client Profiles",
    "tenant_id": "uuid",
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

#### GET /api/schemas
List all schemas for current tenant.

**Response:**
```json
{
  "schemas": [
    {
      "id": "uuid",
      "name": "Client Profiles",
      "description": "Realistic client data",
      "created_by": "John Smith",
      "created_at": "2025-10-26T12:00:00Z",
      "field_count": 5
    }
  ]
}
```

#### GET /api/schemas/[id]
Get schema details.

**Response:**
```json
{
  "schema": {
    "id": "uuid",
    "name": "Client Profiles",
    "description": "Realistic client data",
    "schema_definition": {
      "fields": [...]
    },
    "created_by": "John Smith",
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

### Job Endpoints

#### POST /api/jobs/create
Create a new generation job.

**Request:**
```json
{
  "schema_id": "uuid",
  "name": "Test Data - October 2025",
  "total_records": 100,
  "config": {
    "batch_size": 10,
    "ai_model": "google/gemini-2.0-flash-exp:free",
    "enable_variation": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "name": "Test Data - October 2025",
    "status": "pending",
    "total_records": 100,
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

#### POST /api/jobs/process
Process next pending job (internal/cron).

**Response:**
```json
{
  "success": true,
  "processed": true,
  "job_id": "uuid",
  "records_generated": 100
}
```

#### POST /api/jobs/control
Control job execution (pause/resume/cancel/retry).

**Request:**
```json
{
  "jobId": "uuid",
  "action": "pause"
}
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "status": "paused",
    "updated_at": "2025-10-26T12:30:00Z"
  }
}
```

#### GET /api/jobs/[id]
Get job details and progress.

**Response:**
```json
{
  "job": {
    "id": "uuid",
    "name": "Test Data - October 2025",
    "status": "processing",
    "progress": 45,
    "total_records": 100,
    "generated_records": 45,
    "started_at": "2025-10-26T12:00:00Z",
    "estimated_completion": "2025-10-26T12:15:00Z"
  }
}
```

### Export Endpoints

#### POST /api/exports/create
Create a data export.

**Request:**
```json
{
  "job_id": "uuid",
  "format": "csv",
  "filters": {
    "fields": ["name", "email", "company"],
    "limit": 1000,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "export": {
    "id": "uuid",
    "download_url": "https://bucket.s3.amazonaws.com/exports/export-uuid.csv",
    "file_size": 245678,
    "record_count": 1000,
    "format": "csv",
    "expires_at": "2025-11-02T12:00:00Z"
  }
}
```

### Example File Endpoints

#### POST /api/schemas/[id]/examples/upload
Upload example file for AI learning.

**Request:**
```
Content-Type: multipart/form-data

file: example.csv
fieldMappings: {"first_name": "name", "email": "email"}
```

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "uuid",
    "file_name": "example.csv",
    "file_size": 12345,
    "parsed_rows": 50,
    "fields_mapped": 5
  }
}
```

#### POST /api/schemas/[id]/examples/mapping
Get field mapping suggestions.

**Request:**
```json
{
  "fieldNames": ["first_name", "last_name", "email"],
  "schemaFields": ["name", "email", "company"]
}
```

**Response:**
```json
{
  "suggestions": {
    "first_name": "name",
    "last_name": "name",
    "email": "email"
  }
}
```

### Dashboard Endpoints

#### GET /api/dashboard/stats
Get dashboard statistics.

**Response:**
```json
{
  "stats": {
    "schema_count": 5,
    "job_count": 23,
    "export_count": 12,
    "success_rate": 95.6
  },
  "recent_activities": [
    {
      "id": "uuid",
      "type": "job_completed",
      "job_name": "Test Data - October 2025",
      "created_at": "2025-10-26T12:00:00Z"
    }
  ]
}
```

---

## Authentication & Authorization

### JWT-Based Authentication

Client Synth uses custom JWT authentication (migrated from Supabase).

#### Authentication Flow

```
1. User Registration
   ├─▶ POST /api/auth/register
   ├─▶ Hash password with bcrypt
   ├─▶ Create user in auth.users
   ├─▶ Create profile in profiles
   ├─▶ Create default tenant
   ├─▶ Assign owner role
   └─▶ Return JWT token

2. User Login
   ├─▶ POST /api/auth/login
   ├─▶ Verify password
   ├─▶ Generate JWT token
   └─▶ Return token + user data

3. Authenticated Requests
   ├─▶ Include Authorization: Bearer <token>
   ├─▶ Middleware verifies JWT
   ├─▶ Extract user ID from token
   └─▶ Proceed with request
```

#### JWT Token Structure

```typescript
interface JWTPayload {
  userId: string;      // User UUID
  email: string;       // User email
  iat: number;         // Issued at timestamp
  exp: number;         // Expiration timestamp (7 days)
}
```

#### Password Security

- **Hashing**: bcrypt with salt rounds = 10
- **Minimum Length**: 8 characters
- **Storage**: Only hashed passwords stored in database
- **Validation**: Password strength validation on registration

### Role-Based Access Control (RBAC)

Three roles per tenant:

| Role | Permissions |
|------|-------------|
| **Owner** | Full access: manage tenant, users, schemas, jobs, exports |
| **Admin** | Manage schemas, jobs, exports; cannot delete tenant |
| **Member** | View schemas, create jobs, download exports |

#### Permission Checks

```typescript
// Middleware example
async function checkTenantAccess(userId: string, tenantId: string, requiredRole?: string) {
  const result = await query(`
    SELECT role FROM user_tenant_roles
    WHERE user_id = $1 AND tenant_id = $2
  `, [userId, tenantId]);
  
  if (result.rows.length === 0) {
    throw new Error('Access denied');
  }
  
  if (requiredRole) {
    const roleHierarchy = { owner: 3, admin: 2, member: 1 };
    const userRoleLevel = roleHierarchy[result.rows[0].role];
    const requiredLevel = roleHierarchy[requiredRole];
    
    if (userRoleLevel < requiredLevel) {
      throw new Error('Insufficient permissions');
    }
  }
  
  return result.rows[0].role;
}
```

### Row Level Security (RLS)

PostgreSQL RLS ensures data isolation at the database level.

#### RLS Policy Example

```sql
-- Users can only see jobs from their tenants
CREATE POLICY "Users can view jobs from their tenants" ON public.jobs
  FOR SELECT USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );
```

#### auth.uid() Function

Custom function to get current user ID from JWT:

```sql
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
  -- Extract user ID from current session
  -- Implementation varies based on authentication system
  RETURN current_setting('app.current_user_id', true)::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Data Generation Engine

### Generation Pipeline

```
1. Job Initialization
   ├─▶ Fetch schema definition
   ├─▶ Parse field types
   ├─▶ Load example data (if available)
   └─▶ Initialize generation context

2. Batch Processing
   ├─▶ Process records in batches (default: 10)
   ├─▶ For each record:
   │   ├─▶ Generate text fields (AI)
   │   ├─▶ Generate image fields (OpenRouter)
   │   ├─▶ Generate PDF fields (Python + AI)
   │   └─▶ Store record in database
   ├─▶ Update job progress
   └─▶ Handle errors with retry logic

3. Job Completion
   ├─▶ Update job status
   ├─▶ Calculate metrics
   └─▶ Trigger completion webhook (if configured)
```

### AI Model Selection

#### Default Models

- **Text Generation**: `google/gemini-2.0-flash-exp:free`
- **Image Generation**: OpenRouter Image API (FLUX.1)
- **Fallback**: `anthropic/claude-3.5-sonnet`

#### Model Configuration

```typescript
// In job config
{
  ai_model: "google/gemini-2.0-flash-exp:free",
  image_model: "black-forest-labs/flux-1-schnell",
  temperature: 0.7,
  max_tokens: 150
}
```

### Context-Aware Generation

Fields reference each other for coherent data:

```typescript
// Example: Generating email based on name
const record = {
  first_name: "John",
  last_name: "Smith",
  company: "Tech Corp"
};

// AI prompt for email field:
// "Generate an email address for John Smith working at Tech Corp.
//  Format: firstname.lastname@company.com or similar professional format."

// Generated: john.smith@techcorp.com
```

### Variation Engine

Prevents repetitive data using seed management:

```typescript
class VariationEngine {
  async selectSeed(fieldType: string, jobId: string): Promise<Seed> {
    // 1. Get available seeds for field type
    const seeds = await this.getAvailableSeeds(fieldType);
    
    // 2. Filter out recently used seeds (cooldown)
    const availableSeeds = seeds.filter(seed => 
      !this.isOnCooldown(seed.id, jobId)
    );
    
    // 3. Select seed based on quality score
    const selectedSeed = this.weightedRandomSelection(availableSeeds);
    
    // 4. Mark seed as used
    await this.markSeedUsed(selectedSeed.id, jobId);
    
    return selectedSeed;
  }
}
```

### Error Handling & Retry Logic

```typescript
interface RetryConfig {
  maxRetries: number;        // Default: 3
  backoffMultiplier: number; // Default: 2
  initialDelay: number;      // Default: 1000ms
}

async function generateWithRetry(
  generateFn: () => Promise<any>,
  config: RetryConfig
): Promise<any> {
  let attempt = 0;
  let delay = config.initialDelay;
  
  while (attempt < config.maxRetries) {
    try {
      return await generateFn();
    } catch (error) {
      attempt++;
      
      if (attempt >= config.maxRetries) {
        throw error;
      }
      
      console.log(`Retry attempt ${attempt} after ${delay}ms`);
      await sleep(delay);
      delay *= config.backoffMultiplier;
    }
  }
}
```

---

## File Storage & Management

### AWS S3 Architecture

```
S3 Bucket: synthetic-client-assets-1761171658
├── synthetic-data/
│   └── {tenant_id}/
│       └── {date}/
│           └── {job_id}/
│               └── {record_id}/
│                   ├── profile_image-{hash}-{random}.png
│                   └── company_logo-{hash}-{random}.png
├── {tenant_id}/
│   └── {job_id}/
│       ├── record_0_resume.pdf
│       ├── record_1_resume.pdf
│       └── ...
└── example-files/
    └── {tenant_id}/
        └── {date}/
            └── {schema_id}/
                └── example.csv-{hash}-{random}
```

### S3 Upload Process

```typescript
class S3Uploader {
  async uploadImage(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    // 1. Generate MD5 hash
    const md5Hash = crypto.createHash('md5').update(buffer).digest('hex');
    
    // 2. Create structured key
    const timestamp = new Date().toISOString().split('T')[0];
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const key = `synthetic-data/${options.tenantId}/${timestamp}/${options.jobId}/${options.recordId}/${options.fieldName}-${md5Hash.substring(0, 8)}-${randomSuffix}.png`;
    
    // 3. Upload to S3
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: options.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        tenantId: options.tenantId,
        jobId: options.jobId,
        recordId: options.recordId,
        fieldName: options.fieldName,
        md5: md5Hash
      }
    }));
    
    // 4. Generate public URL
    const publicUrl = `https://${this.bucketName}.s3.amazonaws.com/${key}`;
    
    return { key, url: publicUrl, md5Hash };
  }
}
```

### Local Storage Fallback

For development without AWS credentials:

```typescript
class LocalFileStorage {
  private baseDir = path.join(process.cwd(), 'uploads');
  
  async saveFile(buffer: Buffer, key: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    
    // Return local URL
    return `/api/files/${key}`;
  }
}

// API route to serve local files
// GET /api/files/[...path]
```

### File Access Patterns

#### Public Access
- Generated images: Public read access
- Generated PDFs: Public read access
- Example files: Tenant-scoped access

#### S3 Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::synthetic-client-assets-1761171658/*"
    }
  ]
}
```

#### CORS Configuration

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

---

## Frontend Architecture

### Next.js App Router Structure

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx              # Login page
│   ├── sign-up/
│   │   └── page.tsx              # Registration page
│   └── sign-up-success/
│       └── page.tsx              # Success confirmation
├── dashboard/
│   ├── layout.tsx                # Dashboard shell
│   ├── page.tsx                  # Dashboard home (stats)
│   ├── schemas/
│   │   ├── page.tsx              # Schema list
│   │   ├── [id]/
│   │   │   └── page.tsx          # Schema details/edit
│   │   └── new/
│   │       └── page.tsx          # Create schema
│   ├── jobs/
│   │   ├── page.tsx              # Job list
│   │   ├── [id]/
│   │   │   └── page.tsx          # Job details
│   │   └── new/
│   │       └── page.tsx          # Create job
│   ├── quick-generate/
│   │   └── page.tsx              # Quick generation wizard
│   └── exports/
│       └── page.tsx              # Export management
├── api/
│   ├── auth/                     # Authentication endpoints
│   ├── schemas/                  # Schema management
│   ├── jobs/                     # Job management
│   ├── exports/                  # Export generation
│   ├── images/                   # Image generation
│   ├── pdf/                      # PDF generation
│   └── dashboard/                # Dashboard stats
├── layout.tsx                    # Root layout
└── page.tsx                      # Landing page
```

### Component Architecture

#### Reusable Components

```
components/
├── ui/                           # shadcn/ui components (50+)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── form.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   └── ...
├── dashboard-shell.tsx           # Dashboard layout wrapper
├── schema-builder.tsx            # Schema creation form
├── schema-editor.tsx             # Schema editing interface
├── example-file-upload.tsx       # Example file uploader
├── example-files-manager.tsx     # Manage uploaded examples
├── image-gallery.tsx             # Display generated images
├── tenant-switcher.tsx           # Switch between tenants
├── page-breadcrumb.tsx           # Navigation breadcrumbs
├── confirm-dialog.tsx            # Confirmation dialogs
└── theme-provider.tsx            # Dark/light theme
```

### State Management

#### Server Components (Default)

```typescript
// app/dashboard/schemas/page.tsx
export default async function SchemasPage() {
  // Fetch data on server
  const schemas = await fetch('/api/schemas').then(r => r.json());
  
  return (
    <div>
      {schemas.map(schema => (
        <SchemaCard key={schema.id} schema={schema} />
      ))}
    </div>
  );
}
```

#### Client Components (Interactive)

```typescript
// components/schema-builder.tsx
'use client'

export function SchemaBuilder() {
  const [fields, setFields] = useState<Field[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (data: SchemaData) => {
    setIsSubmitting(true);
    try {
      await fetch('/api/schemas/create', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      router.push('/dashboard/schemas');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Form Handling

#### React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schemaFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  fields: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['name', 'email', 'company', ...]),
    description: z.string().optional(),
    required: z.boolean()
  })).min(1, 'At least one field required')
});

type SchemaFormData = z.infer<typeof schemaFormSchema>;

export function SchemaForm() {
  const form = useForm<SchemaFormData>({
    resolver: zodResolver(schemaFormSchema),
    defaultValues: {
      name: '',
      description: '',
      fields: []
    }
  });
  
  const onSubmit = async (data: SchemaFormData) => {
    // Handle submission
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Form fields */}
      </form>
    </Form>
  );
}
```

### Styling System

#### Tailwind CSS Configuration

```typescript
// tailwind.config.ts
export default {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        // ... more colors
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
```

#### CSS Variables

```css
/* app/globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    /* ... more variables */
  }
  
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    /* ... more variables */
  }
}
```

---

## Deployment & Infrastructure

### Vercel Deployment

#### Configuration

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "DATABASE_URL": "@database_url",
    "JWT_SECRET": "@jwt_secret",
    "OPENROUTER_API_KEY": "@openrouter_key",
    "AWS_ACCESS_KEY_ID": "@aws_access_key",
    "AWS_SECRET_ACCESS_KEY": "@aws_secret_key",
    "AWS_S3_BUCKET": "@aws_bucket",
    "AWS_REGION": "@aws_region"
  }
}
```

#### Build Process

```bash
# 1. Install dependencies
npm install

# 2. Build Next.js application
npm run build

# 3. Deploy to Vercel
vercel deploy --prod
```

### Environment Variables

#### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Authentication
JWT_SECRET=your-super-secure-secret-key-min-32-chars

# AI Services
OPENROUTER_API_KEY=sk-or-v1-...

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=synthetic-client-assets-1761171658
AWS_REGION=us-east-1

# Application
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Database Hosting

#### PostgreSQL Options

1. **Vercel Postgres** (Recommended)
   - Serverless PostgreSQL
   - Automatic scaling
   - Built-in connection pooling
   - Easy Vercel integration

2. **Supabase**
   - Managed PostgreSQL
   - Built-in RLS support
   - Real-time capabilities
   - Free tier available

3. **AWS RDS**
   - Fully managed PostgreSQL
   - High availability
   - Automated backups
   - Enterprise-grade

4. **Self-Hosted Docker**
   - Full control
   - Cost-effective
   - Requires maintenance

### Docker Setup (Local Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: client_synth_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: client_synth_db
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts:/docker-entrypoint-initdb.d

volumes:
  postgres_data:
```

```bash
# Start PostgreSQL
docker-compose up -d

# Apply migrations
psql -h localhost -p 5433 -U postgres -d client_synth_db -f scripts/001_create_core_schema.sql
# ... apply all migration scripts in order
```

### Monitoring & Logging

#### Application Logging

```typescript
// Structured logging
console.log('[v0] Job processing started', {
  jobId: job.id,
  tenantId: job.tenant_id,
  totalRecords: job.total_records,
  timestamp: new Date().toISOString()
});
```

#### Error Tracking

```typescript
// Error logging with context
try {
  await processJob(jobId);
} catch (error) {
  console.error('[v0] Job processing failed', {
    jobId,
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Store error in database
  await query(`
    INSERT INTO job_logs (job_id, level, message, metadata)
    VALUES ($1, 'error', $2, $3)
  `, [jobId, error.message, { stack: error.stack }]);
}
```

---

## Development Setup

### Prerequisites

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **PostgreSQL**: 15.x or higher
- **Python**: 3.9+ (for PDF generation)
- **Docker**: Optional, for local PostgreSQL

### Installation Steps

#### 1. Clone Repository

```bash
git clone https://github.com/your-org/synthetic-client-generation.git
cd synthetic-client-generation
```

#### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies (for PDF generation)
pip install pypdf reportlab
```

#### 3. Setup Database

**Option A: Docker (Recommended)**

```bash
# Start PostgreSQL container
docker-compose up -d

# Wait for PostgreSQL to be ready
sleep 5

# Apply migrations
npm run db:migrate
```

**Option B: Local PostgreSQL**

```bash
# Create database
createdb client_synth_db

# Apply migrations
psql -d client_synth_db -f scripts/001_create_core_schema.sql
psql -d client_synth_db -f scripts/002_profile_trigger.sql
# ... apply all scripts in order
```

#### 4. Configure Environment

```bash
# Copy example environment file
cp env.example .env

# Edit .env with your credentials
nano .env
```

**Minimum .env Configuration:**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/client_synth_db
JWT_SECRET=your-super-secure-jwt-secret-key-change-this-in-production
OPENROUTER_API_KEY=your-openrouter-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-s3-bucket-name
AWS_REGION=us-east-1
NODE_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

#### 5. Run Development Server

```bash
npm run dev
```

Application will be available at `http://localhost:3000`

### Development Workflow

#### Running Tests

```bash
# Run all tests
npm run test:all

# Run Jest tests only
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Watch mode
npm run test:watch
```

#### Database Migrations

```bash
# Apply new migration
psql -d client_synth_db -f scripts/018_new_migration.sql

# Rollback (if migration has down script)
psql -d client_synth_db -f scripts/018_new_migration_down.sql
```

#### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

### Troubleshooting Common Issues

#### Issue: Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### Issue: OpenRouter API Errors

```bash
# Verify API key
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

# Check rate limits
# OpenRouter free tier: 10 requests/minute
```

#### Issue: S3 Upload Failures

```bash
# Test AWS credentials
aws s3 ls s3://$AWS_S3_BUCKET --region $AWS_REGION

# Check bucket permissions
aws s3api get-bucket-policy --bucket $AWS_S3_BUCKET

# Use local storage fallback for development
# Set AWS_ACCESS_KEY_ID="" to trigger fallback
```

---

## Testing Strategy

### Test Pyramid

```
        ┌─────────────┐
        │   E2E Tests │  ← Few, slow, high confidence
        │   (2 tests) │
        └─────────────┘
       ┌───────────────┐
       │ Integration   │  ← Some, medium speed
       │ Tests (5)     │
       └───────────────┘
      ┌─────────────────┐
      │  Unit Tests     │  ← Many, fast, focused
      │  (TBD)          │
      └─────────────────┘
```

### Integration Tests

#### Job Processor Test

```typescript
// __tests__/integration/job-processor.test.ts
describe('JobProcessor Integration', () => {
  it('should process complete job end-to-end', async () => {
    // 1. Create test schema
    const schema = await createTestSchema({
      fields: [
        { name: 'full_name', type: 'name' },
        { name: 'email', type: 'email' },
        { name: 'profile_image', type: 'image' }
      ]
    });
    
    // 2. Create job
    const job = await createTestJob({
      schema_id: schema.id,
      total_records: 5
    });
    
    // 3. Process job
    const processor = new JobProcessor();
    await processor.processJob(job.id);
    
    // 4. Verify results
    const generatedData = await fetchGeneratedData(job.id);
    expect(generatedData).toHaveLength(5);
    expect(generatedData[0]).toHaveProperty('full_name');
    expect(generatedData[0]).toHaveProperty('email');
    expect(generatedData[0].profile_image).toMatch(/^https:\/\//);
    
    // 5. Cleanup
    await cleanupTestData(job.id, schema.id);
  });
});
```

#### Image Generation Test

```typescript
// __tests__/integration/image-service.test.ts
describe('ImageGenerationService', () => {
  it('should generate and upload image', async () => {
    const service = new ImageGenerationService();
    
    const result = await service.generateAndUploadImage({
      tenantId: TEST_TENANT_ID,
      jobId: TEST_JOB_ID,
      recordId: TEST_RECORD_ID,
      fieldName: 'profile_photo',
      prompt: 'professional headshot',
      style: 'professional'
    });
    
    expect(result.url).toMatch(/^https:\/\//);
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.md5Hash).toHaveLength(32);
  });
});
```

### E2E Tests

#### Complete Job Workflow

```typescript
// __tests__/e2e/job-workflow.test.ts
describe('Complete Job Workflow', () => {
  it('should create schema, job, and generate data', async () => {
    // 1. Register user
    const user = await registerTestUser();
    
    // 2. Create schema
    const schema = await fetch('/api/schemas/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Schema',
        schema_definition: {
          fields: [
            { name: 'name', type: 'name' },
            { name: 'email', type: 'email' }
          ]
        }
      })
    }).then(r => r.json());
    
    // 3. Create job
    const job = await fetch('/api/jobs/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        schema_id: schema.schema.id,
        name: 'Test Job',
        total_records: 10
      })
    }).then(r => r.json());
    
    // 4. Process job
    await fetch('/api/jobs/process', {
      method: 'POST'
    });
    
    // 5. Wait for completion
    await waitForJobCompletion(job.job.id);
    
    // 6. Verify data
    const data = await fetchGeneratedData(job.job.id);
    expect(data).toHaveLength(10);
  });
});
```

### Test Data Management

```typescript
// __tests__/helpers/test-data.ts
export async function createTestTenant(): Promise<Tenant> {
  const result = await query(`
    INSERT INTO tenants (name, slug)
    VALUES ('Test Tenant', 'test-tenant-' || gen_random_uuid())
    RETURNING *
  `);
  return result.rows[0];
}

export async function createTestUser(tenantId: string): Promise<User> {
  const hashedPassword = await bcrypt.hash('testpass123', 10);
  const result = await query(`
    INSERT INTO auth.users (email, password_hash)
    VALUES ('test-' || gen_random_uuid() || '@example.com', $1)
    RETURNING *
  `, [hashedPassword]);
  
  const user = result.rows[0];
  
  // Create profile
  await query(`
    INSERT INTO profiles (id, email, full_name)
    VALUES ($1, $2, 'Test User')
  `, [user.id, user.email]);
  
  // Assign to tenant
  await query(`
    INSERT INTO user_tenant_roles (user_id, tenant_id, role)
    VALUES ($1, $2, 'owner')
  `, [user.id, tenantId]);
  
  return user;
}

export async function cleanupTestData(jobId: string, schemaId: string) {
  await query('DELETE FROM generated_data WHERE job_id = $1', [jobId]);
  await query('DELETE FROM jobs WHERE id = $1', [jobId]);
  await query('DELETE FROM schemas WHERE id = $1', [schemaId]);
}
```

---

## Security Considerations

### Authentication Security

#### Password Requirements
- Minimum 8 characters
- Hashed with bcrypt (10 salt rounds)
- Never stored in plain text
- Password reset via email (future feature)

#### JWT Security
- Signed with HS256 algorithm
- 7-day expiration
- Secret key minimum 32 characters
- Tokens stored in httpOnly cookies (future enhancement)

#### Session Management
- Stateless JWT authentication
- No server-side session storage
- Token refresh on expiration (future feature)

### Data Security

#### Row Level Security (RLS)
- All tenant-scoped tables protected
- User can only access their tenant's data
- Enforced at database level
- Prevents data leakage

#### SQL Injection Prevention
- Parameterized queries only
- No string concatenation for SQL
- Input validation with Zod schemas
- ORM-style query builders

```typescript
// ✅ SAFE: Parameterized query
await query('SELECT * FROM jobs WHERE id = $1', [jobId]);

// ❌ UNSAFE: String concatenation
await query(`SELECT * FROM jobs WHERE id = '${jobId}'`);
```

#### XSS Prevention
- React automatic escaping
- Content Security Policy headers
- Sanitize user input
- Validate all API inputs

### API Security

#### Rate Limiting
```typescript
// Future implementation
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', rateLimiter);
```

#### CORS Configuration
```typescript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_SITE_URL },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' }
        ]
      }
    ];
  }
};
```

### File Upload Security

#### File Validation
- File type whitelist (CSV, JSON, Excel only)
- Maximum file size: 10MB
- Virus scanning (future enhancement)
- Content-type verification

```typescript
const ALLOWED_TYPES = [
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function validateFile(file: File): boolean {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large');
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Invalid file type');
  }
  
  return true;
}
```

### S3 Security

#### Bucket Configuration
- Public read access for generated files
- No public write access
- CORS configured for specific origins
- Versioning enabled
- Encryption at rest (future enhancement)

#### Access Control
- IAM user with minimal permissions
- Bucket policy restricts actions
- Pre-signed URLs for temporary access (future)
- CloudFront for CDN (future enhancement)

### Environment Security

#### Secret Management
- Never commit secrets to Git
- Use environment variables
- Rotate secrets regularly
- Use secret management service (production)

```bash
# .gitignore
.env
.env.local
.env.production
*.pem
*.key
```

---

## Performance Optimization

### Database Optimization

#### Indexing Strategy
```sql
-- Job queries
CREATE INDEX idx_jobs_tenant_status ON jobs(tenant_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- Generated data queries
CREATE INDEX idx_generated_data_job ON generated_data(job_id);
CREATE INDEX idx_generated_data_tenant ON generated_data(tenant_id);

-- Example data queries
CREATE INDEX idx_example_data_file_field ON example_data(example_file_id, field_name);
```

#### Query Optimization
```typescript
// ✅ GOOD: Fetch only needed columns
await query(`
  SELECT id, name, status, progress
  FROM jobs
  WHERE tenant_id = $1
  ORDER BY created_at DESC
  LIMIT 20
`, [tenantId]);

// ❌ BAD: Fetch all columns
await query(`
  SELECT *
  FROM jobs
  WHERE tenant_id = $1
`, [tenantId]);
```

#### Connection Pooling
```typescript
// lib/postgres/client.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000 // Connection timeout
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  console.log('[DB Query]', { text, duration, rows: res.rowCount });
  return res;
}
```

### API Optimization

#### Response Caching
```typescript
// Cache schema list for 5 minutes
export async function GET(request: NextRequest) {
  const response = await fetch('/api/schemas');
  
  return new Response(response.body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  });
}
```

#### Pagination
```typescript
// Paginate large result sets
interface PaginationParams {
  page: number;
  limit: number;
}

async function fetchJobs(tenantId: string, pagination: PaginationParams) {
  const offset = (pagination.page - 1) * pagination.limit;
  
  const result = await query(`
    SELECT * FROM jobs
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [tenantId, pagination.limit, offset]);
  
  const countResult = await query(`
    SELECT COUNT(*) FROM jobs WHERE tenant_id = $1
  `, [tenantId]);
  
  return {
    jobs: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: pagination.page,
    pages: Math.ceil(parseInt(countResult.rows[0].count) / pagination.limit)
  };
}
```

### Frontend Optimization

#### Code Splitting
```typescript
// Dynamic imports for heavy components
import dynamic from 'next/dynamic';

const SchemaBuilder = dynamic(() => import('@/components/schema-builder'), {
  loading: () => <Spinner />,
  ssr: false
});
```

#### Image Optimization
```typescript
import Image from 'next/image';

<Image
  src={profileImage}
  alt="Profile"
  width={200}
  height={200}
  loading="lazy"
  placeholder="blur"
/>
```

#### Server Components
```typescript
// Use Server Components for data fetching
export default async function JobsPage() {
  const jobs = await fetchJobs(); // Runs on server
  
  return (
    <div>
      {jobs.map(job => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
```

### Job Processing Optimization

#### Batch Processing
```typescript
// Process records in batches
const BATCH_SIZE = 10;

for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
  const batch = Array.from(
    { length: Math.min(BATCH_SIZE, totalRecords - i) },
    (_, index) => i + index
  );
  
  await Promise.all(
    batch.map(index => generateRecord(index))
  );
  
  await updateJobProgress(jobId, i + batch.length);
}
```

#### Parallel Processing
```typescript
// Generate text and images in parallel
const [textFields, imageFields] = await Promise.all([
  generateTextFields(record),
  generateImageFields(record)
]);

Object.assign(record, textFields, imageFields);
```

---

## Troubleshooting Guide

### Common Issues

#### 1. Database Connection Errors

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
```bash
# Check PostgreSQL is running
docker ps
# or
pg_isready

# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Restart PostgreSQL
docker-compose restart postgres
```

#### 2. Authentication Failures

**Symptom:**
```
Error: Unauthorized - Invalid token
```

**Solutions:**
```bash
# Check JWT_SECRET is set
echo $JWT_SECRET

# Verify token format
# Token should be: Bearer eyJhbGciOiJIUzI1NiIs...

# Re-login to get fresh token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

#### 3. OpenRouter API Errors

**Symptom:**
```
Error: OpenRouter API request failed: 429 Too Many Requests
```

**Solutions:**
```bash
# Check API key
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

# Check rate limits
# Free tier: 10 requests/minute
# Wait 60 seconds between batches

# Upgrade to paid tier for higher limits
```

#### 4. S3 Upload Failures

**Symptom:**
```
Error: AccessDenied: Access Denied
```

**Solutions:**
```bash
# Verify AWS credentials
aws configure list

# Test S3 access
aws s3 ls s3://$AWS_S3_BUCKET

# Check bucket permissions
aws s3api get-bucket-policy --bucket $AWS_S3_BUCKET

# Verify bucket exists
aws s3api head-bucket --bucket $AWS_S3_BUCKET

# Use local storage fallback for development
# Set AWS_ACCESS_KEY_ID="" in .env
```

#### 5. PDF Generation Errors

**Symptom:**
```
Error: Python script failed: ModuleNotFoundError: No module named 'pypdf'
```

**Solutions:**
```bash
# Install Python dependencies
pip install pypdf reportlab

# Verify Python version
python --version  # Should be 3.9+

# Test PDF service
python lib/pdf_service.py content \
  --title "Test" \
  --content "Hello World" \
  --page-size A4 \
  --margin-mm 20
```

#### 6. Job Processing Stuck

**Symptom:**
Job status remains "processing" indefinitely

**Solutions:**
```sql
-- Check job status
SELECT id, name, status, progress, error_message
FROM jobs
WHERE status = 'processing'
ORDER BY updated_at DESC;

-- Check job logs
SELECT * FROM job_logs
WHERE job_id = 'your-job-id'
ORDER BY created_at DESC
LIMIT 20;

-- Manually reset job
UPDATE jobs
SET status = 'failed',
    error_message = 'Manually reset - investigate logs'
WHERE id = 'your-job-id';

-- Retry job
POST /api/jobs/control
{
  "jobId": "your-job-id",
  "action": "retry"
}
```

#### 7. Dashboard Shows Zeros

**Symptom:**
Dashboard analytics display all zeros

**Solutions:**
```bash
# Check API endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/dashboard/stats

# Check database data
psql $DATABASE_URL -c "
  SELECT 
    (SELECT COUNT(*) FROM schemas) as schemas,
    (SELECT COUNT(*) FROM jobs) as jobs,
    (SELECT COUNT(*) FROM exports) as exports;
"

# Check tenant association
psql $DATABASE_URL -c "
  SELECT * FROM user_tenant_roles
  WHERE user_id = 'your-user-id';
"

# Clear browser cache
# Open DevTools > Application > Clear site data
```

### Debugging Tools

#### Database Queries

```sql
-- Active connections
SELECT * FROM pg_stat_activity;

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Recent queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

#### API Debugging

```bash
# Enable verbose logging
export DEBUG=*

# Test API endpoints
curl -v -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/jobs

# Check API response time
time curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/schemas
```

#### Frontend Debugging

```typescript
// Enable React DevTools
// Install: https://react.dev/learn/react-developer-tools

// Add debug logging
console.log('[DEBUG]', { state, props, data });

// Network tab in DevTools
// Filter by "Fetch/XHR" to see API calls
```

---

## API Changelog

### Version 1.0.0 (Current)

#### Added
- JWT-based authentication system
- Schema management endpoints
- Job creation and processing
- Example file upload system
- Multi-format export (CSV, JSON, Excel, SQL, XML, Parquet)
- AI text generation via OpenRouter
- AI image generation via OpenRouter
- PDF document generation
- Dashboard statistics API
- Job control signals (pause/resume/cancel/retry)
- Row Level Security for multi-tenancy

#### Changed
- Migrated from Supabase to standalone PostgreSQL
- Updated authentication from Supabase Auth to custom JWT
- Enhanced job processor with retry logic
- Improved error handling and logging

#### Security
- Implemented bcrypt password hashing
- Added JWT token expiration (7 days)
- Enforced RLS policies on all tenant-scoped tables
- Parameterized all SQL queries

---

## Appendix

### Glossary

- **Schema**: Data structure definition with field types
- **Job**: Data generation task based on a schema
- **Record**: Single generated data entry
- **Tenant**: Organization/workspace with isolated data
- **RLS**: Row Level Security - database-level access control
- **JWT**: JSON Web Token - authentication token format
- **OpenRouter**: AI API aggregator for multiple models
- **S3**: Amazon Simple Storage Service - file storage

### Useful Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run start                  # Start production server

# Testing
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:integration       # Integration tests only
npm run test:e2e               # E2E tests only

# Database
docker-compose up -d           # Start PostgreSQL
docker-compose down            # Stop PostgreSQL
psql $DATABASE_URL             # Connect to database

# Code Quality
npm run lint                   # Lint code
npm run type-check             # TypeScript check
```

### External Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **OpenRouter API**: https://openrouter.ai/docs
- **AWS S3 Documentation**: https://docs.aws.amazon.com/s3/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **shadcn/ui**: https://ui.shadcn.com/

---

**Document Version:** 1.0.0  
**Last Updated:** October 26, 2025  
**Maintained By:** Development Team

For questions or issues, please contact the development team or open an issue on GitHub.

