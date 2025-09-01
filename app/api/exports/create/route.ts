import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ExportGenerator } from "@/lib/export-utils"

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
    const { job_id, name, format, filters = {} } = body

    if (!job_id || !name || !format) {
      return NextResponse.json({ error: "Missing required fields: job_id, name, format" }, { status: 400 })
    }

    // Validate format
    const validFormats = ["csv", "json", "xlsx", "sql"]
    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: "Invalid format. Must be one of: csv, json, xlsx, sql" }, { status: 400 })
    }

    // Get job to validate access and get tenant_id
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, tenant_id, name, status")
      .eq("id", job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (job.status !== "completed") {
      return NextResponse.json({ error: "Job must be completed before exporting" }, { status: 400 })
    }

    // Create export record
    const { data: exportRecord, error: exportError } = await supabase
      .from("exports")
      .insert({
        tenant_id: job.tenant_id,
        job_id,
        name,
        format,
        filters,
        created_by: user.id,
      })
      .select()
      .single()

    if (exportError) {
      return NextResponse.json({ error: exportError.message }, { status: 500 })
    }

    // Generate export in background (in production, this would be a background job)
    try {
      const generator = new ExportGenerator()
      const content = await generator.generateExport(job_id, { format, filters })

      // In production, you'd upload this to blob storage and store the URL
      // For now, we'll store it as a data URL (not recommended for large files)
      const contentType = generator.getContentType(format)
      const dataUrl = `data:${contentType};base64,${Buffer.from(content).toString("base64")}`

      // Update export record with completion
      await supabase
        .from("exports")
        .update({
          status: "completed",
          file_url: dataUrl,
          file_size: Buffer.byteLength(content, "utf8"),
          record_count: content.split("\n").length - 1, // Rough estimate
          updated_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id)

      return NextResponse.json({
        success: true,
        export: { ...exportRecord, status: "completed", file_url: dataUrl },
      })
    } catch (error) {
      // Update export record with error
      await supabase
        .from("exports")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id)

      return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error creating export:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
