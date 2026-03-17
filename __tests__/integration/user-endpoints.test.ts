/**
 * @jest-environment node
 */
/**
 * User endpoint tests
 * Tests: GET /api/user/profile, GET /api/user/tenants
 */

const mockGetCurrentUser = jest.fn()
const mockGetUserTenants = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getUserTenants: (...args: any[]) => mockGetUserTenants(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import { GET as profileRoute } from "@/app/api/user/profile/route"
import { GET as tenantsRoute } from "@/app/api/user/tenants/route"
import { parseResponse, mockUser, mockTenant, TEST_IDS } from "../test-helpers"

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

describe("GET /api/user/profile", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return user profile data", async () => {
    const user = mockUser()
    mockGetCurrentUser.mockResolvedValueOnce(user)

    const res = await profileRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.id).toBe(TEST_IDS.USER)
    expect(body.email).toBe("test@example.com")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const res = await profileRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(401)
    expect(body.error).toContain("Unauthorized")
  })

  it("should return 500 on error", async () => {
    mockGetCurrentUser.mockRejectedValueOnce(new Error("DB error"))

    const res = await profileRoute()
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// User Tenants
// ---------------------------------------------------------------------------

describe("GET /api/user/tenants", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return user tenants", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockGetUserTenants.mockResolvedValueOnce([
      mockTenant(),
      mockTenant({ id: "another-tenant", name: "Another Org", slug: "another-org" }),
    ])

    const res = await tenantsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body).toHaveLength(2)
    expect(body[0].name).toBe("Test Org")
    expect(mockGetUserTenants).toHaveBeenCalledWith(TEST_IDS.USER)
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const res = await tenantsRoute()
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 500 on error", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockGetUserTenants.mockRejectedValueOnce(new Error("DB error"))

    const res = await tenantsRoute()
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})
