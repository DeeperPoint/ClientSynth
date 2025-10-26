# Client Synth - API Reference

Complete API documentation for Client Synth platform.

**Base URL**: `http://localhost:3000` (development) or `https://your-domain.com` (production)

**Version**: 1.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Schemas](#schemas)
3. [Jobs](#jobs)
4. [Exports](#exports)
5. [Images](#images)
6. [Example Files](#example-files)
7. [Dashboard](#dashboard)
8. [Database](#database)
9. [Error Handling](#error-handling)
10. [Rate Limits](#rate-limits)

---

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "John Smith"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "John Smith"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "name": "John Smith's Workspace",
    "role": "owner"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid fields
- `409 Conflict`: Email already exists

**Example:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!",
    "full_name": "John Smith"
  }'
```

---

### POST /api/auth/login

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "John Smith",
    "tenants": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "name": "John Smith's Workspace",
        "role": "owner"
      }
    ]
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing email or password
- `401 Unauthorized`: Invalid credentials

**Example:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

---

### GET /api/auth/me

Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "John Smith",
    "avatar_url": null,
    "tenants": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "name": "John Smith's Workspace",
        "role": "owner"
      }
    ]
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing token

**Example:**
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/auth/logout

Logout current user (client-side token removal).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Schemas

### POST /api/schemas/create

Create a new data generation schema.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Client Profiles",
  "description": "Realistic client data for testing",
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
        "description": "Professional email address",
        "required": true
      },
      {
        "name": "company",
        "type": "company",
        "description": "Company name",
        "required": true
      },
      {
        "name": "job_title",
        "type": "job_title",
        "description": "Job position",
        "required": true
      },
      {
        "name": "profile_image",
        "type": "image",
        "description": "Professional headshot",
        "required": false
      }
    ]
  }
}
```

**Field Types:**
- `name` - Full name
- `first_name` - First name only
- `last_name` - Last name only
- `email` - Email address
- `phone` - Phone number
- `address` - Street address
- `city` - City name
- `state` - State/province
- `zip` - Postal code
- `country` - Country name
- `company` - Company name
- `job_title` - Job position
- `industry` - Industry sector
- `date` - Date value
- `number` - Numeric value
- `text` - Free-form text
- `url` - Website URL
- `image` - AI-generated image
- `pdf` - AI-generated PDF document

**Response (200 OK):**
```json
{
  "success": true,
  "schema": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "name": "Client Profiles",
    "description": "Realistic client data for testing",
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "created_by": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-10-26T12:00:00.000Z",
    "updated_at": "2025-10-26T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid schema definition
- `401 Unauthorized`: Missing or invalid token
- `422 Unprocessable Entity`: Validation errors

**Example:**
```bash
curl -X POST http://localhost:3000/api/schemas/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Client Profiles",
    "description": "Test data",
    "schema_definition": {
      "fields": [
        {"name": "full_name", "type": "name", "required": true},
        {"name": "email", "type": "email", "required": true}
      ]
    }
  }'
```

---

### GET /api/schemas

List all schemas for the current tenant.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)
- `sort` (optional): Sort field (default: created_at)
- `order` (optional): Sort order - asc/desc (default: desc)

**Response (200 OK):**
```json
{
  "schemas": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "name": "Client Profiles",
      "description": "Realistic client data for testing",
      "created_by": "John Smith",
      "created_at": "2025-10-26T12:00:00.000Z",
      "field_count": 5,
      "job_count": 3
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/schemas?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/schemas/[id]

Get schema details by ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "schema": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "name": "Client Profiles",
    "description": "Realistic client data for testing",
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
          "description": "Professional email address",
          "required": true
        }
      ]
    },
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "created_by": "John Smith",
    "created_at": "2025-10-26T12:00:00.000Z",
    "updated_at": "2025-10-26T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `404 Not Found`: Schema not found
- `403 Forbidden`: Access denied

**Example:**
```bash
curl -X GET http://localhost:3000/api/schemas/770e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### PUT /api/schemas/[id]

Update an existing schema.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Client Profiles",
  "description": "Updated description",
  "schema_definition": {
    "fields": [...]
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "schema": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Client Profiles",
    "updated_at": "2025-10-26T13:00:00.000Z"
  }
}
```

---

### DELETE /api/schemas/[id]

Delete a schema (and all associated jobs).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Schema deleted successfully"
}
```

**Error Responses:**
- `404 Not Found`: Schema not found
- `403 Forbidden`: Insufficient permissions

---

## Jobs

### POST /api/jobs/create

Create a new data generation job.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "schema_id": "770e8400-e29b-41d4-a716-446655440000",
  "name": "Test Data - October 2025",
  "total_records": 100,
  "config": {
    "batch_size": 10,
    "ai_model": "google/gemini-2.0-flash-exp:free",
    "image_model": "black-forest-labs/flux-1-schnell",
    "enable_variation": true,
    "context_awareness": true,
    "max_retries": 3
  }
}
```

**Config Options:**
- `batch_size` (number): Records per batch (default: 10)
- `ai_model` (string): OpenRouter model ID
- `image_model` (string): Image generation model
- `enable_variation` (boolean): Use seed variation (default: true)
- `context_awareness` (boolean): Enable field relationships (default: true)
- `max_retries` (number): Retry attempts on failure (default: 3)

**Response (200 OK):**
```json
{
  "success": true,
  "job": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "name": "Test Data - October 2025",
    "schema_id": "770e8400-e29b-41d4-a716-446655440000",
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "progress": 0,
    "total_records": 100,
    "generated_records": 0,
    "created_by": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-10-26T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing required fields
- `404 Not Found`: Schema not found

**Example:**
```bash
curl -X POST http://localhost:3000/api/jobs/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "770e8400-e29b-41d4-a716-446655440000",
    "name": "Test Generation",
    "total_records": 50,
    "config": {"batch_size": 10}
  }'
```

---

### GET /api/jobs

List all jobs for the current tenant.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)
- `status` (optional): Filter by status (pending/running/completed/failed)
- `schema_id` (optional): Filter by schema ID

**Response (200 OK):**
```json
{
  "jobs": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "name": "Test Data - October 2025",
      "schema_name": "Client Profiles",
      "status": "completed",
      "progress": 100,
      "total_records": 100,
      "generated_records": 100,
      "created_by": "John Smith",
      "created_at": "2025-10-26T12:00:00.000Z",
      "completed_at": "2025-10-26T12:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/jobs?status=completed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/jobs/[id]

Get job details and progress.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "job": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "name": "Test Data - October 2025",
    "schema_id": "770e8400-e29b-41d4-a716-446655440000",
    "schema_name": "Client Profiles",
    "status": "processing",
    "progress": 45,
    "total_records": 100,
    "generated_records": 45,
    "error_count": 0,
    "retry_count": 0,
    "can_be_paused": true,
    "can_be_cancelled": true,
    "can_be_retried": false,
    "started_at": "2025-10-26T12:00:00.000Z",
    "estimated_completion": "2025-10-26T12:15:00.000Z",
    "created_by": "John Smith",
    "created_at": "2025-10-26T11:55:00.000Z"
  },
  "recent_records": [
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "record_index": 44,
      "record_data": {
        "full_name": "John Smith",
        "email": "john.smith@techcorp.com",
        "company": "Tech Corp",
        "job_title": "Software Engineer"
      },
      "created_at": "2025-10-26T12:10:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/jobs/880e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/jobs/process

Process next pending job (usually triggered by cron or webhook).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "processed": true,
  "job_id": "880e8400-e29b-41d4-a716-446655440000",
  "records_generated": 100,
  "message": "Job processed successfully"
}
```

**Response (200 OK - No Jobs):**
```json
{
  "success": true,
  "processed": false,
  "message": "No jobs to process"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/jobs/process \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/jobs/control

Control job execution (pause/resume/cancel/retry).

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "jobId": "880e8400-e29b-41d4-a716-446655440000",
  "action": "pause"
}
```

**Actions:**
- `pause` - Pause a running job
- `resume` - Resume a paused job
- `cancel` - Cancel a job
- `retry` - Retry a failed job

**Response (200 OK):**
```json
{
  "success": true,
  "job": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "status": "paused",
    "updated_at": "2025-10-26T12:30:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid action or job state
- `404 Not Found`: Job not found

**Example:**
```bash
curl -X POST http://localhost:3000/api/jobs/control \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "880e8400-e29b-41d4-a716-446655440000",
    "action": "pause"
  }'
```

---

## Exports

### POST /api/exports/create

Create a data export from a completed job.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_id": "880e8400-e29b-41d4-a716-446655440000",
  "format": "csv",
  "filters": {
    "fields": ["full_name", "email", "company"],
    "limit": 1000,
    "offset": 0
  }
}
```

**Formats:**
- `csv` - Comma-separated values
- `json` - JSON array
- `xlsx` - Excel spreadsheet
- `sql` - SQL INSERT statements
- `xml` - XML document
- `parquet` - Apache Parquet (for big data)

**Response (200 OK):**
```json
{
  "success": true,
  "export": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "job_id": "880e8400-e29b-41d4-a716-446655440000",
    "format": "csv",
    "download_url": "https://synthetic-client-assets-1761171658.s3.amazonaws.com/exports/export-aa0e8400.csv",
    "file_size": 245678,
    "record_count": 1000,
    "created_at": "2025-10-26T12:00:00.000Z",
    "expires_at": "2025-11-02T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid format or filters
- `404 Not Found`: Job not found
- `422 Unprocessable Entity`: Job not completed

**Example:**
```bash
curl -X POST http://localhost:3000/api/exports/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "880e8400-e29b-41d4-a716-446655440000",
    "format": "json",
    "filters": {
      "fields": ["full_name", "email"],
      "limit": 100
    }
  }'
```

---

### GET /api/exports

List all exports for the current tenant.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "exports": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "job_name": "Test Data - October 2025",
      "format": "csv",
      "file_size": 245678,
      "record_count": 1000,
      "download_url": "https://...",
      "created_at": "2025-10-26T12:00:00.000Z",
      "expires_at": "2025-11-02T12:00:00.000Z"
    }
  ]
}
```

---

### DELETE /api/exports/[id]

Delete an export.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Export deleted successfully"
}
```

---

## Images

### POST /api/images/generate

Generate an AI image for a specific field.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "tenantId": "660e8400-e29b-41d4-a716-446655440000",
  "jobId": "880e8400-e29b-41d4-a716-446655440000",
  "recordId": "990e8400-e29b-41d4-a716-446655440000",
  "fieldName": "profile_photo",
  "prompt": "professional headshot",
  "recordData": {
    "full_name": "John Smith",
    "job_title": "Software Engineer",
    "company": "Tech Corp"
  },
  "fieldDescription": "Professional headshot photo",
  "style": "professional",
  "model": "black-forest-labs/flux-1-schnell"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "result": {
    "url": "https://synthetic-client-assets-1761171658.s3.amazonaws.com/synthetic-data/tenant-id/2025-10-26/job-id/record-id/profile_photo-abc12345-xyz789.png",
    "s3Key": "synthetic-data/tenant-id/2025-10-26/job-id/record-id/profile_photo-abc12345-xyz789.png",
    "fileSize": 125678,
    "md5Hash": "abc123def456...",
    "metadata": {
      "model": "black-forest-labs/flux-1-schnell",
      "enhancedPrompt": "Professional headshot photo of person named John Smith...",
      "originalPrompt": "professional headshot"
    }
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/images/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "660e8400-e29b-41d4-a716-446655440000",
    "jobId": "880e8400-e29b-41d4-a716-446655440000",
    "recordId": "990e8400-e29b-41d4-a716-446655440000",
    "fieldName": "profile_photo",
    "prompt": "professional headshot",
    "style": "professional"
  }'
```

---

### GET /api/images/models

Get available image generation models.

**Response (200 OK):**
```json
{
  "models": [
    {
      "id": "black-forest-labs/flux-1-schnell",
      "name": "FLUX.1 Schnell",
      "provider": "OpenRouter",
      "description": "Fast, high-quality image generation"
    }
  ]
}
```

---

## Example Files

### POST /api/schemas/[id]/examples/upload

Upload example file for AI learning.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file` (File): CSV, JSON, or Excel file
- `fieldMappings` (JSON string): Field name mappings

**Example fieldMappings:**
```json
{
  "first_name": "full_name",
  "email": "email",
  "company_name": "company"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "file": {
    "id": "bb0e8400-e29b-41d4-a716-446655440000",
    "schema_id": "770e8400-e29b-41d4-a716-446655440000",
    "file_name": "examples.csv",
    "file_type": "csv",
    "file_size": 12345,
    "parsed_rows": 50,
    "fields_mapped": 5,
    "s3_key": "example-files/tenant-id/2025-10-26/schema-id/examples.csv-abc123-xyz789",
    "created_at": "2025-10-26T12:00:00.000Z"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/schemas/770e8400-e29b-41d4-a716-446655440000/examples/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@examples.csv" \
  -F 'fieldMappings={"first_name":"full_name","email":"email"}'
```

---

### POST /api/schemas/[id]/examples/mapping

Get field mapping suggestions.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fieldNames": ["first_name", "last_name", "email_address"],
  "schemaFields": ["full_name", "email", "company"]
}
```

**Response (200 OK):**
```json
{
  "suggestions": {
    "first_name": "full_name",
    "last_name": "full_name",
    "email_address": "email"
  }
}
```

---

### GET /api/schemas/[id]/examples

Get all example files for a schema.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "files": [
    {
      "id": "bb0e8400-e29b-41d4-a716-446655440000",
      "file_name": "examples.csv",
      "file_type": "csv",
      "file_size": 12345,
      "uploaded_by": "John Smith",
      "created_at": "2025-10-26T12:00:00.000Z",
      "example_count": 50
    }
  ]
}
```

