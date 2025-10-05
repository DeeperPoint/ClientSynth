import { JobProcessor } from "@/lib/job-processor"
import { createClient } from "@supabase/supabase-js"

describe("JobProcessor Integration Tests", () => {
  let processor: JobProcessor
  let supabase: any
  let testTenantId: string
  let testSchemaId: string

  beforeAll(async () => {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Create test tenant
    const { data: tenant } = await supabase.from("tenants").insert({ name: "Test Tenant" }).select().single()
    testTenantId = tenant.id

    // Create test schema
    const { data: schema } = await supabase
      .from("schemas")
      .insert({
        tenant_id: testTenantId,
        name: "Test Schema",
        schema_definition: {
          fields: [
            { name: "name", type: "name", description: "Full name" },
            { name: "email", type: "email", description: "Email address" },
            { name: "job_title", type: "job_title", description: "Job title" },
            { name: "profile_image", type: "image", description: "Professional headshot" },
          ],
        },
      })
      .select()
      .single()
    testSchemaId = schema.id
  })

  afterAll(async () => {
    // Cleanup test data
    await supabase.from("generated_data").delete().eq("tenant_id", testTenantId)
    await supabase.from("jobs").delete().eq("tenant_id", testTenantId)
    await supabase.from("schemas").delete().eq("id", testSchemaId)
    await supabase.from("tenants").delete().eq("id", testTenantId)
  })

  beforeEach(() => {
    processor = new JobProcessor()
  })

  describe("Job Processing", () => {
    it("should process a complete job end-to-end", async () => {
      // Create job
      const { data: job } = await supabase
        .from("jobs")
        .insert({
          tenant_id: testTenantId,
          schema_id: testSchemaId,
          name: "Test Job",
          total_records: 3,
          config: {
            text_model: "google/gemini-2.5-flash",
            image_model: "gemini-2.0-flash-exp",
            enable_images: true,
          },
          status: "pending",
        })
        .select()
        .single()

      // Process job
      const success = await processor.processNextJob()

      expect(success).toBe(true)

      // Verify job completion
      const { data: completedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(completedJob.status).toBe("completed")
      expect(completedJob.generated_records).toBe(3)
      expect(completedJob.progress).toBe(100)

      // Verify generated data
      const { data: generatedData } = await supabase.from("generated_data").select("*").eq("job_id", job.id)

      expect(generatedData).toHaveLength(3)
      generatedData.forEach((record: any) => {
        expect(record.record_data.name).toBeDefined()
        expect(record.record_data.email).toBeDefined()
        expect(record.record_data.job_title).toBeDefined()
        expect(record.record_data.profile_image).toBeDefined()
      })
    }, 180000)

    it("should handle job with only text fields", async () => {
      // Create schema without images
      const { data: textSchema } = await supabase
        .from("schemas")
        .insert({
          tenant_id: testTenantId,
          name: "Text Only Schema",
          schema_definition: {
            fields: [
              { name: "name", type: "name" },
              { name: "email", type: "email" },
              { name: "company", type: "company" },
            ],
          },
        })
        .select()
        .single()

      const { data: job } = await supabase
        .from("jobs")
        .insert({
          tenant_id: testTenantId,
          schema_id: textSchema.id,
          name: "Text Only Job",
          total_records: 5,
          config: { enable_images: false },
          status: "pending",
        })
        .select()
        .single()

      const success = await processor.processNextJob()

      expect(success).toBe(true)

      const { data: completedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(completedJob.status).toBe("completed")
      expect(completedJob.generated_records).toBe(5)
    }, 120000)

    it("should handle job pause and resume", async () => {
      const { data: job } = await supabase
        .from("jobs")
        .insert({
          tenant_id: testTenantId,
          schema_id: testSchemaId,
          name: "Pausable Job",
          total_records: 10,
          config: { enable_images: false },
          status: "pending",
        })
        .select()
        .single()

      // Start processing
      const processPromise = processor.processNextJob()

      // Pause after 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await supabase.rpc("send_job_control_signal", {
        p_job_id: job.id,
        p_action: "pause",
        p_metadata: {},
      })

      await processPromise

      // Check job was paused
      const { data: pausedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(pausedJob.status).toBe("paused")
      expect(pausedJob.generated_records).toBeLessThan(10)

      // Resume job
      await supabase.from("jobs").update({ status: "pending" }).eq("id", job.id)

      await processor.processNextJob()

      // Check job completed
      const { data: completedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(completedJob.status).toBe("completed")
      expect(completedJob.generated_records).toBe(10)
    }, 180000)
  })

  describe("Error Handling", () => {
    it("should handle and retry failed records", async () => {
      const { data: job } = await supabase
        .from("jobs")
        .insert({
          tenant_id: testTenantId,
          schema_id: testSchemaId,
          name: "Retry Test Job",
          total_records: 5,
          config: {
            enable_images: true,
            image_model: "gemini-2.0-flash-exp",
          },
          status: "pending",
        })
        .select()
        .single()

      await processor.processNextJob()

      // Check for any failed records in recovery state
      const { data: completedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      if (completedJob.recovery_state?.failedRecords?.length > 0) {
        // Retry failed records
        await supabase.rpc("send_job_control_signal", {
          p_job_id: job.id,
          p_action: "retry",
          p_metadata: {},
        })

        await processor.processNextJob()

        // Verify retries were attempted
        const { data: retriedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

        expect(retriedJob.recovery_state.retryAttempts).toBeDefined()
      }
    }, 180000)
  })

  describe("Logging", () => {
    it("should create job logs during processing", async () => {
      const { data: job } = await supabase
        .from("jobs")
        .insert({
          tenant_id: testTenantId,
          schema_id: testSchemaId,
          name: "Logging Test Job",
          total_records: 2,
          config: { enable_images: false },
          status: "pending",
        })
        .select()
        .single()

      await processor.processNextJob()

      // Check logs were created
      const { data: logs } = await supabase
        .from("job_logs")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true })

      expect(logs.length).toBeGreaterThan(0)
      expect(logs.some((log: any) => log.message.includes("Started processing"))).toBe(true)
      expect(logs.some((log: any) => log.message.includes("Completed job"))).toBe(true)
    }, 120000)
  })
})
