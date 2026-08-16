/**
 * @jest-environment node
 */
/**
 * ImageGenerationService integration tests.
 *
 * These previously called the live OpenRouter API and the real S3 bucket, so
 * they failed offline (ECONNRESET, 60s timeouts) and cost tokens on every run.
 * They also asserted a `google-flash` provider contract — `request.provider`,
 * `result.provider`, `result.model` — that the service does not have: it uses
 * OpenRouter, and `ImageGenerationResult` exposes url / s3Key / fileSize /
 * md5Hash / metadata.
 *
 * They now mock the provider and the uploader and assert the contract the
 * service actually implements.
 */

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key"

const mockGenerateImage = jest.fn()
const mockUploadImage = jest.fn()
const mockEnhancePrompt = jest.fn()

jest.mock("@/lib/image-generation/providers/openrouter-provider", () => ({
  OpenRouterImageProvider: jest.fn().mockImplementation(() => ({
    generateImage: mockGenerateImage,
  })),
}))

jest.mock("@/lib/s3-uploader", () => ({
  S3Uploader: jest.fn().mockImplementation(() => ({
    uploadImage: mockUploadImage,
  })),
}))

jest.mock("@/lib/image-generation/prompt-enhancer", () => ({
  PromptEnhancer: jest.fn().mockImplementation(() => ({
    enhancePrompt: mockEnhancePrompt,
  })),
}))

import { ImageGenerationService } from "@/lib/image-generation/image-service"

const IMAGE_BUFFER = Buffer.from("fake-png-bytes")

describe("ImageGenerationService", () => {
  let service: ImageGenerationService

  beforeEach(() => {
    jest.clearAllMocks()

    mockEnhancePrompt.mockImplementation(async ({ basePrompt, style }: any) =>
      `${basePrompt} [${style ?? "professional"}]`,
    )
    mockGenerateImage.mockResolvedValue({
      buffer: IMAGE_BUFFER,
      contentType: "image/png",
      metadata: { model: "google/gemini-2.5-flash-image" },
    })
    mockUploadImage.mockResolvedValue({
      key: "synthetic-data/test-tenant/2026-01-01/test-job/test-record/profile_image-abc123.png",
      publicUrl:
        "https://test-bucket.s3.amazonaws.com/synthetic-data/test-tenant/2026-01-01/test-job/test-record/profile_image-abc123.png",
      md5Hash: "abc123",
    })

    service = new ImageGenerationService()
  })

  const baseRequest = {
    tenantId: "test-tenant",
    jobId: "test-job",
    recordId: "test-record",
    fieldName: "profile_image",
    prompt: "Professional headshot of a software engineer",
    recordData: { name: "John Smith", job_title: "Software Engineer" },
    fieldDescription: "Professional headshot photo",
  }

  describe("generateAndUploadImage", () => {
    it("returns the uploaded location and size", async () => {
      const result = await service.generateAndUploadImage(baseRequest)

      expect(result.url).toContain("amazonaws.com")
      expect(result.s3Key).toContain("test-job")
      expect(result.fileSize).toBe(IMAGE_BUFFER.length)
      expect(result.md5Hash).toBe("abc123")
    })

    it("uploads the exact buffer the provider produced", async () => {
      await service.generateAndUploadImage(baseRequest)

      const [buffer, options] = mockUploadImage.mock.calls[0]
      expect(buffer).toBe(IMAGE_BUFFER)
      expect(options).toMatchObject({
        tenantId: "test-tenant",
        jobId: "test-job",
        recordId: "test-record",
        fieldName: "profile_image",
        contentType: "image/png",
      })
    })

    it("generates from the enhanced prompt, not the raw one", async () => {
      await service.generateAndUploadImage(baseRequest)

      expect(mockEnhancePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ basePrompt: baseRequest.prompt, style: "professional" }),
      )
      expect(mockGenerateImage.mock.calls[0][0].prompt).toBe(
        `${baseRequest.prompt} [professional]`,
      )
    })

    it("carries both prompts and the provider metadata into the result", async () => {
      const result = await service.generateAndUploadImage(baseRequest)

      expect(result.metadata).toMatchObject({
        model: "google/gemini-2.5-flash-image",
        originalPrompt: baseRequest.prompt,
        enhancedPrompt: `${baseRequest.prompt} [professional]`,
      })
    })

    it("passes the requested style through to prompt enhancement", async () => {
      for (const style of ["professional", "casual", "artistic"] as const) {
        jest.clearAllMocks()
        mockEnhancePrompt.mockImplementation(async ({ basePrompt, style: s }: any) => `${basePrompt} [${s}]`)
        mockGenerateImage.mockResolvedValue({
          buffer: IMAGE_BUFFER,
          contentType: "image/png",
          metadata: {},
        })
        mockUploadImage.mockResolvedValue({ key: "k", publicUrl: "https://x.s3.amazonaws.com/k", md5Hash: "m" })

        await service.generateAndUploadImage({ ...baseRequest, style })

        expect(mockEnhancePrompt).toHaveBeenCalledWith(expect.objectContaining({ style }))
      }
    })

    it("defaults to a single image", async () => {
      await service.generateAndUploadImage(baseRequest)
      expect(mockGenerateImage.mock.calls[0][0].count).toBe(1)
    })
  })

  describe("error handling", () => {
    it("propagates a provider failure rather than uploading nothing", async () => {
      mockGenerateImage.mockRejectedValueOnce(new Error("Provider unavailable"))

      await expect(service.generateAndUploadImage(baseRequest)).rejects.toThrow("Provider unavailable")
      expect(mockUploadImage).not.toHaveBeenCalled()
    })

    it("propagates an upload failure", async () => {
      mockUploadImage.mockRejectedValueOnce(new Error("S3 unavailable"))

      await expect(service.generateAndUploadImage(baseRequest)).rejects.toThrow("S3 unavailable")
    })
  })

  describe("configuration", () => {
    it("refuses to construct without an API key", () => {
      const original = process.env.OPENROUTER_API_KEY
      delete process.env.OPENROUTER_API_KEY

      expect(() => new ImageGenerationService()).toThrow(/OPENROUTER_API_KEY/)

      process.env.OPENROUTER_API_KEY = original
    })
  })
})
