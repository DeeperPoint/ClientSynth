import { BatchImageGenerator } from "@/lib/batch-image-generator"

describe("BatchImageGenerator Integration Tests", () => {
  let generator: BatchImageGenerator

  beforeEach(() => {
    generator = new BatchImageGenerator()
  })

  describe("Batch Generation", () => {
    it("should generate images for multiple records", async () => {
      const records = [
        {
          id: "test-1",
          name: "John Smith",
          job_title: "Software Engineer",
          company: "Tech Corp",
        },
        {
          id: "test-2",
          name: "Jane Doe",
          job_title: "Product Manager",
          company: "Innovation Inc",
        },
      ]

      const results = await generator.generateForRecords({
        tenantId: "test-tenant",
        jobId: "test-job",
        records,
        fieldName: "profile_image",
        fieldDescription: "Professional headshot photo",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
      })

      expect(results).toHaveLength(2)
      results.forEach((result) => {
        expect(result.success).toBe(true)
        expect(result.url).toBeDefined()
        expect(result.s3Key).toBeDefined()
      })
    }, 90000)

    it("should handle large batches efficiently", async () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        id: `test-${i}`,
        name: `Person ${i}`,
        job_title: "Engineer",
      }))

      const startTime = Date.now()
      const results = await generator.generateForRecords({
        tenantId: "test-tenant",
        jobId: "test-job",
        records,
        fieldName: "profile_image",
        fieldDescription: "Professional headshot",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
        batchSize: 5,
      })
      const endTime = Date.now()

      expect(results).toHaveLength(10)
      expect(results.filter((r) => r.success).length).toBeGreaterThan(0)

      // Should process in batches
      console.log(`Processed 10 images in ${(endTime - startTime) / 1000}s`)
    }, 180000)

    it("should continue on individual failures", async () => {
      const records = [
        { id: "test-1", name: "Valid Person" },
        { id: "test-2", name: "" }, // Invalid data
        { id: "test-3", name: "Another Valid Person" },
      ]

      const results = await generator.generateForRecords({
        tenantId: "test-tenant",
        jobId: "test-job",
        records,
        fieldName: "profile_image",
        fieldDescription: "Professional headshot",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
        continueOnError: true,
      })

      expect(results).toHaveLength(3)
      expect(results.filter((r) => r.success).length).toBeGreaterThan(0)
      expect(results.filter((r) => !r.success).length).toBeGreaterThan(0)
    }, 90000)
  })

  describe("Progress Tracking", () => {
    it("should emit progress events", async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        name: `Person ${i}`,
      }))

      const progressEvents: any[] = []

      generator.on("progress", (event) => {
        progressEvents.push(event)
      })

      await generator.generateForRecords({
        tenantId: "test-tenant",
        jobId: "test-job",
        records,
        fieldName: "profile_image",
        fieldDescription: "Professional headshot",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
      })

      expect(progressEvents.length).toBeGreaterThan(0)
      expect(progressEvents[progressEvents.length - 1].completed).toBe(5)
    }, 120000)
  })

  describe("S3 Upload Integration", () => {
    it("should upload images to S3 with correct metadata", async () => {
      const records = [
        {
          id: "test-upload",
          name: "Test Person",
          job_title: "Test Engineer",
        },
      ]

      const results = await generator.generateForRecords({
        tenantId: "test-tenant",
        jobId: "test-job",
        records,
        fieldName: "profile_image",
        fieldDescription: "Professional headshot",
        provider: "google-flash",
        model: "gemini-2.0-flash-exp",
      })

      expect(results[0].success).toBe(true)
      expect(results[0].s3Key).toMatch(/^test-tenant\/test-job\//)
      expect(results[0].url).toContain("amazonaws.com")
      expect(results[0].metadata).toBeDefined()
      expect(results[0].metadata?.provider).toBe("google-flash")
    }, 60000)
  })
})
