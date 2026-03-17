/**
 * @jest-environment node
 */
/**
 * Models endpoint tests
 * Tests: GET /api/models/available
 */

// Save original fetch
const originalFetch = global.fetch

import { GET as availableModelsRoute } from "@/app/api/models/available/route"
import { parseResponse } from "../test-helpers"

describe("GET /api/models/available", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("should fetch and filter models from OpenRouter", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast", pricing: { prompt: 0.075, completion: 0.3 }, context_length: 1000000 },
            { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", description: "Smart", pricing: { prompt: 3, completion: 15 }, context_length: 200000 },
            { id: "openai/gpt-4o", name: "GPT-4o", description: "Latest", pricing: { prompt: 2.5, completion: 10 }, context_length: 128000 },
            { id: "some-other/model", name: "Other", description: "N/A", pricing: {}, context_length: 4096 },
          ],
        }),
    }) as any

    const res = await availableModelsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    // "some-other/model" shouldn't pass filter (not gemini, claude, gpt-4, or llama)
    expect(body.length).toBe(3)
    expect(body[0].id).toContain("gemini")
  })

  it("should return default models on API failure", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("Network error")) as any

    const res = await availableModelsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    // Default models include gemini
    expect(body.some((m: any) => m.id.includes("gemini"))).toBe(true)
  })

  it("should return default models on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    }) as any

    const res = await availableModelsRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })
})
