/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from '@jest/globals'
import { query, getCurrentUser } from '@/lib/postgres/client'

// Explicit mock factories.
//
// `jest.mock('@/lib/s3-uploader')` on its own does not produce a mock
// constructor under next/jest — the imported class comes through as a plain
// function, so `S3Uploader.mockImplementation(...)` threw
// "mockImplementation is not a function" and took every test in the file with
// it. Declaring the shape here keeps the uploads in-memory and deterministic.
const mockS3Upload = jest.fn()
const mockLocalUpload = jest.fn()

jest.mock('@/lib/postgres/client', () => ({
  query: jest.fn(),
  getCurrentUser: jest.fn()
}))
jest.mock('@/lib/s3-uploader', () => ({
  S3Uploader: jest.fn().mockImplementation(() => ({ uploadFile: mockS3Upload }))
}))
jest.mock('@/lib/local-file-storage', () => ({
  LocalFileStorage: jest.fn().mockImplementation(() => ({ uploadFile: mockLocalUpload }))
}))

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>
const mockQuery = query as jest.MockedFunction<typeof query>

describe('Bulk Upload API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com'
  }

  const mockSchema = {
    id: 'schema-123',
    name: 'Test Schema',
    tenant_id: 'tenant-123',
    schema_definition: {
      fields: [
        { id: '1', name: 'name', type: 'text', description: 'Full name', required: true },
        { id: '2', name: 'email', type: 'email', description: 'Email address', required: true }
      ]
    }
  }

  const mockFiles = [
    new File(['name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com'], 'test1.csv', { type: 'text/csv' }),
    // The route requires an array of objects; a bare object is rejected with
    // "JSON file must contain an array of objects", which is correct behaviour.
    new File(
      ['[{"name": "John Doe", "email": "john@example.com"}, {"name": "Jane Smith", "email": "jane@example.com"}]'],
      'test2.json',
      { type: 'application/json' }
    )
  ]

  // Re-established per test: beforeEach clears mocks, so setting these once in
  // a beforeAll left later tests running against emptied mocks.
  beforeEach(() => {
    jest.clearAllMocks()

    mockS3Upload.mockResolvedValue({
      key: 'test-key',
      bucket: 'test-bucket',
      url: 'https://test-bucket.s3.amazonaws.com/test-key'
    })
    mockLocalUpload.mockResolvedValue({
      key: 'local-key',
      bucket: 'local-storage',
      url: 'http://localhost:3000/api/files/local-key'
    })

    mockGetCurrentUser.mockResolvedValue(mockUser as any)

    // The route's SQL is multi-line, so matching against a single-spaced
    // string never fired — the schema lookup silently returned no rows and the
    // upload 404'd. Collapse whitespace before matching.
    mockQuery.mockImplementation(async (rawSql: string, params?: any[]) => {
      const sql = rawSql.replace(/\s+/g, ' ').trim()

      // Mock schema lookup
      if (sql.includes('SELECT s.*, t.id as tenant_id FROM schemas s')) {
        return { rows: [mockSchema] }
      }
      
      // Mock session creation
      if (sql.includes('INSERT INTO bulk_upload_sessions')) {
        return { rows: [{ id: 'session-123' }] }
      }
      
      // Mock file creation
      if (sql.includes('INSERT INTO example_files')) {
        return { rows: [{ id: 'file-123' }] }
      }
      
      // Mock bulk upload file creation
      if (sql.includes('INSERT INTO bulk_upload_files')) {
        return { rows: [] }
      }
      
      // Mock example data insertion
      if (sql.includes('INSERT INTO example_data')) {
        return { rows: [] }
      }
      
      // Mock session update
      if (sql.includes('UPDATE bulk_upload_sessions SET')) {
        return { rows: [] }
      }
      
      return { rows: [] }
    })

  })

  describe('POST /api/schemas/[id]/examples/bulk-upload', () => {
    it('should successfully process bulk upload with valid files', async () => {
      const formData = new FormData()
      mockFiles.forEach(file => formData.append('files', file))
      formData.append('fieldMappings', JSON.stringify({}))

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload', {
        method: 'POST',
        body: formData
      })

      // Import the handler dynamically to avoid module loading issues
      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.totalFiles).toBe(2)
      expect(result.completedFiles).toBe(2)
      expect(result.failedFiles).toBe(0)
      expect(result.results).toHaveLength(2)
    })

    it('should reject upload with too many files', async () => {
      const formData = new FormData()
      // Create 51 files (exceeds limit of 50)
      for (let i = 0; i < 51; i++) {
        const file = new File(['test content'], `test${i}.txt`, { type: 'text/plain' })
        formData.append('files', file)
      }

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('Maximum 50 files allowed')
    })

    it('should reject upload with no files', async () => {
      const formData = new FormData()

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('No files provided')
    })

    it('should handle authentication failure', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null)

      const formData = new FormData()
      mockFiles.forEach(file => formData.append('files', file))

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.error).toContain('Unauthorized')
    })

    it('should handle schema not found', async () => {
      // No schema row for the lookup -> 404.
      mockQuery.mockImplementationOnce(async () => ({ rows: [] }))

      const formData = new FormData()
      mockFiles.forEach(file => formData.append('files', file))

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toContain('Schema not found')
    })
  })

  describe('GET /api/schemas/[id]/examples/bulk-upload', () => {
    it('should return recent uploads for authenticated user', async () => {
      const mockUploads = [
        {
          id: 'file-1',
          file_name: 'test1.csv',
          file_type: 'csv',
          file_size: 1024,
          created_at: new Date().toISOString(),
          uploaded_by_name: 'Test User',
          parsing_metadata: { fields: [], confidence: 0.8, recordCount: 10 }
        }
      ]

      mockQuery.mockImplementationOnce(async (rawSql: string, params?: any[]) => {
        if (rawSql.replace(/\s+/g, ' ').includes('FROM example_files ef')) {
          return { rows: mockUploads }
        }
        return { rows: [] }
      })

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload')

      const { GET } = await import('@/app/api/schemas/[id]/examples/bulk-upload/route')
      
      const response = await GET(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.uploads).toEqual(mockUploads)
    })
  })
})

