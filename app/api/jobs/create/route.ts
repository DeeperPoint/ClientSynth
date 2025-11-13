import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  console.log("[v0] Job creation API called")

  try {
    console.log("[v0] Getting user authentication...")
    const user = await getCurrentUser()

    if (!user) {
      console.log("[v0] No authenticated user")
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
    // Get user's tenant IDs for access check
    const tenantsResult = await query(`
      SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1
    `, [user.id])
    const tenantIds = tenantsResult.rows.map(row => row.tenant_id)

    const schemaResult = await query(`
      SELECT id, tenant_id, name, schema_definition
      FROM schemas
      WHERE id = $1 AND tenant_id = ANY($2::uuid[])
    `, [schema_id, tenantIds])

    if (schemaResult.rows.length === 0) {
      console.log("[v0] Schema not found or access denied")
      return NextResponse.json({ error: "Schema not found" }, { status: 404 })
    }
    const schema = schemaResult.rows[0]
    console.log("[v0] Schema found:", schema.name)

    console.log("[v0] Creating job record...")
    const jobResult = await query(`
      INSERT INTO jobs (tenant_id, schema_id, name, total_records, config, created_by, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
      RETURNING *
    `, [
      schema.tenant_id,
      schema_id,
      name,
      Number.parseInt(String(total_records)),
      JSON.stringify(config),
      user.id
    ])

    if (jobResult.rows.length === 0) {
      console.log("[v0] Job creation failed")
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }
    const job = jobResult.rows[0]
    console.log("[v0] Job created successfully:", job.id)

    console.log("[v0] Triggering job processing via API...")
    try {
      // Determine the internal API URL for server-to-server calls
      // Priority: INTERNAL_API_URL env var > localhost (for Nginx deployments) > request origin
      let processUrl: string
      
      if (process.env.INTERNAL_API_URL) {
        // Explicitly configured internal URL (e.g., for Docker, Kubernetes, etc.)
        processUrl = `${process.env.INTERNAL_API_URL}/api/jobs/process`
      } else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
        // Production on traditional server (EC2, etc.) - use localhost to avoid SSL/proxy issues
        // When behind Nginx: external HTTPS → Nginx → internal HTTP localhost:3000
        processUrl = "http://localhost:3000/api/jobs/process"
      } else {
        // Development or serverless (Vercel) - use request origin
        processUrl = `${request.nextUrl.origin}/api/jobs/process`
      }

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
