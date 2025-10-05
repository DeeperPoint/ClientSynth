import { ImageGenerationService } from "@/lib/image-generation/image-service"
import { createClient } from "@supabase/supabase-js"

describe("ImageGenerationService Integration Tests", () => {
  let service: ImageGenerationService
  let supabase: any

  beforeAll(() => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  })

  beforeEach(() => {
    service = new ImageGenerationService()
  })

  describe("Image Generation and Upload", () => {
    it("should generate and upload image with Google Flash", async () => {
      const result = await service.generateAndUploadImage({
        tenantId: "test-tenant",
        jobId: "test-job",
        recordId: "test-record",
        fieldName: "profile_image",
        prompt: "Professional headshot of a software engineer",
        recordData: {
          name: "John Smith",
          job_title: "Software Engineer",
        },
        fieldDescription: "Professional headshot photo",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
      })

      expect(result).toBeDefined()
      expect(result.url).toBeDefined()
      expect(result.url).toContain("amazonaws.com")
      expect(result.s3Key).toMatch(/^test-tenant\/test-job\//)
      expect(result.provider).toBe("google-flash")
      expect(result.model).toBe("gemini-2.0-flash-exp")
    }, 60000)

    it("should handle different image styles", async () => {
      const styles = ["professional", "casual", "artistic"]

      for (const style of styles) {
        const result = await service.generateAndUploadImage({
          tenantId: "test-tenant",
          jobId: "test-job",
          recordId: `test-record-${style}`,
          fieldName: "profile_image",
          prompt: `${style} photo`,
          recordData: { name: "Test Person" },
          provider: "google-flash",
          model: "gemini-2.0-flash-exp",
          style,
        })

        expect(result.url).toBeDefined()
      }
    }, 180000)

    it("should include metadata in uploaded images", async () => {
      const result = await service.generateAndUploadImage({
        tenantId: "test-tenant",
        jobId: "test-job",
        recordId: "test-record",
        fieldName: "profile_image",
        prompt: "Test image",
        recordData: { name: "Test" },
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
      })

      expect(result.metadata).toBeDefined()
      expect(result.metadata.provider).toBe("google-flash")
      expect(result.metadata.model).toBe("gemini-2.0-flash-exp")
      expect(result.metadata.prompt).toBeDefined()
    }, 60000)
  })

  describe("Provider Selection", () => {
    it("should use Google Flash by default", async () => {
      const result = await service.generateAndUploadImage({
        tenantId: "test-tenant",
        jobId: "test-job",
        recordId: "test-record",
        fieldName: "profile_image",
        prompt: "Test image",
        recordData: {},
      })

      expect(result.provider).toBe("google-flash")
    }, 60000)

    it("should respect provider parameter", async () => {
      const result = await service.generateAndUploadImage({
        tenantId: "test-tenant",
        jobId: "test-job",
        recordId: "test-record",
        fieldName: "profile_image",
        prompt: "Test image",
        recordData: {},
        provider: "google-flash",
      })

      expect(result.provider).toBe("google-flash")
    }, 60000)
  })

  describe("Error Handling", () => {
    it("should handle invalid prompts gracefully", async () => {
      await expect(
        service.generateAndUploadImage({
          tenantId: "test-tenant",
          jobId: "test-job",
          recordId: "test-record",
          fieldName: "profile_image",
          prompt: "",
          recordData: {},
          provider: "google-flash",
        }),
      ).rejects.toThrow()
    }, 30000)

    it("should handle S3 upload failures", async () => {
      // Test with invalid AWS credentials would go here
      // This is a placeholder for the test structure
    })
  })
})
