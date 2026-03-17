/**
 * @jest-environment node
 */
/**
 * Dashboard endpoint tests
 * Tests: GET /api/dashboard/stats
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import { GET as dashboardStatsRoute } from "@/app/api/dashboard/stats/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

describe("GET /api/dashboard/stats", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return dashboard stats with counts", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // tenants
      .mockResolvedValueOnce(mockQueryResult([{ count: "5" }])) // schemas count
      .mockResolvedValueOnce(mockQueryResult([
        { count: "10", status: "completed" },
        { count: "3", status: "pending" },
      ])) // jobs count
      .mockResolvedValueOnce(mockQueryResult([{ count: "7" }])) // exports count
      .mockResolvedValueOnce(mockQueryResult([
        { id: "job1", name: "Recent Job", status: "completed", created_at: "2025-10-26T12:00:00.000Z" },
      ])) // recent jobs

    const req = createNextRequest("GET", "http://localhost:3000/api/dashboard/stats")
    const res = await dashboardStatsRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.stats.schemas).toBe(5)
    expect(body.stats.jobs).toBe(13) // 10 + 3
    expect(body.stats.completedJobs).toBe(10)
    expect(body.stats.exports).toBe(7)
    expect(body.recentActivity).toHaveLength(1)
  })

  it("should return zeros when user has no tenants", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // no tenants

    const req = createNextRequest("GET", "http://localhost:3000/api/dashboard/stats")
    const res = await dashboardStatsRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.stats.schemas).toBe(0)
    expect(body.stats.jobs).toBe(0)
    expect(body.stats.exports).toBe(0)
    expect(body.recentActivity).toEqual([])
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("GET", "http://localhost:3000/api/dashboard/stats")
    const res = await dashboardStatsRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 500 on database error", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockRejectedValueOnce(new Error("DB error"))

    const req = createNextRequest("GET", "http://localhost:3000/api/dashboard/stats")
    const res = await dashboardStatsRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})
