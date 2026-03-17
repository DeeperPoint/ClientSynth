/**
 * @jest-environment node
 */
/**
 * Image endpoint tests
 * Tests: POST /api/images/generate, POST /api/images/regenerate, GET /api/images/models
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

const mockGenerateAndUploadImage = jest.fn()

jest.mock("@/lib/image-generation/image-service", () => ({
  ImageGenerationService: jest.fn().mockImplementation(() => ({
    generateAndUploadImage: mockGenerateAndUploadImage,
  })),
}))

const mockImageGeneratorGenerate = jest.fn()

jest.mock("@/lib/image-generator", () => ({
  ImageGenerator: jest.fn().mockImplementation(() => ({
    generateAndUploadImage: mockImageGeneratorGenerate,
  })),
}))

const mockGetAvailableModels = jest.fn()

jest.mock("@/lib/openrouter-client", () => ({
  OpenRouterClient: jest.fn().mockImplementation(() => ({
    getAvailableModels: mockGetAvailableModels,
  })),
}))

import { POST as generateRoute } from "@/app/api/images/generate/route"
import { POST as regenerateRoute } from "@/app/api/images/regenerate/route"
import { GET as modelsRoute } from "@/app/api/images/models/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"

// ---------------------------------------------------------------------------
// Images Generate
// ---------------------------------------------------------------------------

describe("POST /api/images/generate", () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    tenantId: TEST_IDS.TENANT,
    jobId: TEST_IDS.JOB,
    recordId: "record-1",
    fieldName: "profile_photo",
    prompt: "professional headshot",
    model: "black-forest-labs/flux-1-schnell",
    recordData: { full_name: "John Smith" },
    fieldDescription: "Professional headshot photo",
    style: "professional",
  }

  it("should generate an image successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{ "?column?": 1 }])) // tenant access
    mockGenerateAndUploadImage.mockResolvedValueOnce({
      url: "https://s3.local/test.png",
      s3Key: "test/key.png",
      fileSize: 1024,
      md5Hash: "abc123",
    })

    const req = createNextRequest("POST", "http://localhost:3000/api/images/generate", {
      body: validBody,
    })

    const res = await generateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.result.url).toBe("https://s3.local/test.png")
  })

  it("should return 400 when required fields are missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/images/generate", {
      body: { tenantId: TEST_IDS.TENANT },
    })

    const res = await generateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/images/generate", {
      body: validBody,
    })

    const res = await generateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 403 when no tenant access", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // no access

    const req = createNextRequest("POST", "http://localhost:3000/api/images/generate", {
      body: validBody,
    })

    const res = await generateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(403)
  })

  it("should return 500 when image generation fails", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{ "?column?": 1 }]))
    mockGenerateAndUploadImage.mockRejectedValueOnce(new Error("Generation failed"))

    const req = createNextRequest("POST", "http://localhost:3000/api/images/generate", {
      body: validBody,
    })

    const res = await generateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.error).toContain("Image generation failed")
  })
})

// ---------------------------------------------------------------------------
// Images Regenerate
// ---------------------------------------------------------------------------

describe("POST /api/images/regenerate", () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    tenantId: TEST_IDS.TENANT,
    jobId: TEST_IDS.JOB,
    recordId: "record-1",
    prompt: "new headshot",
    model: "black-forest-labs/flux-1-schnell",
  }

  it("should regenerate an image successfully", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([{ "?column?": 1 }]))
    mockImageGeneratorGenerate.mockResolvedValueOnce({
      url: "https://s3.local/new.png",
      s3Key: "test/new.png",
      fileSize: 2048,
      md5Hash: "def456",
    })
    mockQuery.mockResolvedValueOnce(mockQueryResult([])) // media insert

    const req = createNextRequest("POST", "http://localhost:3000/api/images/regenerate", {
      body: validBody,
    })

    const res = await regenerateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.imageUrl).toBe("https://s3.local/new.png")
  })

  it("should return 400 when required fields are missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/images/regenerate", {
      body: { tenantId: TEST_IDS.TENANT },
    })

    const res = await regenerateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("POST", "http://localhost:3000/api/images/regenerate", {
      body: validBody,
    })

    const res = await regenerateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(401)
  })

  it("should return 403 when no tenant access", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser())
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/images/regenerate", {
      body: validBody,
    })

    const res = await regenerateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Image Models
// ---------------------------------------------------------------------------

describe("GET /api/images/models", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return available models", async () => {
    process.env.OPENROUTER_API_KEY = "test-api-key"
    mockGetAvailableModels.mockResolvedValueOnce([
      { id: "flux-1", name: "FLUX.1 Schnell" },
    ])

    const res = await modelsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.models).toHaveLength(1)
  })

  it("should return 500 when API key is not configured", async () => {
    const savedKey = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY

    const res = await modelsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.error).toContain("API key not configured")

    process.env.OPENROUTER_API_KEY = savedKey
  })

  it("should return 500 on API error", async () => {
    process.env.OPENROUTER_API_KEY = "test-api-key"
    mockGetAvailableModels.mockRejectedValueOnce(new Error("API error"))

    const res = await modelsRoute()
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})
