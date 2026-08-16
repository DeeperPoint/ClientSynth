/**
 * @jest-environment node
 */
/**
 * BatchImageGenerator integration tests.
 *
 * These used to drive the live OpenRouter API and real S3, so they failed
 * offline and cost tokens per run. They also asserted `result.metadata.provider`
 * on the value returned by `generateForRecords`, which yields only
 * `{ success, url, s3Key, error }` — the assertion could never hold.
 *
 * The image service is mocked here so the batching behaviour this class is
 * actually responsible for — batch windows, progress events, and the
 * continue-versus-abort choice on failure — is what gets tested.
 */

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key"

const mockGenerateAndUploadImage = jest.fn()

jest.mock("@/lib/image-generation/image-service", () => ({
  ImageGenerationService: jest.fn().mockImplementation(() => ({
    generateAndUploadImage: mockGenerateAndUploadImage,
  })),
}))

jest.mock("@/lib/postgres/client", () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}))

import { BatchImageGenerator } from "@/lib/batch-image-generator"

function successfulUpload(recordId: string) {
  return {
    url: `https://test-bucket.s3.amazonaws.com/test-tenant/test-job/${recordId}.png`,
    s3Key: `test-tenant/test-job/${recordId}.png`,
    fileSize: 1024,
    md5Hash: "abc123",
    metadata: { model: "google/gemini-2.5-flash-image" },
  }
}

describe("BatchImageGenerator", () => {
  let generator: BatchImageGenerator

  beforeEach(() => {
    jest.clearAllMocks()
    mockGenerateAndUploadImage.mockImplementation(async ({ recordId }: any) => successfulUpload(recordId))
    generator = new BatchImageGenerator()
  })

  const baseArgs = {
    tenantId: "test-tenant",
    jobId: "test-job",
    fieldName: "profile_image",
    fieldDescription: "Professional headshot photo",
  }

  describe("generateForRecords", () => {
    it("returns one result per record", async () => {
      const records = [
        { id: "test-1", name: "John Smith", job_title: "Software Engineer" },
        { id: "test-2", name: "Jane Doe", job_title: "Product Manager" },
      ]

      const results = await generator.generateForRecords({ ...baseArgs, records })

      expect(results).toHaveLength(2)
      for (const result of results) {
        expect(result.success).toBe(true)
        expect(result.url).toContain("amazonaws.com")
        expect(result.s3Key).toBeDefined()
      }
    })

    it("passes each record's id through to the image service", async () => {
      const records = [{ id: "test-upload", name: "Test Person" }]

      const results = await generator.generateForRecords({ ...baseArgs, records })

      expect(mockGenerateAndUploadImage).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "test-tenant",
          jobId: "test-job",
          recordId: "test-upload",
          fieldName: "profile_image",
        }),
      )
      expect(results[0].s3Key).toBe("test-tenant/test-job/test-upload.png")
    })

    it("processes every record in a batch larger than the batch size", async () => {
      const records = Array.from({ length: 10 }, (_, i) => ({ id: `test-${i}`, name: `Person ${i}` }))

      const results = await generator.generateForRecords({ ...baseArgs, records, batchSize: 5 })

      expect(results).toHaveLength(10)
      expect(results.every(r => r.success)).toBe(true)
      expect(mockGenerateAndUploadImage).toHaveBeenCalledTimes(10)
    })

    it("keeps going past a failure when continueOnError is set", async () => {
      mockGenerateAndUploadImage.mockImplementation(async ({ recordId }: any) => {
        if (recordId === "test-2") throw new Error("Provider rejected the prompt")
        return successfulUpload(recordId)
      })

      const records = [{ id: "test-1" }, { id: "test-2" }, { id: "test-3" }]

      const results = await generator.generateForRecords({ ...baseArgs, records, continueOnError: true })

      expect(results).toHaveLength(3)
      expect(results.filter(r => r.success)).toHaveLength(2)
      const failed = results.filter(r => !r.success)
      expect(failed).toHaveLength(1)
      expect(failed[0].error).toBe("Provider rejected the prompt")
    })

    it("aborts on the first failure when continueOnError is not set", async () => {
      mockGenerateAndUploadImage.mockImplementation(async ({ recordId }: any) => {
        if (recordId === "test-2") throw new Error("Provider unavailable")
        return successfulUpload(recordId)
      })

      const records = [{ id: "test-1" }, { id: "test-2" }, { id: "test-3" }]

      await expect(generator.generateForRecords({ ...baseArgs, records })).rejects.toThrow(
        "Provider unavailable",
      )
    })
  })

  describe("progress events", () => {
    it("reports progress up to the full record count", async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({ id: `test-${i}`, name: `Person ${i}` }))
      const progressEvents: Array<{ total: number; completed: number }> = []

      generator.on("progress", event => progressEvents.push(event))

      await generator.generateForRecords({ ...baseArgs, records })

      expect(progressEvents).toHaveLength(5)
      expect(progressEvents[progressEvents.length - 1]).toEqual({ total: 5, completed: 5 })
      expect(progressEvents.every(e => e.total === 5)).toBe(true)
    })

    it("counts failed records as completed progress", async () => {
      mockGenerateAndUploadImage.mockRejectedValue(new Error("all fail"))
      const progressEvents: Array<{ total: number; completed: number }> = []
      generator.on("progress", event => progressEvents.push(event))

      await generator.generateForRecords({
        ...baseArgs,
        records: [{ id: "a" }, { id: "b" }],
        continueOnError: true,
      })

      expect(progressEvents[progressEvents.length - 1].completed).toBe(2)
    })
  })
})