---

## Dashboard

### GET /api/dashboard/stats

Get dashboard statistics and recent activities.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
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
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "type": "job_completed",
      "job_name": "Test Data - October 2025",
      "schema_name": "Client Profiles",
      "created_at": "2025-10-26T12:00:00.000Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "type": "schema_created",
      "schema_name": "Employee Records",
      "created_at": "2025-10-25T15:30:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Database

### POST /api/db

Generic database operations (internal use).

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (SELECT):**
```json
{
  "action": "select",
  "table": "jobs",
  "columns": ["id", "name", "status", "progress"],
  "where": {
    "status": "completed"
  },
  "orderBy": "created_at",
  "order": "DESC",
  "limit": 20
}
```

**Request Body (INSERT):**
```json
{
  "action": "insert",
  "table": "jobs",
  "data": {
    "name": "New Job",
    "schema_id": "770e8400-e29b-41d4-a716-446655440000",
    "total_records": 100
  }
}
```

**Request Body (UPDATE):**
```json
{
  "action": "update",
  "table": "jobs",
  "data": {
    "status": "completed",
    "progress": 100
  },
  "where": {
    "id": "880e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Request Body (DELETE):**
```json
{
  "action": "delete",
  "table": "jobs",
  "where": {
    "id": "880e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```json
{
  "error": "Error message",
  "details": "Detailed error description",
  "code": "ERROR_CODE",
  "timestamp": "2025-10-26T12:00:00.000Z"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Common Error Codes

- `AUTH_REQUIRED` - Authentication required
- `INVALID_TOKEN` - Invalid JWT token
- `TOKEN_EXPIRED` - JWT token expired
- `ACCESS_DENIED` - Insufficient permissions
- `RESOURCE_NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Input validation failed
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `OPENROUTER_ERROR` - AI API error
- `S3_UPLOAD_ERROR` - File upload failed
- `DATABASE_ERROR` - Database operation failed

---

## Rate Limits

### Current Limits

- **Authentication**: 10 requests/minute per IP
- **API Endpoints**: 100 requests/minute per user
- **Job Processing**: 5 concurrent jobs per tenant
- **File Uploads**: 10 uploads/hour per tenant

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635264000
```

### Handling Rate Limits

When rate limited, you'll receive a 429 response:

```json
{
  "error": "Rate limit exceeded",
  "details": "Too many requests. Please try again in 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60
}
```

**Best Practices:**
- Implement exponential backoff
- Cache responses when possible
- Use batch operations
- Monitor rate limit headers

---

## Webhooks (Future Feature)

Webhooks will be available in a future release for:
- Job completion notifications
- Export ready notifications
- Error alerts

---

## SDK Support (Future Feature)

Official SDKs planned for:
- JavaScript/TypeScript
- Python
- Go
- Ruby

---

## Changelog

### Version 1.0.0 (2025-10-26)

**Added:**
- JWT-based authentication
- Schema management
- Job creation and processing
- Example file upload
- Multi-format exports
- AI text and image generation
- PDF document generation
- Dashboard statistics
- Job control signals

**Security:**
- Row Level Security
- Bcrypt password hashing
- JWT token authentication
- Parameterized SQL queries

---

## Support

For API support:
- **Documentation**: See `DOCUMENTATION.md`
- **Quick Start**: See `QUICK_START.md`
- **GitHub Issues**: Report bugs and request features
- **Email**: support@clientsynth.com (if applicable)

---

**API Version**: 1.0.0  
**Last Updated**: October 26, 2025  
**Base URL**: `http://localhost:3000` (development)

