import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { schema_id, name, total_records, config = {} } = body

    if (!schema_id || !name || !total_records) {
      return NextResponse.json({ error: "Missing required fields: schema_id, name, total_records" }, { status: 400 })
    }

    // Get schema to validate and get tenant_id
    const { data: schema, error: schemaError } = await supabase
      .from("schemas")
      .select("id, tenant_id, name")
      .eq("id", schema_id)
      .single()

    if (schemaError || !schema) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 })
    }

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
      })
      .select()
      .single()

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, job })
  } catch (error) {
    console.error("Error creating job:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
