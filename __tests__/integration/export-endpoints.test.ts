/**
 * @jest-environment node
 */
/**
 * Export endpoint tests
 * Tests: POST /api/exports/create
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()
const mockHasTenantAccess = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  hasTenantAccess: (...args: any[]) => mockHasTenantAccess(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

const mockGenerateExport = jest.fn()
const mockGetContentType = jest.fn()

jest.mock("@/lib/export-utils", () => ({
  ExportGenerator: jest.fn().mockImplementation(() => ({
    generateExport: mockGenerateExport,
    getContentType: mockGetContentType,
  })),
}))

import { POST as createExportRoute } from "@/app/api/exports/create/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

describe("POST /api/exports/create", () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    job_id: TEST_IDS.JOB,
    name: "test-export",
    format: "csv",
    filters: { fields: ["full_name", "email"] },
  }

  it("should create an export successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.JOB,
        tenant_id: TEST_IDS.TENANT,
        name: "Test Job",
        status: "completed",
      }])) // job lookup
    mockHasTenantAccess.mockResolvedValueOnce(true)
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.EXPORT,
        tenant_id: TEST_IDS.TENANT,
        job_id: TEST_IDS.JOB,
        name: "test-export",
        format: "csv",
      }])) // insert export

    mockGenerateExport.mockResolvedValueOnce("full_name,email\nJohn,john@test.com")
    mockGetContentType.mockReturnValueOnce("text/csv")

    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // update export

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: validBody,
    })

    const res = await createExportRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.export).toBeDefined()
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: validBody,
    })

    const res = await createExportRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when job_id is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: { name: "export", format: "csv" },
    })

    const res = await createExportRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 when format is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: { job_id: TEST_IDS.JOB, name: "export" },
    })

    const res = await createExportRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 for invalid format", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: { job_id: TEST_IDS.JOB, name: "export", format: "pdf" },
    })

    const res = await createExportRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Invalid format")
  })

  it("should return 404 when job not found", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: validBody,
    })

    const res = await createExportRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(404)
  })

  it("should return 403 when no tenant access", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.JOB,
      tenant_id: TEST_IDS.TENANT,
      name: "Test Job",
      status: "completed",
    }]))
    mockHasTenantAccess.mockResolvedValueOnce(false)

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: validBody,
    })

    const res = await createExportRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(403)
  })

  it("should return 400 when job is not completed", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.JOB,
      tenant_id: TEST_IDS.TENANT,
      name: "Test Job",
      status: "running",
    }]))
    mockHasTenantAccess.mockResolvedValueOnce(true)

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: validBody,
    })

    const res = await createExportRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("completed")
  })
})
