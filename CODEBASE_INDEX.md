# Client Synth - Codebase Index & Architecture Guide

## 🏗️ Project Overview

**Client Synth** is a comprehensive, multi-tenant SaaS platform for generating realistic synthetic client profiles using AI-powered text and image generation. The platform enables developers, QA teams, and businesses to create high-quality test data that goes beyond Lorem Ipsum.

### Key Technologies
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS v4, Radix UI
- **Backend**: Next.js API Routes, Supabase (PostgreSQL + Auth)
- **AI Services**: OpenRouter (text), Fal (images)
- **Storage**: AWS S3, Supabase Storage
- **Deployment**: Vercel

---

## 📁 Directory Structure & Key Files

### Core Application (`/app`)
```
app/
├── auth/                          # Authentication pages
│   ├── login/page.tsx            # Login form with Supabase Auth
│   ├── sign-up/page.tsx          # Registration with email confirmation
│   └── sign-up-success/page.tsx  # Email confirmation landing
├── dashboard/                     # Protected dashboard area
│   ├── layout.tsx                # Auth-protected layout wrapper
│   ├── page.tsx                  # Main dashboard with stats
│   ├── schemas/                  # Schema management
│   │   ├── page.tsx              # Schema listing with grid view
│   │   ├── [id]/page.tsx         # Schema editor
│   │   └── new/page.tsx          # Schema builder
│   ├── jobs/                     # Job management
│   │   ├── page.tsx              # Job console with real-time updates
│   │   └── [id]/                 # Individual job details
│   └── exports/                  # Export management
└── api/                          # API routes
    ├── jobs/                     # Job management endpoints
    ├── images/                   # Image generation endpoints
    ├── exports/                  # Export endpoints
    └── models/                   # AI model management
```

### Components (`/components`)
```
components/
├── ui/                           # shadcn/ui component library (50+ components)
├── dashboard-shell.tsx           # Main dashboard layout with navigation
├── tenant-switcher.tsx           # Organization selection dropdown
├── schema-builder.tsx            # Visual schema designer (17+ field types)
├── schema-editor.tsx             # Schema editing interface
└── image-gallery.tsx             # AI-generated image management
```

### Core Libraries (`/lib`)
```
lib/
├── supabase/                     # Supabase client configuration
│   ├── client.ts                 # Browser client
│   ├── server.ts                 # Server client
│   └── middleware.ts             # Session management middleware
├── job-processor.ts              # Core job processing engine
├── ai-generator.ts               # OpenRouter text generation
├── image-generation/             # Image generation services
│   ├── image-service.ts          # Main image service
│   ├── prompt-enhancer.ts        # AI-powered prompt enhancement
│   └── providers/                # Provider implementations
│       ├── base-provider.ts      # Abstract base class
│       ├── fal-provider.ts       # Fal AI integration
│       └── placeholder-provider.ts # Fallback provider
├── intelligence/                 # ML and analytics
│   ├── optimization-engine.ts    # Performance optimization
│   ├── predictive-analytics.ts   # Trend analysis and predictions
│   └── seed-quality-predictor.ts # Quality scoring system
├── export-utils.tsx              # Multi-format export generator
├── s3-uploader.ts                # AWS S3 file upload utility
└── tenant-utils.ts               # Multi-tenant utilities
```

---

## 🔐 Authentication & Security

### Supabase Authentication Flow
- **Client**: `lib/supabase/client.ts` - Browser client for auth operations
- **Server**: `lib/supabase/server.ts` - Server-side client with cookies
- **Middleware**: `lib/supabase/middleware.ts` - Session management and route protection
- **Pages**: `app/auth/` - Login, signup, and email confirmation

### Multi-Tenant Security
- **Row Level Security (RLS)**: All tables implement tenant-scoped policies
- **Role-Based Access**: Owner/Admin/Member permissions via `user_tenant_roles`
- **Data Isolation**: Complete separation between tenant data
- **API Protection**: All API routes verify user and tenant access

---

## 🗄️ Database Schema

### Core Tables
```sql
-- Multi-tenant foundation
tenants                    # Organizations/companies
profiles                   # User profiles (linked to auth.users)
user_tenant_roles          # Role-based access control

-- Data generation
schemas                    # Data structure definitions (JSONB)
jobs                       # Generation job tracking
generated_data             # Actual generated records
job_logs                   # Comprehensive execution logging
job_controls               # Real-time control signals

-- Media & exports
media                      # Image metadata with S3 integration
exports                    # Export job tracking

-- Intelligence layer
seed_quality_feedback      # Quality scoring and feedback
generation_metrics         # Performance analytics
generation_recommendations # AI-powered suggestions
ml_model_states           # ML model parameters
optimization_suggestions   # Performance improvements
```

