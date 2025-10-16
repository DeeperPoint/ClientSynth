import { GoogleFlashImageProvider } from "@/lib/image-generation/providers/google-flash-provider"

describe("GoogleFlashImageProvider Integration Tests", () => {
  let provider: GoogleFlashImageProvider

  beforeEach(() => {
    provider = new GoogleFlashImageProvider()
  })

  describe("Image Generation", () => {
    it("should generate a single image with default settings", async () => {
      const result = await provider.generateImage({
        prompt: "A professional headshot of a software engineer",
        model: "gemini-2.0-flash-exp",
      })

      expect(result).toBeDefined()
      expect(result.imageData).toBeDefined()
      expect(result.imageData.length).toBeGreaterThan(0)
      expect(result.metadata).toBeDefined()
      expect(result.metadata.model).toBe("gemini-2.0-flash-exp")
      expect(result.metadata.provider).toBe("google-flash")
    }, 30000)

    it("should generate multiple images in a batch", async () => {
      const results = await provider.generateBatch({
        prompts: [
          "A professional headshot of a marketing manager",
          "A professional headshot of a data scientist",
          "A professional headshot of a product designer",
        ],
        model: "gemini-2.0-flash-exp",
      })

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.imageData).toBeDefined()
        expect(result.imageData.length).toBeGreaterThan(0)
        expect(result.metadata.provider).toBe("google-flash")
      })
    }, 60000)

    it("should handle complex prompts with context", async () => {
      const result = await provider.generateImage({
        prompt:
          "Professional headshot photo of person named Sarah Johnson working as Marketing Director in Technology industry at Innovative Solutions. Professional, high-quality, realistic photo.",
        model: "gemini-2.0-flash-exp",
      })

      expect(result).toBeDefined()
      expect(result.imageData).toBeDefined()
      expect(result.metadata.prompt).toContain("Sarah Johnson")
    }, 30000)

    it("should respect rate limiting", async () => {
      const startTime = Date.now()

      // Generate 3 images rapidly
      await provider.generateImage({ prompt: "Test image 1", model: "gemini-2.0-flash-exp" })
      await provider.generateImage({ prompt: "Test image 2", model: "gemini-2.0-flash-exp" })
      await provider.generateImage({ prompt: "Test image 3", model: "gemini-2.0-flash-exp" })

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should take at least 2 seconds due to rate limiting (1 req/sec)
      expect(duration).toBeGreaterThanOrEqual(2000)
    }, 60000)

    it("should handle errors gracefully", async () => {
      await expect(
        provider.generateImage({
          prompt: "", // Empty prompt should fail
          model: "gemini-2.0-flash-exp",
        }),
      ).rejects.toThrow()
    }, 30000)
  })

  describe("Batch Processing", () => {
    it("should process batches with rate limiting", async () => {
      const prompts = Array.from({ length: 5 }, (_, i) => `Test image ${i + 1}`)

      const startTime = Date.now()
      const results = await provider.generateBatch({
        prompts,
        model: "gemini-2.0-flash-exp",
      })
      const endTime = Date.now()

      expect(results).toHaveLength(5)
      expect(endTime - startTime).toBeGreaterThanOrEqual(4000) // At least 4 seconds for 5 images
    }, 90000)

    it("should handle partial batch failures", async () => {
      const prompts = [
        "Valid prompt 1",
        "", // Invalid prompt
        "Valid prompt 2",
      ]

      const results = await provider.generateBatch({
        prompts,
        model: "gemini-2.0-flash-exp",
        continueOnError: true,
      })

      // Should have results for valid prompts
      expect(results.filter((r) => r.imageData).length).toBeGreaterThan(0)
    }, 60000)
  })

  describe("Model Support", () => {
    it("should work with gemini-2.0-flash-exp model", async () => {
      const result = await provider.generateImage({
        prompt: "Test image",
        model: "gemini-2.0-flash-exp",
      })

      expect(result.metadata.model).toBe("gemini-2.0-flash-exp")
    }, 30000)

    it("should work with imagen-3.0-generate-001 model", async () => {
      const result = await provider.generateImage({
        prompt: "Test image",
        model: "imagen-3.0-generate-001",
      })

      expect(result.metadata.model).toBe("imagen-3.0-generate-001")
    }, 30000)
  })
})
