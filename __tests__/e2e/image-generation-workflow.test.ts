import { createClient } from "@supabase/supabase-js"

describe("Image Generation Workflow E2E Tests", () => {
  let supabase: any
  let testTenantId: string
  let testJobId: string

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Create test tenant
    const { data: tenant } = await supabase.from("tenants").insert({ name: "Image Test Tenant" }).select().single()
    testTenantId = tenant.id

    // Create test job
    const { data: job } = await supabase
      .from("jobs")
      .insert({
        tenant_id: testTenantId,
        name: "Image Test Job",
        total_records: 10,
        status: "processing",
      })
      .select()
      .single()
    testJobId = job.id
  })

  afterAll(async () => {
    // Cleanup
    await supabase.from("media").delete().eq("tenant_id", testTenantId)
    await supabase.from("jobs").delete().eq("id", testJobId)
    await supabase.from("tenants").delete().eq("id", testTenantId)
  })

  describe("Google Flash Image Generation", () => {
    it("should generate professional headshots", async () => {
      const testRecords = [
        {
          id: "record-1",
          name: "John Smith",
          job_title: "Software Engineer",
          company: "Tech Corp",
        },
        {
          id: "record-2",
          name: "Jane Doe",
          job_title: "Product Manager",
          company: "Innovation Inc",
        },
        {
          id: "record-3",
          name: "Bob Johnson",
          job_title: "Data Scientist",
          company: "AI Solutions",
        },
      ]

      const results = []

      for (const record of testRecords) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/images/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId: testTenantId,
            jobId: testJobId,
            recordId: record.id,
            fieldName: "profile_image",
            prompt: `Professional headshot of ${record.name}, ${record.job_title} at ${record.company}`,
            recordData: record,
            fieldDescription: "Professional headshot photo",
            provider: "google-flash",
            model: "gemini-2.0-flash-exp",
          }),
        })

        expect(response.ok).toBe(true)
        const result = await response.json()
        expect(result.success).toBe(true)
        expect(result.result.url).toBeDefined()
        expect(result.result.s3Key).toBeDefined()

        results.push(result.result)

        console.log(`[E2E] Generated image for ${record.name}: ${result.result.url}`)

        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      // Verify all images were uploaded to S3
      results.forEach((result) => {
        expect(result.url).toContain("amazonaws.com")
        expect(result.s3Key).toMatch(new RegExp(`^${testTenantId}/${testJobId}/`))
      })

      // Verify media records in database
      const { data: mediaRecords } = await supabase.from("media").select("*").eq("job_id", testJobId)

      expect(mediaRecords.length).toBe(3)
      mediaRecords.forEach((media: any) => {
        expect(media.model_used).toBe("gemini-2.0-flash-exp")
        expect(media.content_type).toBe("image/png")
        expect(media.s3_url).toBeDefined()
      })
    }, 120000)

    it("should handle batch image generation", async () => {
      const batchSize = 5
      const records = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-record-${i}`,
        name: `Person ${i}`,
        job_title: "Engineer",
        company: "Tech Co",
      }))

      const startTime = Date.now()

      for (const record of records) {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/images/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId: testTenantId,
            jobId: testJobId,
            recordId: record.id,
            fieldName: "profile_image",
            prompt: `Professional headshot of ${record.name}`,
            recordData: record,
            provider: "google-flash",
            model: "gemini-2.0-flash-exp",
          }),
        })

        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      console.log(`[E2E] Generated ${batchSize} images in ${duration}s`)

      // Verify rate limiting was respected (should take at least 6 seconds for 5 images)
      expect(duration).toBeGreaterThanOrEqual(6)
    }, 180000)
  })

  describe("Image Quality and Metadata", () => {
    it("should generate images with proper metadata", async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/images/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: testTenantId,
          jobId: testJobId,
          recordId: "metadata-test",
          fieldName: "profile_image",
          prompt: "Professional headshot",
          recordData: {
            name: "Test Person",
            job_title: "Test Engineer",
          },
          fieldDescription: "Professional headshot photo",
          provider: "google-flash",
          model: "gemini-2.0-flash-exp",
        }),
      })

      const { result } = await response.json()

      // Verify metadata
      expect(result.metadata).toBeDefined()
      expect(result.metadata.provider).toBe("google-flash")
      expect(result.metadata.model).toBe("gemini-2.0-flash-exp")
      expect(result.metadata.prompt).toBeDefined()

      // Verify database record
      const { data: mediaRecord } = await supabase.from("media").select("*").eq("record_id", "metadata-test").single()

      expect(mediaRecord.generation_metadata).toBeDefined()
      expect(mediaRecord.prompt_used).toBeDefined()
      expect(mediaRecord.model_used).toBe("gemini-2.0-flash-exp")
    }, 60000)
  })
})