### Key Features
- **UUID Primary Keys**: All tables use UUID for better distribution
- **JSONB Fields**: Flexible schema definitions and configurations
- **Audit Trails**: Created/updated timestamps on all tables
- **Cascading Deletes**: Proper referential integrity
- **Performance Indexes**: Optimized for multi-tenant queries

---

## 🤖 AI & Generation System

### Text Generation (`lib/ai-generator.ts`)
- **Provider**: OpenRouter with multiple model support
- **Models**: Gemini 2.5 Flash (default), GPT, Claude, etc.
- **Context Awareness**: Uses existing record data for coherent generation
- **Fallback System**: Deterministic fallbacks when AI fails
- **Field Types**: 17+ supported field types with AI capabilities

### Image Generation (`lib/image-generation/`)
- **Multi-Provider**: Fal AI (primary), Placeholder (fallback)
- **Prompt Enhancement**: AI-powered prompt building from record data
- **S3 Integration**: Automatic upload and URL generation
- **Metadata Tracking**: Complete generation history and parameters

### Job Processing (`lib/job-processor.ts`)
- **Batch Processing**: Configurable batch sizes with progress tracking
- **Retry Logic**: Exponential backoff with configurable attempts
- **Recovery States**: Resume from failure points with state persistence
- **Real-time Control**: WebSocket-based pause/resume/cancel
- **Error Handling**: Comprehensive logging and recovery mechanisms

---

## 🎨 Frontend Architecture

### Schema Builder (`components/schema-builder.tsx`)
- **17+ Field Types**: Text, email, names, companies, images, etc.
- **AI-Powered Fields**: Intelligent generation for contextual data
- **Drag-and-Drop**: Intuitive field reordering and management
- **Real-time Validation**: Immediate feedback on schema structure
- **Export Preview**: Live preview of generated data structure

### Dashboard Shell (`components/dashboard-shell.tsx`)
- **Navigation**: Sidebar with active state tracking
- **Tenant Switching**: Organization selection with role display
- **User Management**: Profile dropdown with logout functionality
- **Responsive Design**: Mobile-friendly layout adaptation

### Job Console (`app/dashboard/jobs/page.tsx`)
- **Live Updates**: WebSocket-based status updates
- **Bulk Operations**: Multi-select for batch operations
- **Advanced Filtering**: Status, date, and search filtering
- **Progress Tracking**: Visual progress bars and detailed statistics
- **Control Interface**: Pause/resume/cancel job controls

---

## 📊 Intelligence Layer

### Seed Quality Predictor (`lib/intelligence/seed-quality-predictor.ts`)
- **Quality Scoring**: ML-based quality assessment
- **Historical Analysis**: Performance tracking over time
- **Context Relevance**: Matching seeds to generation context
- **Recommendations**: AI-powered improvement suggestions

### Predictive Analytics (`lib/intelligence/predictive-analytics.ts`)
- **Outcome Prediction**: Success probability and duration estimates
- **Trend Analysis**: Usage patterns and efficiency metrics
- **Resource Estimation**: Memory and processing requirements
- **Quality Forecasting**: Expected output quality scores

### Optimization Engine (`lib/intelligence/optimization-engine.ts`)
- **Performance Analysis**: Generation time and success rate metrics
- **Diversity Index**: Content variety and uniqueness scoring
- **Resource Utilization**: System efficiency monitoring
- **Automated Suggestions**: Performance improvement recommendations

---

## 📤 Export System

### Multi-Format Support (`lib/export-utils.tsx`)
- **CSV**: Universal format for spreadsheet applications
- **JSON**: Web-friendly structured data
- **XLSX**: Microsoft Excel format with formatting
- **SQL**: Database-ready INSERT statements
- **XML**: Structured markup for enterprise systems
- **Parquet**: Columnar storage for analytics

### Features
- **Field Filtering**: Export specific fields only
- **Pagination**: Handle large datasets efficiently
- **Format Validation**: Ensure data integrity
- **S3 Integration**: Direct upload to cloud storage

---

## 🔌 API Architecture

