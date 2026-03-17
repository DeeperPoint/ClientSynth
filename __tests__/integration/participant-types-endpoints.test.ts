/**
 * @jest-environment node
 */
/**
 * Participant-types endpoint tests
 * Tests: GET /api/participant-types
 */

const mockQuery = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import { GET as participantTypesRoute } from "@/app/api/participant-types/route"
import { createNextRequest, parseResponse, mockQueryResult } from "../test-helpers"

describe("GET /api/participant-types", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return participant types", async () => {
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([
        { id: "1", name: "individual", display_name: "Individual", description: "A single person", icon_name: "user" },
        { id: "2", name: "organization", display_name: "Organization", description: "A company or org", icon_name: "building" },
      ])
    )

    const req = createNextRequest("GET", "http://localhost:3000/api/participant-types")
    const res = await participantTypesRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.participantTypes).toHaveLength(2)
    expect(body.participantTypes[0].name).toBe("individual")
  })

  it("should return empty array when no types exist", async () => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("GET", "http://localhost:3000/api/participant-types")
    const res = await participantTypesRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.participantTypes).toHaveLength(0)
  })

  it("should return 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB error"))

    const req = createNextRequest("GET", "http://localhost:3000/api/participant-types")
    const res = await participantTypesRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.success).toBe(false)
  })
})