describe('Bulk Upload Retry API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com'
  }

  // Auth comes from getCurrentUser (Postgres); the old Supabase createClient
  // mock this block used no longer exists.
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(mockUser as any)
  })

  describe('POST /api/schemas/[id]/examples/bulk-upload/retry', () => {
    it('should retry failed files successfully', async () => {
      const mockFailedFiles = [
        {
          id: 'file-1',
          file_name: 'test1.csv',
          file_type: 'csv',
          file_size: 1024
        }
      ]

      mockQuery.mockImplementation(async (rawSql: string, params?: any[]) => {
        const sql = rawSql.replace(/\s+/g, ' ').trim()
        if (sql.includes('SELECT buf.*, ef.file_name')) {
          return { rows: mockFailedFiles }
        }
        if (sql.includes('UPDATE bulk_upload_files SET')) {
          return { rows: [] }
        }
        return { rows: [] }
      })

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileIds: ['file-1'] })
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/retry/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.retryCount).toBe(1)
    })

    it('should handle no failed files found', async () => {
      mockQuery.mockImplementationOnce(async () => ({ rows: [] }))

      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileIds: ['file-1'] })
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/retry/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toContain('No failed files found')
    })

    it('should handle missing file IDs', async () => {
      const request = new Request('http://localhost:3000/api/schemas/schema-123/examples/bulk-upload/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const { POST } = await import('@/app/api/schemas/[id]/examples/bulk-upload/retry/route')
      
      const response = await POST(request, { params: { id: 'schema-123' } })
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('File IDs are required')
    })
  })
})






