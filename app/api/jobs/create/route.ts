import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/postgres/server"

export async function POST(request: NextRequest) {
  console.log("[v0] Job creation API called")

  try {
    console.log("[v0] Creating PostgreSQL client...")
    const db = await createServerClient()

    console.log("[v0] Getting user authentication...")
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser()

    if (authError || !user) {
      console.log("[v0] No authenticated user; proceeding with schema tenant only")
    } else {
      console.log("[v0] User authenticated:", user.id)
    }

    console.log("[v0] Parsing request body...")
    const body = await request.json()
    console.log("[v0] Request body:", body)

    const { schema_id, name, total_records, config = {} } = body

    if (!schema_id || !name || !total_records) {
      console.log("[v0] Missing required fields")
      return NextResponse.json({ error: "Missing required fields: schema_id, name, total_records" }, { status: 400 })
    }

    console.log("[v0] Fetching schema:", schema_id)
    const { data: schema, error: schemaError } = await db
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
    const { data: job, error: jobError } = await db
      .from("jobs")
      .insert({
        tenant_id: schema.tenant_id,
        schema_id,
        name,
        total_records: Number.parseInt(String(total_records)),
        config,
        created_by: user?.id ?? null,
        status: "pending",
      })
      .select()
      .single()

    if (jobError) {
      console.log("[v0] Job creation failed:", jobError)
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }
    console.log("[v0] Job created successfully:", job.id)

    console.log("[v0] Triggering job processing via API...")
    try {
      // Use fetch to call the processing endpoint
      // This ensures it runs independently of this request's lifecycle
      const origin = request.nextUrl?.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || "http://localhost:3000"
      const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`
      const processUrl = `${baseUrl}/api/jobs/process`

      console.log("[v0] Calling process endpoint:", processUrl)

      // Fire and forget - don't await this
      fetch(processUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((error) => {
        console.error("[v0] Failed to trigger job processing:", error)
      })

      console.log("[v0] Job processing trigger sent")
    } catch (triggerError) {
      console.error("[v0] Error triggering job processing:", triggerError)
      // Don't fail the job creation if trigger fails - user can manually trigger
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
