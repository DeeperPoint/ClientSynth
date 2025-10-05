# Local Development Setup

This guide explains how to set up ClientSynth for local development using Docker Compose and PostgreSQL instead of Supabase.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- pnpm

## Quick Start

```bash
# 1. Clone and setup
git clone <repository>
cd ClientSynth

# 2. Run the setup script
pnpm local:setup

# 3. Start development
pnpm dev
```

## Manual Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Docker Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Wait for services to be ready
sleep 10
```

### 3. Run Database Migrations

```bash
# Set environment variable
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/clientsynth"

# Run migrations
pnpm local:migrate
```

### 4. Start Development Server

```bash
pnpm dev
```

## Available Commands

### Local Development Commands

```bash
# Setup local environment
pnpm local:setup

# Start Docker services
pnpm local:up

# Stop Docker services
pnpm local:down

# View service logs
pnpm local:logs

# Connect to database
pnpm local:db

# Run migrations
pnpm local:migrate

# Check database status
pnpm local:status
```

### Database Commands

```bash
# Run all migrations
pnpm db:migrate

# Check database status
pnpm db:status

# Show recent jobs
pnpm db:jobs

# List tables
pnpm db:tables

# List functions
pnpm db:functions
```

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Frontend -> Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Database Configuration
DATABASE_URL=postgres://postgres:postgres@localhost:5432/clientsynth
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clientsynth
DB_USER=postgres
DB_PASSWORD=postgres

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# AI Services
OPENROUTER_API_KEY=your_openrouter_api_key_here

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET=your_s3_bucket_name
AWS_REGION=us-east-2

# FAL AI
FAL_KEY=your_fal_key_here

# Job Processing
JOB_PROCESSOR_SECRET=your-secure-job-processor-secret-key-2024
```

## Docker Services

### PostgreSQL
- **Host**: localhost
- **Port**: 5432
- **Database**: clientsynth
- **Username**: postgres
- **Password**: postgres

### Redis
- **Host**: localhost
- **Port**: 6379

## Database Schema

The local PostgreSQL setup includes:

- **Users table** - User authentication and profiles
- **Tenants table** - Multi-tenant organization
- **User-Tenant roles** - Role-based access control
- **Schemas table** - Data generation schemas
- **Jobs table** - Job processing and status
- **Generated data table** - Generated synthetic data
- **Media table** - Generated images and files
- **Job logs table** - Processing logs
- **Job controls table** - Job control signals
- **Exports table** - Data export management

## Authentication

The local setup uses JWT-based authentication instead of Supabase:

- **Login**: `POST /api/auth/login`
- **Register**: `POST /api/auth/register`
- **JWT tokens** for API authentication
- **Role-based access control** (owner, admin, member)

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Jobs
- `GET /api/jobs` - List jobs (requires auth)
- `POST /api/jobs/create` - Create job (requires auth)
- `POST /api/jobs/process` - Process jobs (requires API key)

### Database
- All database operations use local PostgreSQL
- Migrations are managed through the migration system
- Real-time features can be implemented with Redis

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Migration Issues

```bash
# Check database status
pnpm local:status

# Reset database and run migrations
pnpm db:migrate:reset
```

### Port Conflicts

If ports 5432 or 6379 are already in use:

```bash
# Stop conflicting services
sudo service postgresql stop
sudo service redis-server stop

# Or change ports in docker-compose.yml
```

## Development Workflow

1. **Start services**: `pnpm local:up`
2. **Run migrations**: `pnpm local:migrate`
3. **Start development**: `pnpm dev`
4. **Make changes** to code
5. **Test changes** in browser
6. **Stop services**: `pnpm local:down`

## Production Deployment

For production deployment:

1. Use a managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.)
2. Use a managed Redis service (AWS ElastiCache, Google Cloud Memorystore, etc.)
3. Set secure environment variables
4. Use proper SSL certificates
5. Configure load balancing and scaling

## Differences from Supabase

| Feature | Supabase | Local Setup |
|---------|----------|-------------|
| Database | Managed PostgreSQL | Local PostgreSQL |
| Authentication | Supabase Auth | JWT-based |
| Real-time | Supabase Realtime | Redis + custom |
| Storage | Supabase Storage | AWS S3 |
| Edge Functions | Supabase Functions | Next.js API Routes |
| RLS Policies | Built-in | Custom middleware |

## Benefits of Local Setup

✅ **Full control** over database and services  
✅ **No external dependencies** on Supabase  
✅ **Faster development** with local services  
✅ **Cost-effective** for development  
✅ **Easier debugging** with direct database access  
✅ **Custom authentication** system  
✅ **Flexible deployment** options  

## Next Steps

1. **Test the setup** with the provided commands
2. **Create test data** using the API endpoints
3. **Implement additional features** as needed
4. **Deploy to production** when ready

Happy coding! 🚀