### Job Management
- **POST /api/jobs/create**: Creates new data generation jobs
- **POST /api/jobs/control**: Real-time job control (pause/resume/cancel)
- **POST /api/jobs/process**: Basic job processing endpoint
- **POST /api/jobs/process-ai**: AI-powered job processing

### Image Generation
- **POST /api/images/generate**: Generates AI images using multiple providers
- **POST /api/images/regenerate**: Regenerates images with new prompts
- **GET /api/images/models**: Returns available image generation models

### Export System
- **POST /api/exports/create**: Creates data exports in multiple formats

### Model Management
- **GET /api/models/available**: Fetches available AI models from OpenRouter

---

## 🚀 Key Features Deep Dive

### Real-time Job Processing
- **WebSocket Integration**: Live job status updates without polling
- **Recovery System**: Jobs can resume from failure points
- **Control Signals**: Real-time pause/resume/cancel functionality
- **Progress Tracking**: Granular progress reporting with batch processing

### AI-Powered Generation
- **Context Awareness**: Generated data maintains logical relationships
- **Multi-Provider Support**: Fallback systems for reliability
- **Quality Control**: ML-based quality scoring and feedback loops
- **Optimization**: Performance recommendations based on usage patterns

### Multi-Tenant Architecture
- **Complete Isolation**: Tenant data never crosses boundaries
- **Role-Based Access**: Granular permissions within organizations
- **Scalable Design**: Efficient queries with proper indexing
- **Audit Trail**: Comprehensive logging for compliance

---

## 🛠️ Development Setup

### Environment Variables
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Services
OPENROUTER_API_KEY=your_openrouter_api_key
FAL_KEY=your_fal_api_key

# AWS S3 Storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_s3_bucket_name
AWS_REGION=your_aws_region

# Application
NEXT_PUBLIC_SITE_URL=your_site_url
```

### Database Migrations
Execute SQL scripts in numerical order from `scripts/` directory:
1. `001_create_core_schema.sql` - Core multi-tenant tables
2. `015_intelligence_layer.sql` - ML and analytics features
3. Additional feature-specific migrations as needed

---

## 📈 Performance Considerations

### Database Optimization
- **Proper Indexing**: Optimized queries for multi-tenant access patterns
- **Connection Pooling**: Efficient database connection management
- **RLS Optimization**: Efficient row-level security implementations

### Job Processing
- **Batch Processing**: Configurable batch sizes for optimal performance
- **Rate Limiting**: AI API rate limiting and cooldown periods
- **Memory Management**: Efficient handling of large datasets
- **Error Recovery**: Robust error handling with retry mechanisms

### Frontend Performance
- **Server-Side Rendering**: Optimized initial page loads
- **Real-time Updates**: Efficient WebSocket usage
- **Code Splitting**: Optimized bundle sizes with Next.js
- **Image Optimization**: Proper image loading and caching

---

## 🔄 Data Flow

### Schema Creation → Job Generation → Export
1. **Schema Builder**: User creates data structure with 17+ field types
2. **Job Creation**: API creates job with schema and configuration
3. **Job Processing**: Background processor generates data using AI
4. **Real-time Updates**: WebSocket provides live progress updates
5. **Data Storage**: Generated records stored in `generated_data` table
6. **Export Generation**: Multi-format exports created on demand

### AI Generation Pipeline
1. **Field Analysis**: Determine if field requires AI generation
2. **Context Building**: Gather existing record data for context
3. **Prompt Construction**: Build AI prompts with field descriptions
4. **AI Generation**: Call OpenRouter/Fal APIs for content
5. **Fallback Handling**: Use deterministic generation if AI fails
6. **Quality Scoring**: ML-based quality assessment
7. **Storage**: Save generated content with metadata

---

## 🎯 Future Roadmap

### Planned Features
- **Advanced Analytics**: Enhanced usage analytics and insights
- **API Access**: Public API for programmatic access
- **Webhook Integration**: Real-time notifications for job completion
- **Advanced AI Models**: Integration with additional AI providers
- **Collaboration Features**: Team-based schema sharing

### Scalability Improvements
- **Microservices**: Breaking down monolithic job processing
- **Queue System**: Advanced job queue management
- **Caching Layer**: Redis integration for improved performance
- **Global CDN**: Worldwide content delivery optimization

---

This codebase index provides a comprehensive overview of the Client Synth platform architecture, key components, and implementation details. For specific implementation details, refer to the individual files and their inline documentation.
