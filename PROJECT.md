# Client Synth - AI-Powered Synthetic Data Generation Platform

## Project Overview

Client Synth is a comprehensive, multi-tenant SaaS platform for generating realistic synthetic client profiles using AI-powered text and image generation. The platform enables developers, QA teams, and businesses to create high-quality test data that goes beyond Lorem Ipsum, providing contextually aware, realistic data for applications, demos, and testing environments.

## Core Features

- **Visual Schema Designer**: Drag-and-drop interface for creating data structures with 17+ field types
- **AI-Powered Generation**: OpenRouter integration for intelligent text generation and contextual data
- **Image Generation**: Multi-provider AI image generation (Fal, placeholder fallbacks)
- **Real-time Job Processing**: WebSocket-based job monitoring with pause/resume/cancel controls
- **Multi-format Export**: CSV, JSON, XLSX, SQL export capabilities
- **Multi-tenant Architecture**: Organization-based data isolation with role-based access control
- **Intelligence Layer**: ML-based quality scoring and optimization recommendations

## Technology Stack

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **Authentication**: Supabase Auth with server/client components
- **State Management**: React hooks with Supabase real-time subscriptions

### Backend
- **Runtime**: Next.js API Routes (server-side)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with middleware session management
- **AI Services**: OpenRouter for text generation, Fal for image generation
- **File Storage**: AWS S3 integration for media files
- **Job Processing**: Custom job processor with retry logic and recovery states

### Infrastructure
- **Deployment**: Vercel (Next.js optimized)
- **Database**: Supabase (PostgreSQL with real-time capabilities)
- **Storage**: AWS S3 for generated images and exports
- **AI Providers**: OpenRouter (text), Fal (images)
- **Environment**: Environment variables managed through Vercel

## Project Structure

