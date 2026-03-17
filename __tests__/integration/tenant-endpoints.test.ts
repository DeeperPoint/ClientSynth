/**
 * @jest-environment node
 */
/**
 * Tenant endpoint tests
 * Tests: POST /api/tenants/create, POST /api/tenants/create-default
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()
const mockCreateTenant = jest.fn()
const mockAddUserToTenant = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  createTenant: (...args: any[]) => mockCreateTenant(...args),
  addUserToTenant: (...args: any[]) => mockAddUserToTenant(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import { POST as createTenantRoute } from "@/app/api/tenants/create/route"
import { POST as createDefaultTenantRoute } from "@/app/api/tenants/create-default/route"
import { createNextRequest, parseResponse, mockUser, mockTenant, mockQueryResult, TEST_IDS } from "../test-helpers"

// ---------------------------------------------------------------------------
// Create Tenant
// ---------------------------------------------------------------------------

describe("POST /api/tenants/create", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should create a tenant successfully", async () => {
    const tenant = mockTenant()
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockCreateTenant.mockResolvedValueOnce(tenant)
    mockAddUserToTenant.mockResolvedValueOnce({
      user_id: TEST_IDS.USER,
      tenant_id: TEST_IDS.TENANT,
      role: "owner",
    })

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create", {
      body: { name: "Test Org", slug: "test-org" },
    })

    const res = await createTenantRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.name).toBe("Test Org")
    expect(mockAddUserToTenant).toHaveBeenCalledWith(TEST_IDS.USER, TEST_IDS.TENANT, "owner")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create", {
      body: { name: "Test Org", slug: "test-org" },
    })

    const res = await createTenantRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create", {
      body: { slug: "test-org" },
    })

    const res = await createTenantRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 when slug is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create", {
      body: { name: "Test Org" },
    })

    const res = await createTenantRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Create Default Tenant
// ---------------------------------------------------------------------------

describe("POST /api/tenants/create-default", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should create a default tenant for a user", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser({ email: "user@company.com" }))
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ user_id: TEST_IDS.USER }])) // create_user
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.TENANT,
        name: "company",
        slug: "company",
      }])) // insert tenant
      .mockResolvedValueOnce(mockQueryResult([])) // add role

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create-default")
    const res = await createDefaultTenantRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.id).toBeDefined()
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create-default")
    const res = await createDefaultTenantRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should handle existing user (duplicate key) idempotently", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser({ email: "user@gmail.com" }))
    // Simulate duplicate key error (code 23505)
    const dupError = new Error("duplicate key")
    ;(dupError as any).code = "23505"
    mockQuery
      .mockRejectedValueOnce(dupError) // create_user fails with duplicate
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.TENANT,
        name: "My Organization",
        slug: "my-organization",
      }])) // insert tenant
      .mockResolvedValueOnce(mockQueryResult([])) // add role

    const req = createNextRequest("POST", "http://localhost:3000/api/tenants/create-default")
    const res = await createDefaultTenantRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.id).toBeDefined()
  })
})
