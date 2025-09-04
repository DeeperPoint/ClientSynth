import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { JobProcessor } from "@/lib/job-processor"

export async function POST(request: NextRequest) {
  console.log("[v0] Job creation API called")

  try {
    console.log("[v0] Creating Supabase client...")
    const supabase = await createClient()

    console.log("[v0] Getting user authentication...")
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Authentication failed:", authError)
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
    const { data: schema, error: schemaError } = await supabase
      .from("schemas")
      .select("id, tenant_id, name, schema_definition")
      .eq("id", schema_id)
      .single()

    if (schemaError || !schema) {
      console.log("[v0] Schema not found:", schemaError)
      return NextResponse.json({ error: "Schema not found" }, { status: 404 })
    }
    console.log("[v0] Schema found:", schema.name)

    console.log("[v0] Creating job record...")
    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        tenant_id: schema.tenant_id,
        schema_id,
        name,
        total_records: Number.parseInt(total_records),
        config,
        created_by: user.id,
        status: "pending",
      })
      .select()
      .single()

    if (jobError) {
      console.log("[v0] Job creation failed:", jobError)
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }
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
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: `Job processor initialization failed: ${processError instanceof Error ? processError.message : "Unknown error"}`,
        })
        .eq("id", job.id)

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
