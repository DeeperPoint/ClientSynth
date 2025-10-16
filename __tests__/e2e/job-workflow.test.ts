import { createServerClient } from "@/lib/supabase/server"

describe("End-to-End Job Workflow Tests", () => {
  let supabase: any
  let testTenantId: string
  let testUserId: string
  let testSchemaId: string

  beforeAll(async () => {
    supabase = await createServerClient()

    // Create test user row in auth.users via SQL helper or direct insert
    const { data: userRow } = await supabase
      .from("auth.users")
      .insert({ email: "test@example.com", password_hash: "testpassword123", email_verified: true })
      .select()
      .single()
    testUserId = userRow.id

    // Create test tenant
    const { data: tenant } = await supabase.from("tenants").insert({ name: "E2E Test Tenant" }).select().single()
    testTenantId = tenant.id

    // Link user to tenant
    await supabase.from("user_tenant_roles").insert({
      user_id: testUserId,
      tenant_id: testTenantId,
      role: "admin",
    })

    // Create test schema
    const { data: schema } = await supabase
      .from("schemas")
      .insert({
        tenant_id: testTenantId,
        name: "E2E Test Schema",
        schema_definition: {
          fields: [
            {
              name: "first_name",
              type: "first_name",
              description: "First name of the person",
            },
            {
              name: "last_name",
              type: "last_name",
              description: "Last name of the person",
            },
            {
              name: "email",
              type: "email",
              description: "Email address",
            },
            {
              name: "job_title",
              type: "job_title",
              description: "Professional job title",
            },
            {
              name: "company",
              type: "company",
              description: "Company name",
            },
            {
              name: "bio",
              type: "text",
              description: "Professional biography",
            },
            {
              name: "profile_image",
              type: "image",
              description: "Professional headshot photo",
            },
          ],
        },
      })
      .select()
      .single()
    testSchemaId = schema.id
  })

  afterAll(async () => {
    // Cleanup test data
    await supabase.from("media").delete().eq("tenant_id", testTenantId)
    await supabase.from("generated_data").delete().eq("tenant_id", testTenantId)
    await supabase.from("job_logs").delete().match({ job_id: testSchemaId })
    await supabase.from("jobs").delete().eq("tenant_id", testTenantId)
    await supabase.from("schemas").delete().eq("id", testSchemaId)
    await supabase.from("user_tenant_roles").delete().eq("tenant_id", testTenantId)
    await supabase.from("tenants").delete().eq("id", testTenantId)
    await supabase.auth.admin.deleteUser(testUserId)
  })

  describe("Complete Job Lifecycle", () => {
    it("should create, process, and complete a job with images", async () => {
      console.log("[E2E] Starting complete job lifecycle test")

      // Step 1: Create job via API
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: testSchemaId,
          name: "E2E Test Job",
          total_records: 5,
          config: {
            text_model: "google/gemini-2.5-flash",
            image_model: "gemini-2.0-flash-exp",
            enable_images: true,
            images_per_record: 1,
            batch_size: 2,
          },
        }),
      })

      expect(createResponse.ok).toBe(true)
      const { job } = await createResponse.json()
      expect(job).toBeDefined()
      expect(job.id).toBeDefined()

      console.log(`[E2E] Job created: ${job.id}`)

      // Step 2: Wait for job to start processing
      await new Promise((resolve) => setTimeout(resolve, 5000))

      let jobStatus = await supabase.from("jobs").select("*").eq("id", job.id).single()
      expect(["running", "processing", "completed"]).toContain(jobStatus.data.status)

      console.log(`[E2E] Job status: ${jobStatus.data.status}`)

      // Step 3: Wait for job completion (max 3 minutes)
      const maxWaitTime = 180000 // 3 minutes
      const startTime = Date.now()
      let completed = false

      while (Date.now() - startTime < maxWaitTime && !completed) {
        const { data: currentJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

        console.log(
          `[E2E] Job progress: ${currentJob.generated_records}/${currentJob.total_records} (${currentJob.progress}%)`,
        )

        if (currentJob.status === "completed") {
          completed = true
          jobStatus = { data: currentJob }
        } else if (currentJob.status === "failed") {
          throw new Error(`Job failed: ${currentJob.error_message}`)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }

      expect(completed).toBe(true)
      expect(jobStatus.data.status).toBe("completed")
      expect(jobStatus.data.generated_records).toBe(5)
      expect(jobStatus.data.progress).toBe(100)

      console.log("[E2E] Job completed successfully")

      // Step 4: Verify generated data
      const { data: generatedData } = await supabase
        .from("generated_data")
        .select("*")
        .eq("job_id", job.id)
        .order("record_index", { ascending: true })

      expect(generatedData).toHaveLength(5)

      console.log(`[E2E] Verified ${generatedData.length} generated records`)

      // Verify each record has all required fields
      generatedData.forEach((record: any, index: number) => {
        expect(record.record_data.first_name).toBeDefined()
        expect(record.record_data.last_name).toBeDefined()
        expect(record.record_data.email).toBeDefined()
        expect(record.record_data.job_title).toBeDefined()
        expect(record.record_data.company).toBeDefined()
        expect(record.record_data.bio).toBeDefined()
        expect(record.record_data.profile_image).toBeDefined()

        console.log(`[E2E] Record ${index + 1}:`, {
          name: `${record.record_data.first_name} ${record.record_data.last_name}`,
          email: record.record_data.email,
          job_title: record.record_data.job_title,
          has_image: !!record.record_data.profile_image,
        })
      })

      // Step 5: Verify media records
      const { data: mediaRecords } = await supabase.from("media").select("*").eq("job_id", job.id)

      expect(mediaRecords.length).toBeGreaterThan(0)
      expect(mediaRecords.length).toBeLessThanOrEqual(5) // Should have up to 5 images

      console.log(`[E2E] Verified ${mediaRecords.length} media records`)

      mediaRecords.forEach((media: any) => {
        expect(media.s3_url).toBeDefined()
        expect(media.s3_url).toContain("amazonaws.com")
        expect(media.s3_key).toMatch(new RegExp(`^${testTenantId}/${job.id}/`))
        expect(media.model_used).toBe("gemini-2.0-flash-exp")
        expect(media.content_type).toBe("image/png")
      })

      // Step 6: Verify job logs
      const { data: logs } = await supabase
        .from("job_logs")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true })

      expect(logs.length).toBeGreaterThan(0)

      const startLog = logs.find((log: any) => log.message.includes("Started processing"))
      const completeLog = logs.find((log: any) => log.message.includes("Completed job"))

      expect(startLog).toBeDefined()
      expect(completeLog).toBeDefined()

      console.log(`[E2E] Verified ${logs.length} job logs`)

      // Step 7: Test data export
      const { data: exportData } = await supabase.from("generated_data").select("record_data").eq("job_id", job.id)

      const csvData = exportData.map((row: any) => row.record_data)
      expect(csvData).toHaveLength(5)

      console.log("[E2E] Export data verified")

      console.log("[E2E] Complete job lifecycle test passed!")
    }, 300000) // 5 minute timeout

    it("should handle job with text-only fields", async () => {
      // Create text-only schema
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
              { name: "job_title", type: "job_title" },
            ],
          },
        })
        .select()
        .single()

      // Create job
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: textSchema.id,
          name: "Text Only Job",
          total_records: 10,
          config: {
            enable_images: false,
            batch_size: 5,
          },
        }),
      })

      const { job } = await createResponse.json()

      // Wait for completion
      const maxWaitTime = 120000 // 2 minutes
      const startTime = Date.now()
      let completed = false

      while (Date.now() - startTime < maxWaitTime && !completed) {
        const { data: currentJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

        if (currentJob.status === "completed") {
          completed = true
        } else if (currentJob.status === "failed") {
          throw new Error(`Job failed: ${currentJob.error_message}`)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }

      expect(completed).toBe(true)

      // Verify data
      const { data: generatedData } = await supabase.from("generated_data").select("*").eq("job_id", job.id)

      expect(generatedData).toHaveLength(10)

      // Cleanup
      await supabase.from("schemas").delete().eq("id", textSchema.id)
    }, 180000)

    it("should handle job pause and resume", async () => {
      // Create job
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: testSchemaId,
          name: "Pausable Job",
          total_records: 20,
          config: {
            enable_images: false,
            batch_size: 2,
          },
        }),
      })

      const { job } = await createResponse.json()

      // Wait for job to start
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Pause job
      const pauseResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.id,
          action: "pause",
        }),
      })

      expect(pauseResponse.ok).toBe(true)

      // Wait for pause to take effect
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const { data: pausedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(pausedJob.status).toBe("paused")
      expect(pausedJob.generated_records).toBeLessThan(20)

      const recordsBeforeResume = pausedJob.generated_records

      // Resume job
      const resumeResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.id,
          action: "resume",
        }),
      })

      expect(resumeResponse.ok).toBe(true)

      // Wait for completion
      const maxWaitTime = 120000
      const startTime = Date.now()
      let completed = false

      while (Date.now() - startTime < maxWaitTime && !completed) {
        const { data: currentJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

        if (currentJob.status === "completed") {
          completed = true
        } else {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }

      expect(completed).toBe(true)

      const { data: completedJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(completedJob.generated_records).toBe(20)
      expect(completedJob.generated_records).toBeGreaterThan(recordsBeforeResume)
    }, 240000)

    it("should handle job cancellation", async () => {
      // Create job
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: testSchemaId,
          name: "Cancellable Job",
          total_records: 20,
          config: {
            enable_images: false,
          },
        }),
      })

      const { job } = await createResponse.json()

      // Wait for job to start
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Cancel job
      const cancelResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.id,
          action: "cancel",
        }),
      })

      expect(cancelResponse.ok).toBe(true)

      // Wait for cancellation to take effect
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const { data: cancelledJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

      expect(cancelledJob.status).toBe("cancelled")
      expect(cancelledJob.generated_records).toBeLessThan(20)
    }, 120000)
  })

  describe("Error Handling", () => {
    it("should handle invalid schema gracefully", async () => {
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: "invalid-schema-id",
          name: "Invalid Job",
          total_records: 5,
        }),
      })

      expect(createResponse.status).toBe(404)
    })

    it("should handle missing required fields", async () => {
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: testSchemaId,
          // Missing name and total_records
        }),
      })

      expect(createResponse.status).toBe(400)
    })
  })

  describe("Performance", () => {
    it("should process large batches efficiently", async () => {
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_id: testSchemaId,
          name: "Large Batch Job",
          total_records: 50,
          config: {
            enable_images: false,
            batch_size: 10,
          },
        }),
      })

      const { job } = await createResponse.json()

      const startTime = Date.now()

      // Wait for completion
      const maxWaitTime = 300000 // 5 minutes
      let completed = false

      while (Date.now() - startTime < maxWaitTime && !completed) {
        const { data: currentJob } = await supabase.from("jobs").select("*").eq("id", job.id).single()

        if (currentJob.status === "completed") {
          completed = true
        } else if (currentJob.status === "failed") {
          throw new Error(`Job failed: ${currentJob.error_message}`)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      expect(completed).toBe(true)

      console.log(`[E2E] Processed 50 records in ${duration}s (${(50 / duration).toFixed(2)} records/sec)`)

      // Verify all records
      const { data: generatedData } = await supabase.from("generated_data").select("*").eq("job_id", job.id)

      expect(generatedData).toHaveLength(50)
    }, 300000)
  })
})