\`\`\`
├── app/                          # Next.js App Router
│   ├── auth/                     # Authentication pages
│   │   ├── login/page.tsx        # Login form with Supabase Auth
│   │   ├── sign-up/page.tsx      # Registration with email confirmation
│   │   └── sign-up-success/page.tsx # Email confirmation landing
│   ├── dashboard/                # Protected dashboard area
│   │   ├── layout.tsx            # Auth-protected layout wrapper
│   │   ├── page.tsx              # Main dashboard with stats and activity
│   │   ├── schemas/              # Schema management
│   │   │   ├── page.tsx          # Schema listing with grid view
│   │   │   ├── [id]/page.tsx     # Schema editor
│   │   │   └── new/page.tsx      # Schema builder
│   │   ├── jobs/                 # Job management
│   │   │   └── page.tsx          # Job console with real-time updates
│   │   └── exports/              # Export management
│   ├── api/                      # API routes
│   │   ├── jobs/                 # Job management endpoints
│   │   │   ├── create/route.ts   # Create new generation jobs
│   │   │   ├── control/route.ts  # Job control (pause/resume/cancel)
│   │   │   ├── process/route.ts  # Job processing endpoint
│   │   │   └── process-ai/route.ts # AI-powered processing
│   │   ├── images/               # Image generation endpoints
│   │   │   ├── generate/route.ts # Generate AI images
│   │   │   ├── regenerate/route.ts # Regenerate existing images
│   │   │   └── models/route.ts   # Available image models
│   │   ├── exports/              # Export endpoints
│   │   │   └── create/route.ts   # Create data exports
│   │   └── models/               # AI model management
│   │       └── available/route.ts # Available text models
│   ├── globals.css               # Tailwind CSS v4 configuration
│   ├── layout.tsx                # Root layout with fonts and analytics
│   └── page.tsx                  # Landing page with feature showcase
├── components/                   # React components
│   ├── ui/                       # shadcn/ui component library (50+ components)
│   ├── dashboard-shell.tsx       # Main dashboard layout with navigation
│   ├── tenant-switcher.tsx       # Organization selection dropdown
│   ├── schema-builder.tsx        # Visual schema designer
│   ├── schema-editor.tsx         # Schema editing interface
│   └── image-gallery.tsx         # AI-generated image management
├── lib/                          # Utility libraries
│   ├── supabase/                 # Supabase client configuration
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── middleware.ts         # Session management middleware
│   ├── job-processor.ts          # Core job processing engine
│   ├── ai-generator.ts           # OpenRouter text generation
│   ├── image-generation/         # Image generation services
│   │   ├── image-service.ts      # Main image service
│   │   └── providers/            # Provider implementations
│   ├── s3-uploader.ts            # AWS S3 file upload utility
│   ├── export-utils.ts           # Multi-format export generator
│   └── utils.ts                  # General utilities (cn function, etc.)
├── scripts/                      # Database migration scripts
│   ├── 001_create_core_schema.sql # Core multi-tenant tables
│   ├── 015_intelligence_layer.sql # ML and analytics tables
│   └── [additional migrations]   # Feature-specific migrations
├── middleware.ts                 # Next.js middleware for auth
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
\`\`\`

## Database Schema

### Core Multi-Tenant Architecture

#### Tenants & Users
- **tenants**: Organizations/companies with name and slug
- **profiles**: User profiles linked to auth.users with metadata
- **user_tenant_roles**: Role-based access control (owner/admin/member)

#### Data Generation
- **schemas**: Data structure definitions with JSON schema
- **jobs**: Generation job tracking with status, progress, and recovery states
- **generated_data**: Actual generated records with tenant isolation
- **job_logs**: Comprehensive job execution logging
- **job_controls**: Real-time job control signals (pause/resume/cancel)

#### Media & Exports
- **media**: Image metadata with S3 integration and generation details
- **exports**: Export job tracking with format and file management

#### Intelligence Layer (Advanced Features)
- **seed_quality_feedback**: Quality scoring and user feedback
- **generation_metrics**: Performance analytics and optimization data
- **generation_recommendations**: AI-powered improvement suggestions
- **ml_model_states**: Machine learning model parameters and states
- **optimization_suggestions**: Performance improvement recommendations

### Row Level Security (RLS)
All tables implement tenant-scoped RLS policies ensuring complete data isolation between organizations. Users can only access data from tenants they belong to, with role-based permissions for administrative functions.

## API Architecture

### Job Management
- **POST /api/jobs/create**: Creates new data generation jobs with schema validation
- **POST /api/jobs/control**: Real-time job control (pause/resume/cancel/retry)
- **POST /api/jobs/process**: Basic job processing endpoint
- **POST /api/jobs/process-ai**: AI-powered job processing with authentication

### Image Generation
- **POST /api/images/generate**: Generates AI images using multiple providers
- **POST /api/images/regenerate**: Regenerates images with new prompts
- **GET /api/images/models**: Returns available image generation models

### Export System
- **POST /api/exports/create**: Creates data exports in multiple formats (CSV, JSON, XLSX, SQL)

### Model Management
- **GET /api/models/available**: Fetches available AI models from OpenRouter

## Core Services

### JobProcessor (`lib/job-processor.ts`)
The heart of the data generation system, featuring:
- **Batch Processing**: Configurable batch sizes with progress tracking
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Recovery States**: Resume from failure points with state persistence
- **Real-time Control**: WebSocket-based pause/resume/cancel functionality
- **Error Handling**: Comprehensive error logging and recovery mechanisms

### AIGenerator (`lib/ai-generator.ts`)
OpenRouter integration for intelligent text generation:
- **Model Flexibility**: Support for multiple AI models (Gemini, GPT, Claude, etc.)
- **Context Awareness**: Uses existing record data for coherent generation
- **Fallback System**: Deterministic fallbacks when AI generation fails
- **Batch Processing**: Parallel generation for improved performance

### ImageGenerationService (`lib/image-generation/image-service.ts`)
Multi-provider image generation system:
- **Provider Abstraction**: Pluggable provider architecture (Fal, placeholder)
- **Prompt Enhancement**: Context-aware prompt building from record data
- **S3 Integration**: Automatic upload and URL generation
- **Metadata Tracking**: Complete generation history and parameters

## Authentication & Security

### Supabase Authentication
- **Email/Password**: Standard authentication with email confirmation
- **Session Management**: Server-side session handling with middleware
- **Protected Routes**: Automatic redirect for unauthenticated users
- **Profile Management**: User profile creation and management

### Multi-Tenant Security
- **Row Level Security**: Database-level tenant isolation
- **Role-Based Access**: Owner/admin/member permissions
- **API Authentication**: All API routes verify user and tenant access
- **Data Isolation**: Complete separation of tenant data

## Frontend Architecture

### Dashboard Shell (`components/dashboard-shell.tsx`)
Main application wrapper providing:
- **Navigation**: Sidebar with active state tracking
- **Tenant Switching**: Organization selection with role display
- **User Management**: Profile dropdown with logout functionality
- **Responsive Design**: Mobile-friendly layout adaptation

### Schema Builder (`components/schema-builder.tsx`)
Visual schema designer featuring:
- **17+ Field Types**: Text, email, names, companies, images, etc.
- **AI-Powered Fields**: Intelligent generation for contextual data
- **Drag-and-Drop**: Intuitive field reordering and management
- **Real-time Validation**: Immediate feedback on schema structure
- **Export Preview**: Live preview of generated data structure

### Job Console (`app/dashboard/jobs/page.tsx`)
Real-time job management interface:
- **Live Updates**: WebSocket-based status updates
- **Bulk Operations**: Multi-select for batch operations
- **Advanced Filtering**: Status, date, and search filtering
- **Progress Tracking**: Visual progress bars and detailed statistics
- **Control Interface**: Pause/resume/cancel job controls

## Environment Variables

### Required Environment Variables
\`\`\`bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (Auto-configured by Supabase)
POSTGRES_URL=your_postgres_url
POSTGRES_PRISMA_URL=your_postgres_prisma_url
POSTGRES_URL_NON_POOLING=your_postgres_non_pooling_url

# AI Services
OPENROUTER_API_KEY=your_openrouter_api_key
FAL_KEY=your_fal_api_key

# AWS S3 Storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_s3_bucket_name
AWS_REGION=your_aws_region
NEXT_PUBLIC_AWS_REGION=your_aws_region

# Application
NEXT_PUBLIC_SITE_URL=your_site_url
\`\`\`

## Development Setup

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account and project
- OpenRouter API key
- AWS S3 bucket (for image storage)
- Fal API key (optional, for AI images)

### Installation Steps
1. **Clone and Install**:
   \`\`\`bash
   git clone <repository>
   cd client-synth
   npm install
   \`\`\`

2. **Environment Setup**:
   - Copy `.env.example` to `.env.local`
   - Configure all required environment variables

3. **Database Setup**:
   - Run migration scripts in order from `scripts/` directory
   - Ensure RLS policies are properly configured

4. **Development Server**:
   \`\`\`bash
   npm run dev
   \`\`\`

### Database Migrations
Execute SQL scripts in numerical order:
1. `001_create_core_schema.sql` - Core multi-tenant tables
2. `015_intelligence_layer.sql` - ML and analytics features
3. Additional feature-specific migrations as needed

## Key Features Deep Dive

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

## Performance Considerations

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

## Deployment

### Vercel Deployment
The application is optimized for Vercel deployment with:
- **Automatic Deployments**: Git-based deployment pipeline
- **Environment Variables**: Secure environment variable management
- **Edge Functions**: Optimized API route performance
- **Analytics**: Built-in performance monitoring

### Production Considerations
- **Database Scaling**: Supabase handles database scaling automatically
- **File Storage**: AWS S3 for reliable file storage and CDN
- **Monitoring**: Comprehensive logging and error tracking
- **Backup Strategy**: Regular database backups through Supabase

## Contributing

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint/Prettier**: Consistent code formatting
- **Component Structure**: Modular, reusable component design
- **API Design**: RESTful API patterns with proper error handling

### Testing Strategy
- **Unit Tests**: Component and utility function testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Critical user flow testing
- **Performance Tests**: Load testing for job processing

## Future Roadmap

### Planned Features
- **Advanced Analytics**: Enhanced usage analytics and insights
- **API Access**: Public API for programmatic access
- **Webhook Integration**: Real-time notifications for job completion
- **Advanced AI Models**: Integration with additional AI providers
- **Collaboration Features**: Team-based schema sharing and collaboration

### Scalability Improvements
- **Microservices**: Breaking down monolithic job processing
- **Queue System**: Advanced job queue management
- **Caching Layer**: Redis integration for improved performance
- **Global CDN**: Worldwide content delivery optimization

This documentation provides a comprehensive overview of the Client Synth platform. For specific implementation details, refer to the individual files and their inline documentation.
