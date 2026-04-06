/**
 * @jest-environment node
 */
/**
 * Cosolvent integration tests
 * Tests: CosolventExporter field mapping, form construction, retry logic
 *        POST /api/exports/create with format "cosolvent"
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

// Mock global fetch to simulate Cosolvent's profile_service responses
const mockFetch = jest.fn()
global.fetch = mockFetch as any

import { CosolventExporter } from "@/lib/cosolvent-exporter"
import { POST as createExportRoute } from "@/app/api/exports/create/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

// ─── CosolventExporter Unit Tests ────────────────────────────────────────────

describe("CosolventExporter", () => {
  const baseUrl = "http://cosolvent-test:8003"
  let exporter: CosolventExporter

  beforeEach(() => {
    jest.clearAllMocks()
    exporter = new CosolventExporter({ baseUrl, maxRetries: 2 })
  })

  describe("Field Mapping", () => {
    it("should map well-known ClientSynth fields to Cosolvent schema", async () => {
      // Capture the FormData sent to fetch
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      const record = {
        farm_name: "Green Valley Farms",
        contact_name: "Jane Doe",
        email: "jane@example.com",
        phone: "+1-555-123-4567",
        address: "123 Farm Road",
        country: "Kenya",
        region: "Central",
        farm_size: 50,
        annual_production: 20000,
        farm_description: "Organic coffee farm",
        export_experience: "5 years",
        primary_crops: ["coffee", "bananas"],
        certifications: ["organic", "fair-trade"],
      }

      await exporter.exportBatch([record])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`${baseUrl}/profile/api/register`)
      expect(options.method).toBe("POST")

      // Verify the FormData body contains multipart fields
      const body = options.body as FormData
      expect(body).toBeInstanceOf(FormData)
      expect(body.get("farmName")).toBe("Green Valley Farms")
      expect(body.get("contactName")).toBe("Jane Doe")
      expect(body.get("email")).toBe("jane@example.com")
      expect(body.get("phone")).toBe("+1-555-123-4567")
      expect(body.get("address")).toBe("123 Farm Road")
      expect(body.get("country")).toBe("Kenya")
      expect(body.get("region")).toBe("Central")
      expect(body.get("farmSize")).toBe("50")
      expect(body.get("annualProduction")).toBe("20000")
      expect(body.get("farmDescription")).toBe("Organic coffee farm")
      expect(body.get("exportExperience")).toBe("5 years")
      expect(JSON.parse(body.get("primaryCrops") as string)).toEqual(["coffee", "bananas"])
      expect(JSON.parse(body.get("certifications") as string)).toEqual(["organic", "fair-trade"])
    })

    it("should map alternative field names (camelCase, generic names)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      const record = {
        company: "Sunrise Coffee Co",
        full_name: "Bob Smith",
        email_address: "bob@sunrise.com",
        tel: "+44-20-1234-5678",
        location: "456 Plantation St",
        nation: "Colombia",
        province: "Huila",
        size: 120,
        output: 50000,
        bio: "Family-owned plantation since 1950.",
        years_experience: "15 years",
        products: ["arabica", "robusta"],
        certs: ["rainforest-alliance"],
      }

      await exporter.exportBatch([record])

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get("farmName")).toBe("Sunrise Coffee Co")
      expect(body.get("contactName")).toBe("Bob Smith")
      expect(body.get("email")).toBe("bob@sunrise.com")
      expect(body.get("phone")).toBe("+44-20-1234-5678")
      expect(body.get("address")).toBe("456 Plantation St")
      expect(body.get("country")).toBe("Colombia")
      expect(body.get("region")).toBe("Huila")
      expect(body.get("farmSize")).toBe("120")
      expect(body.get("annualProduction")).toBe("50000")
      expect(body.get("farmDescription")).toBe("Family-owned plantation since 1950.")
      expect(body.get("exportExperience")).toBe("15 years")
      expect(JSON.parse(body.get("primaryCrops") as string)).toEqual(["arabica", "robusta"])
      expect(JSON.parse(body.get("certifications") as string)).toEqual(["rainforest-alliance"])
    })

    it("should provide sensible defaults for missing fields", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      // Completely unrelated schema — no matching field names at all
      const record = { score: 95, category: "A" }

      await exporter.exportBatch([record])

      const body = mockFetch.mock.calls[0][1].body as FormData
      expect(body.get("farmName")).toContain("Synth-Farm-")
      expect(body.get("contactName")).toContain("Contact-")
      expect(body.get("email")).toContain("@clientsynth.gen")
      expect(body.get("phone")).toBe("+1-555-000-0000")
      expect(body.get("farmSize")).toBe("10")
      expect(body.get("annualProduction")).toBe("1000")
    })

    it("should always include a placeholder file upload", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      await exporter.exportBatch([{ name: "Test" }])

      const body = mockFetch.mock.calls[0][1].body as FormData
      const file = body.get("files") as Blob
      expect(file).toBeTruthy()
      expect(file).toBeInstanceOf(Blob)

      const metadata = body.get("files_metadata") as string
      expect(JSON.parse(metadata)).toEqual([{ filename: "clientsynth_export.txt", file_type: "document" }])
    })
  })

  describe("Retry Logic", () => {
    it("should retry on network errors with exponential backoff", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      await exporter.exportBatch([{ name: "Retry Test" }])

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should retry on 429 rate limit responses", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "1" }),
          text: async () => "Too Many Requests",
        })
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      await exporter.exportBatch([{ name: "Rate Limit Test" }])

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should throw after exhausting max retries", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

      await expect(exporter.exportBatch([{ name: "Fail Test" }])).rejects.toThrow(
        /Failed to register record 0 after 2 attempts/
      )

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should treat 409 (already exists) as success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => "A profile with this email already exists.",
      })

      // Should NOT throw
      await exporter.exportBatch([{ email: "existing@test.com" }])

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe("streamExport", () => {
    it("should paginate through DB records and register each with Cosolvent", async () => {
      // First DB page: 2 records
      mockQuery.mockResolvedValueOnce(mockQueryResult([
        { record_data: { farm_name: "Farm A", email: "a@test.com" }, record_index: 0 },
        { record_data: { farm_name: "Farm B", email: "b@test.com" }, record_index: 1 },
      ]))
      // Second DB page: 0 records (end)
      mockQuery.mockResolvedValueOnce(mockQueryResult([]))

      // Both Cosolvent registrations succeed
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

      const result = await exporter.streamExport("test-job-id", { limit: 100 })

      expect(result.totalSent).toBe(2)
      expect(result.totalFailed).toBe(0)
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should track partial failures without crashing the full export", async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([
        { record_data: { farm_name: "Farm OK", email: "ok@test.com" }, record_index: 0 },
        { record_data: { farm_name: "Farm Fail", email: "fail@test.com" }, record_index: 1 },
      ]))
      mockQuery.mockResolvedValueOnce(mockQueryResult([]))

      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
        // Second record: server error, fails after all retries
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" })

      const result = await exporter.streamExport("test-job-id")

      expect(result.totalSent).toBe(1)
      expect(result.totalFailed).toBe(1)
      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].recordIndex).toBe(1)
    })
  })
})

// ─── Export Endpoint: Cosolvent Format Tests ─────────────────────────────────

describe("POST /api/exports/create (cosolvent format)", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should accept 'cosolvent' as a valid export format", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.JOB,
      tenant_id: TEST_IDS.TENANT,
      name: "Test Job",
      status: "completed",
    }]))
    mockHasTenantAccess.mockResolvedValueOnce(true)
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.EXPORT,
      tenant_id: TEST_IDS.TENANT,
      job_id: TEST_IDS.JOB,
      name: "cosolvent-export",
      format: "cosolvent",
    }]))

    // streamExport DB query + Cosolvent registration
    mockQuery.mockResolvedValueOnce(mockQueryResult([
      { record_data: { farm_name: "Test Farm", email: "t@test.com" }, record_index: 0 },
    ]))
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })

    // Update export record
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: {
        job_id: TEST_IDS.JOB,
        name: "cosolvent-export",
        format: "cosolvent",
        filters: { cosolventBaseUrl: "http://cosolvent-mock:8003" },
      },
    })

    const res = await createExportRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.cosolventStats).toBeDefined()
    expect(body.cosolventStats.totalSent).toBe(1)
  })

  it("should return 500 when no COSOLVENT_BASE_URL is provided", async () => {
    // Ensure env var is not set
    const original = process.env.COSOLVENT_BASE_URL
    delete process.env.COSOLVENT_BASE_URL

    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.JOB,
      tenant_id: TEST_IDS.TENANT,
      name: "Test Job",
      status: "completed",
    }]))
    mockHasTenantAccess.mockResolvedValueOnce(true)
    mockQuery.mockResolvedValueOnce(mockQueryResult([{
      id: TEST_IDS.EXPORT,
      tenant_id: TEST_IDS.TENANT,
      job_id: TEST_IDS.JOB,
      name: "cosolvent-export",
      format: "cosolvent",
    }]))

    // Error update query
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: {
        job_id: TEST_IDS.JOB,
        name: "cosolvent-export",
        format: "cosolvent",
        filters: {}, // No cosolventBaseUrl
      },
    })

    const res = await createExportRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.error).toContain("Cosolvent base URL")

    // Restore
    if (original) process.env.COSOLVENT_BASE_URL = original
  })
})
