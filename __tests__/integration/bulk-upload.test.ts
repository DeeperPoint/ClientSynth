import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { query, getCurrentUser } from '@/lib/postgres/client'
import { S3Uploader } from '@/lib/s3-uploader'
import { LocalFileStorage } from '@/lib/local-file-storage'

// Mock dependencies
jest.mock('@/lib/postgres/client', () => ({
  query: jest.fn(),
  getCurrentUser: jest.fn()
}))
jest.mock('@/lib/s3-uploader')
jest.mock('@/lib/local-file-storage')

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>
const mockQuery = query as jest.MockedFunction<typeof query>
const mockS3Uploader = S3Uploader as jest.MockedClass<typeof S3Uploader>
const mockLocalStorage = LocalFileStorage as jest.MockedClass<typeof LocalFileStorage>

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
    new File(['{"name": "John Doe", "email": "john@example.com"}'], 'test2.json', { type: 'application/json' })
  ]

  beforeAll(() => {
    // Setup mocks
    mockGetCurrentUser.mockResolvedValue(mockUser as any)

    mockQuery.mockImplementation(async (sql: string, params: any[]) => {
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

    // Mock S3 uploader
    const mockS3Instance = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'test-key',
        bucket: 'test-bucket',
        url: 'https://test-bucket.s3.amazonaws.com/test-key'
      })
    }
    mockS3Uploader.mockImplementation(() => mockS3Instance as any)

    // Mock local storage
    const mockLocalInstance = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'local-key',
        bucket: 'local-storage',
        url: 'http://localhost:3000/api/files/local-key'
      })
    }
    mockLocalStorage.mockImplementation(() => mockLocalInstance as any)
  })

  beforeEach(() => {
    jest.clearAllMocks()
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
      mockQuery.mockImplementationOnce(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT s.*, t.id as tenant_id FROM schemas s')) {
          return { rows: [] }
        }
        return { rows: [] }
      })

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

      mockQuery.mockImplementationOnce(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT ef.id, ef.file_name')) {
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

  beforeAll(() => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser }
        })
      }
    } as any)
  })

  beforeEach(() => {
    jest.clearAllMocks()
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

      mockQuery.mockImplementation(async (sql: string, params: any[]) => {
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
      mockQuery.mockImplementationOnce(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT buf.*, ef.file_name')) {
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






