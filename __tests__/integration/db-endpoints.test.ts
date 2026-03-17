/**
 * @jest-environment node
 */
/**
 * Generic DB endpoint tests
 * Tests: POST /api/db (select, insert, update, delete)
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import { POST as dbRoute } from "@/app/api/db/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

describe("POST /api/db", () => {
  beforeEach(() => jest.clearAllMocks())

  // Helper to set up authenticated user with tenant
  function setupAuth() {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // user tenants
  }

  // ----- SELECT -----

  describe("SELECT action", () => {
    it("should execute basic select query", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          { id: "1", name: "Schema 1" },
          { id: "2", name: "Schema 2" },
        ])
      )

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "select", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data).toHaveLength(2)
    })

    it("should execute select with eq where clause", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "1", name: "Schema 1" }]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          where: { op: "eq", column: "id", value: "1" },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data).toHaveLength(1)
    })

    it("should execute select with in where clause", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          { id: "1", name: "Schema 1" },
          { id: "2", name: "Schema 2" },
        ])
      )

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          where: { op: "in", column: "id", values: ["1", "2"] },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
    })

    it("should execute select with ordering and limit", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "1" }]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          orderBy: { column: "created_at", ascending: false },
          limit: 5,
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      // Verify the query was called with SQL containing ORDER BY and LIMIT
      const sqlArg = mockQuery.mock.calls[1][0]
      expect(sqlArg).toContain("ORDER BY")
      expect(sqlArg).toContain("LIMIT 5")
    })

    it("should execute select with JOIN", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "1", tenant_name: "Org" }]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          columns: "id, name",
          join: {
            table: "tenants",
            on: "schemas.tenant_id = tenants.id",
            type: "LEFT",
          },
        },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(200)
      const sqlArg = mockQuery.mock.calls[1][0]
      expect(sqlArg).toContain("LEFT JOIN tenants")
    })

    it("should return single result when single=true", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "1", name: "Single" }]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          single: true,
          where: { op: "eq", column: "id", value: "1" },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data).toHaveProperty("id", "1")
      expect(Array.isArray(body.data)).toBe(false)
    })

    it("should add tenant filtering for tenant-scoped tables", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "select", table: "schemas" },
      })

      await dbRoute(req)

      const sqlArg = mockQuery.mock.calls[1][0]
      expect(sqlArg).toContain("tenant_id IN")
    })

    it("should NOT add tenant filtering for non-scoped tables", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "select", table: "profiles" },
      })

      await dbRoute(req)

      const sqlArg = mockQuery.mock.calls[1][0]
      expect(sqlArg).not.toContain("tenant_id IN")
    })
  })

  // ----- INSERT -----

  describe("INSERT action", () => {
    it("should insert data", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{ id: "new-id", name: "New Schema" }])
      )

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "insert",
          table: "schemas",
          data: { name: "New Schema", description: "Desc" },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data.name).toBe("New Schema")
    })

    it("should return 400 when insert data is missing", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "insert", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(400)
    })
  })

  // ----- UPDATE -----

  describe("UPDATE action", () => {
    it("should update data", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{ id: "1", name: "Updated" }])
      )

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "update",
          table: "schemas",
          data: { name: "Updated" },
          where: { op: "eq", column: "id", value: "1" },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data.name).toBe("Updated")
    })

    it("should return 404 when record not found", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "update",
          table: "schemas",
          data: { name: "Updated" },
          where: { op: "eq", column: "id", value: "nonexistent" },
        },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(404)
    })

    it("should return 400 when update data or where is missing", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "update", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(400)
    })
  })

  // ----- DELETE -----

  describe("DELETE action", () => {
    it("should delete data", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{ id: "1", name: "Deleted" }])
      )

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "delete",
          table: "schemas",
          where: { op: "eq", column: "id", value: "1" },
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
      expect(body.data).toBeDefined()
    })

    it("should return 400 when delete where is missing", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "delete", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(400)
    })
  })

  // ----- Common -----

  describe("Common validations", () => {
    it("should return 401 when unauthenticated", async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null)

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "select", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(401)
    })

    it("should return 400 for invalid table name", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "select", table: "invalid-table!" },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(400)
      expect(body.error).toContain("Invalid table")
    })

    it("should return 400 for unsupported action", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: { action: "drop", table: "schemas" },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(400)
      expect(body.error).toContain("Unsupported action")
    })

    it("should handle legacy filter format", async () => {
      setupAuth()
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "1" }]))

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          op: "select",
          table: "schemas",
          filters: [{ type: "eq", column: "id", value: "1" }],
        },
      })

      const res = await dbRoute(req)
      const { status, body } = await parseResponse(res)

      expect(status).toBe(200)
    })

    it("should return 400 for invalid join table", async () => {
      setupAuth()

      const req = createNextRequest("POST", "http://localhost:3000/api/db", {
        body: {
          action: "select",
          table: "schemas",
          join: { table: "invalid-table!", on: "schemas.id = bad.id" },
        },
      })

      const res = await dbRoute(req)
      const { status } = await parseResponse(res)

      expect(status).toBe(400)
    })
  })
})
