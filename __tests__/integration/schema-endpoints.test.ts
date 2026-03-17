/**
 * @jest-environment node
 */
/**
 * Schema endpoint tests
 * Tests: POST /api/schemas/discover/create, PUT /api/schemas/[id]/update,
 *        POST /api/schemas/[id]/add-fields
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

jest.mock("@/lib/schema-induction", () => ({
  DiscoveredSchema: class {},
}))

import { POST as discoverCreateRoute } from "@/app/api/schemas/discover/create/route"
import { PUT as updateSchemaRoute } from "@/app/api/schemas/[id]/update/route"
import { POST as addFieldsRoute } from "@/app/api/schemas/[id]/add-fields/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

// ---------------------------------------------------------------------------
// Schemas Discover Create
// ---------------------------------------------------------------------------

describe("POST /api/schemas/discover/create", () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    name: "Test Schema",
    description: "A test schema",
    discoveredSchema: {
      fields: [
        { name: "full_name", type: "name", description: "Full name", required: true },
        { name: "email", type: "email", description: "Email", required: true },
      ],
    },
  }

  it("should create a schema from discovery", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // user tenants
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.SCHEMA,
        name: "Test Schema",
        description: "A test schema",
        schema_definition: {},
        created_at: "2025-10-26T12:00:00.000Z",
      }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/schemas/discover/create", {
      body: validBody,
    })

    const res = await discoverCreateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.schema.name).toBe("Test Schema")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/schemas/discover/create", {
      body: validBody,
    })

    const res = await discoverCreateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/schemas/discover/create", {
      body: { discoveredSchema: validBody.discoveredSchema },
    })

    const res = await discoverCreateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("name")
  })

  it("should return 400 when discoveredSchema is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", "http://localhost:3000/api/schemas/discover/create", {
      body: { name: "Test" },
    })

    const res = await discoverCreateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("discoveredSchema")
  })
})

// ---------------------------------------------------------------------------
// Schema Update
// ---------------------------------------------------------------------------

describe("PUT /api/schemas/[id]/update", () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    name: "Updated Schema",
    description: "Updated desc",
    schema_definition: {
      fields: [
        { name: "full_name", type: "name", description: "Full name", required: true },
      ],
    },
  }

  const routeParams = { params: { id: TEST_IDS.SCHEMA } }

  it("should update schema successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([{ id: TEST_IDS.SCHEMA, tenant_id: TEST_IDS.TENANT }])) // schema lookup
      .mockResolvedValueOnce(mockQueryResult([{ tenant_id: TEST_IDS.TENANT }])) // user tenants
      .mockResolvedValueOnce(mockQueryResult([{
        id: TEST_IDS.SCHEMA,
        name: "Updated Schema",
        description: "Updated desc",
        schema_definition: validBody.schema_definition,
        updated_at: "2025-10-26T13:00:00.000Z",
      }]))

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: validBody,
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.schema.name).toBe("Updated Schema")
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: validBody,
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: { schema_definition: validBody.schema_definition },
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 400 when schema_definition.fields is empty", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: { name: "Test", schema_definition: { fields: [] } },
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("At least one field")
  })

  it("should return 400 for duplicate field names", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: {
        name: "Test",
        schema_definition: {
          fields: [
            { name: "full_name", type: "name" },
            { name: "full_name", type: "text" },
          ],
        },
      },
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Duplicate field name")
  })

  it("should return 400 for invalid field name format", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: {
        name: "Test",
        schema_definition: {
          fields: [{ name: "invalid-name!", type: "text" }],
        },
      },
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Invalid field name")
  })

  it("should return 404 when schema not found", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // schema not found

    const req = createNextRequest("PUT", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/update`, {
      body: validBody,
    })

    const res = await updateSchemaRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Schema Add Fields
// ---------------------------------------------------------------------------

describe("POST /api/schemas/[id]/add-fields", () => {
  beforeEach(() => jest.clearAllMocks())

  const routeParams = { params: { id: TEST_IDS.SCHEMA } }

  it("should add new fields successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([{
        schema_definition: { fields: [{ name: "existing_field", type: "text" }] },
        tenant_id: TEST_IDS.TENANT,
      }])
    )
    mockHasTenantAccess.mockResolvedValueOnce(true)
    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // update result

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: {
        fields: [{ name: "new_field", type: "email", description: "New field" }],
      },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.addedCount).toBe(1)
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: { fields: [{ name: "test", type: "text" }] },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 400 when fields is not an array", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: { fields: "not an array" },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 404 when schema not found", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: { fields: [{ name: "test", type: "text" }] },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(404)
  })

  it("should return 403 when no tenant access", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([{
        schema_definition: { fields: [] },
        tenant_id: TEST_IDS.TENANT,
      }])
    )
    mockHasTenantAccess.mockResolvedValueOnce(false)

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: { fields: [{ name: "test", type: "text" }] },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status } = await parseResponse(res)

    expect(status).toBe(403)
  })

  it("should return addedCount 0 when all fields already exist", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([{
        schema_definition: { fields: [{ name: "existing_field", type: "text" }] },
        tenant_id: TEST_IDS.TENANT,
      }])
    )
    mockHasTenantAccess.mockResolvedValueOnce(true)

    const req = createNextRequest("POST", `http://localhost:3000/api/schemas/${TEST_IDS.SCHEMA}/add-fields`, {
      body: {
        fields: [{ name: "existing_field", type: "text" }],
      },
    })

    const res = await addFieldsRoute(req, routeParams as any)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.addedCount).toBe(0)
  })
})
