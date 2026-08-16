/**
 * @jest-environment node
 */
/**
 * GoogleFlashProvider tests.
 *
 * The previous version of this file could not run at all: under the jsdom
 * environment, `@google/genai` resolves to its ESM `dist/web` build, which Jest
 * cannot parse ("Unexpected token 'export'"), so the whole suite errored out.
 * The node environment resolves the CommonJS build instead — and is the right
 * environment for a server-side provider anyway.
 *
 * It also imported `GoogleFlashImageProvider` (the class is `GoogleFlashProvider`)
 * and asserted an API that does not exist — `result.imageData`, a `generateBatch`
 * method. The provider returns `{ buffer, contentType, metadata }`.
 *
 * The Google SDK is mocked so these run offline and cost nothing.
 */

const mockGenerateContent = jest.fn()

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}))

import { GoogleFlashProvider } from "@/lib/image-generation/providers/google-flash-provider"

const PNG_BYTES = Buffer.from("fake-png-bytes")

function responseWithImage(mimeType = "image/png") {
  return {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: PNG_BYTES.toString("base64"), mimeType } }],
        },
      },
    ],
  }
}

describe("GoogleFlashProvider", () => {
  let provider: GoogleFlashProvider

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_AI_API_KEY = "test-key"
    mockGenerateContent.mockResolvedValue(responseWithImage())
    provider = new GoogleFlashProvider()
  })

  describe("configuration", () => {
    it("refuses to construct without an API key", () => {
      delete process.env.GOOGLE_AI_API_KEY
      expect(() => new GoogleFlashProvider()).toThrow(/GOOGLE_AI_API_KEY/)
      process.env.GOOGLE_AI_API_KEY = "test-key"
    })

    it("reports its supported models", () => {
      expect(provider.getSupportedModels()).toContain("gemini-2.0-flash-exp")
    })

    it("validates config against the environment", () => {
      expect(provider.validateConfig()).toBe(true)
      delete process.env.GOOGLE_AI_API_KEY
      expect(provider.validateConfig()).toBe(false)
      process.env.GOOGLE_AI_API_KEY = "test-key"
    })
  })

  describe("generateImage", () => {
    it("decodes the returned image into a buffer", async () => {
      const result = await provider.generateImage({ prompt: "A professional headshot" })

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.equals(PNG_BYTES)).toBe(true)
      expect(result.contentType).toBe("image/png")
    })

    it("names the model in the request rather than fetching it first", async () => {
      await provider.generateImage({ prompt: "A headshot" })

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-2.0-flash-exp" }),
      )
    })

    it("asks for an image modality", async () => {
      await provider.generateImage({ prompt: "A headshot" })

      const request = mockGenerateContent.mock.calls[0][0]
      expect(request.config.responseModalities).toEqual(["Image"])
      expect(request.contents[0].parts[0].text).toBe("A headshot")
    })

    it("returns metadata describing the generation", async () => {
      const result = await provider.generateImage({ prompt: "A headshot", width: 256, height: 256 })

      expect(result.metadata).toMatchObject({
        model: "gemini-2.0-flash-exp",
        provider: "google-flash",
        prompt: "A headshot",
        dimensions: { width: 256, height: 256 },
      })
    })

    it("uses a lower temperature for hd quality", async () => {
      await provider.generateImage({ prompt: "A headshot", quality: "hd" })
      expect(mockGenerateContent.mock.calls[0][0].config.temperature).toBe(0.4)

      jest.clearAllMocks()
      mockGenerateContent.mockResolvedValue(responseWithImage())
      await provider.generateImage({ prompt: "A headshot", quality: "standard" })
      expect(mockGenerateContent.mock.calls[0][0].config.temperature).toBe(0.7)
    })

    it("honours the mime type the API reports", async () => {
      mockGenerateContent.mockResolvedValueOnce(responseWithImage("image/jpeg"))
      const result = await provider.generateImage({ prompt: "A headshot" })
      expect(result.contentType).toBe("image/jpeg")
    })

    it("fails clearly when the response carries no image", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "I cannot generate that" }] } }],
      })

      await expect(provider.generateImage({ prompt: "A headshot" })).rejects.toThrow(
        /No image data returned/,
      )
    })

    it("propagates an API failure", async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error("quota exceeded"))

      await expect(provider.generateImage({ prompt: "A headshot" })).rejects.toThrow("quota exceeded")
    })
  })
})
