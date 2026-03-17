/**
 * @jest-environment node
 */
/**
 * Job endpoint tests
 * Tests: POST /api/jobs/create, POST /api/jobs/control, POST /api/jobs/process
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

const mockProcessNextJob = jest.fn()

jest.mock("@/lib/job-processor", () => ({
  JobProcessor: jest.fn().mockImplementation(() => ({
    processNextJob: mockProcessNextJob,
  })),
}))

// Mock global fetch for job create's fire-and-forget trigger
const originalFetch = global.fetch
beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any
})
afterAll(() => {
  global.fetch = originalFetch
})

import { POST as createJobRoute } from "@/app/api/jobs/create/route"
import { POST as controlJobRoute } from "@/app/api/jobs/control/route"
import { POST as processJobRoute, GET as processJobGetRoute } from "@/app/api/jobs/process/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

// ---------------------------------------------------------------------------
// Jobs Create
// ---------------------------------------------------------------------------

describe("POST /api/jobs/create", () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockGetCurrentUser.mockReset()
    mockProcessNextJob.mockReset()
  })

  const validBody = {
    schema_id: TEST_IDS.SCHEMA,
    name: "Test Job",
    total_records: 100,
    config: { batch_size: 10 },
  }

  it("should create a job successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // user tenants
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.SCHEMA,
        tenant_id: TEST_IDS.TENANT,
        name: "Test Schema",
        schema_definition: { fields: [] },
      }])) // schema fetch
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.JOB,
        tenant_id: TEST_IDS.TENANT,
        schema_id: TEST_IDS.SCHEMA,
        name: "Test Job",
        status: "pending",
        total_records: 100,
        created_by: TEST_IDS.USER,
      }])) // job insert

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: validBody,
    })

    const res = await createJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.job.name).toBe("Test Job")
    expect(body.job.status).toBe("pending")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: validBody,
    })

    const res = await createJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when schema_id is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: { name: "Test", total_records: 100 },
    })

    const res = await createJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Missing required fields")
  })

  it("should return 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: { schema_id: TEST_IDS.SCHEMA, total_records: 100 },
    })

    const res = await createJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 when total_records is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: { schema_id: TEST_IDS.SCHEMA, name: "Test" },
    })

    const res = await createJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 404 when schema not found", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // user tenants
      .mockResolvedValueOnce(mockQueryResult([])) // schema not found

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/create", {
      body: validBody,
    })

    const res = await createJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Jobs Control
// ---------------------------------------------------------------------------

describe("POST /api/jobs/control", () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockGetCurrentUser.mockReset()
    mockProcessNextJob.mockReset()
  })

  it("should pause a running job", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        tenant_id: TEST_IDS.TENANT,
        status: "running",
        can_be_paused: true,
        can_be_cancelled: true,
        can_be_retried: false,
      }])) // job lookup
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // tenant access
      .mockResolvedValueOnce(mockQueryResult([{ control_id: "ctrl-123" }])) // send signal

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.controlId).toBe("ctrl-123")
  })

  it("should resume a paused job", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        tenant_id: TEST_IDS.TENANT,
        status: "paused",
        can_be_paused: true,
        can_be_cancelled: true,
        can_be_retried: true,
      }]))
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }]))
      .mockResolvedValueOnce(mockQueryResult([{ control_id: "ctrl-456" }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "resume" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it("should cancel a pending job", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        tenant_id: TEST_IDS.TENANT,
        status: "pending",
        can_be_paused: false,
        can_be_cancelled: true,
        can_be_retried: false,
      }]))
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }]))
      .mockResolvedValueOnce(mockQueryResult([{ control_id: "ctrl-789" }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "cancel" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it("should return 400 when jobId is missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 for invalid action", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "delete" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Invalid action")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      tenant_id: TEST_IDS.TENANT,
      status: "running",
      can_be_paused: true,
      can_be_cancelled: true,
      can_be_retried: false,
    }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 404 when job not found", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([])) // job lookup - not found
      .mockResolvedValueOnce(mockQueryResult([])) // tenant access (should not reach)

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: "nonexistent", action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(404)
    expect(body.error).toContain("Job not found")
  })

  it("should return 403 when no tenant access", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        tenant_id: TEST_IDS.TENANT,
        status: "running",
        can_be_paused: true,
        can_be_cancelled: true,
        can_be_retried: false,
      }]))
      .mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(403)
  })

  it("should return 400 for invalid state transition (pause completed job)", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{
        tenant_id: TEST_IDS.TENANT,
        status: "completed",
        can_be_paused: false,
        can_be_cancelled: false,
        can_be_retried: false,
      }]))
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/control", {
      body: { jobId: TEST_IDS.JOB, action: "pause" },
    })

    const res = await controlJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Cannot pause")
  })
})

// ---------------------------------------------------------------------------
// Jobs Process
// ---------------------------------------------------------------------------

describe("POST /api/jobs/process", () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockGetCurrentUser.mockReset()
    mockProcessNextJob.mockReset()
  })

  it("should process next job successfully", async () => {
    mockProcessNextJob.mockResolvedValueOnce(true)

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/process")
    const res = await processJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.processed).toBe(true)
    expect(body.message).toContain("processed successfully")
  })

  it("should return success when no jobs to process", async () => {
    mockProcessNextJob.mockResolvedValueOnce(false)

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/process")
    const res = await processJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.processed).toBe(false)
    expect(body.message).toContain("No jobs")
  })

  it("should return 500 on processing error", async () => {
    mockProcessNextJob.mockRejectedValueOnce(new Error("Processing failed"))

    const req = createNextRequest("POST", "http://localhost:3000/api/jobs/process")
    const res = await processJobRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.success).toBe(false)
  })

  it("GET should delegate to POST handler", async () => {
    mockProcessNextJob.mockResolvedValueOnce(true)

    const req = createNextRequest("GET", "http://localhost:3000/api/jobs/process")
    const res = await processJobGetRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })
})
