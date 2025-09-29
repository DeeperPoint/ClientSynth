import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/database/client"
import { JobProcessor } from "@/lib/job-processor-local"
import { authenticateRequest } from "@/lib/auth/middleware"

export async function POST(request: NextRequest) {
  console.log("[v0] Job creation API called")

  try {
    // Authenticate user
    const user = await authenticateRequest(request)
    if (!user) {
      console.log("[v0] Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("[v0] User authenticated:", user.id)

    console.log("[v0] Parsing request body...")
    const body = await request.json()
    console.log("[v0] Request body:", body)

    const { schema_id, name, total_records, config = {} } = body

    if (!schema_id || !name || !total_records) {
      console.log("[v0] Missing required fields")
      return NextResponse.json({ error: "Missing required fields: schema_id, name, total_records" }, { status: 400 })
    }

    console.log("[v0] Fetching schema:", schema_id)
    // Get schema to validate and get tenant_id
    const schemaResult = await pool.query(
      'SELECT id, tenant_id, name, definition FROM schemas WHERE id = $1',
      [schema_id]
    )

    if (schemaResult.rows.length === 0) {
      console.log("[v0] Schema not found")
      return NextResponse.json({ error: "Schema not found" }, { status: 404 })
    }

    const schema = schemaResult.rows[0]
    console.log("[v0] Schema found:", schema.name)

    console.log("[v0] Creating job record...")
    // Create job with all required fields
    const jobResult = await pool.query(
      `INSERT INTO jobs (
        tenant_id, schema_id, name, total_records, config, created_by, 
        status, generated_records, progress, can_be_cancelled, can_be_paused, 
        can_be_retried, recovery_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, tenant_id, schema_id, name, total_records, config, status, created_at`,
      [
        schema.tenant_id,
        schema_id,
        name,
        Number.parseInt(total_records),
        JSON.stringify(config),
        user.id,
        'pending',
        0,
        0,
        true,
        true,
        true,
        JSON.stringify({
          lastSuccessfulRecord: -1,
          failedRecords: [],
          retryAttempts: {}
        })
      ]
    )

    if (jobResult.rows.length === 0) {
      console.log("[v0] Job creation failed")
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }

    const job = jobResult.rows[0]
    console.log("[v0] Job created successfully:", job.id)

    console.log("[v0] Initializing job processor...")
    try {
      const processor = new JobProcessor()
      console.log("[v0] Job processor initialized, starting processing...")

      // Process job asynchronously without blocking the response
      processor
        .processNextJob()
        .then(() => {
          console.log("[v0] Job processing completed successfully")
        })
        .catch((error) => {
          console.error("[v0] Background job processing failed:", error)
        })

      console.log("[v0] Job processing started in background")
    } catch (processError) {
      console.error("[v0] Error initializing or starting job processing:", processError)
      // Update job status to failed if processor initialization fails
      await pool.query(
        'UPDATE jobs SET status = $1, error_message = $2 WHERE id = $3',
        [
          'failed',
          `Job processor initialization failed: ${processError instanceof Error ? processError.message : "Unknown error"}`,
          job.id
        ]
      )

      console.error("[v0] Job created but processing failed to start:", processError)
    }

    console.log("[v0] Returning success response")
    return NextResponse.json({ success: true, job })
  } catch (error) {
    console.error("[v0] Critical error in job creation:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
