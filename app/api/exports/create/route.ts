import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/postgres/server"
import { query } from "@/lib/postgres/client"
import { ExportGenerator } from "@/lib/export-utils"

export async function POST(request: NextRequest) {
  try {
    const db = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser()

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
    const jobResult = await query(`
      SELECT id, tenant_id, name, status
      FROM jobs
      WHERE id = $1
    `, [job_id])

    if (jobResult.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const job = jobResult.rows[0]

    if (job.status !== "completed") {
      return NextResponse.json({ error: "Job must be completed before exporting" }, { status: 400 })
    }

    // Create export record
    const exportResult = await query(`
      INSERT INTO exports (tenant_id, job_id, name, format, filters, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [job.tenant_id, job_id, name, format, JSON.stringify(filters), user.id])

    const exportRecord = exportResult.rows[0]

    // Generate export in background (in production, this would be a background job)
    try {
      const generator = new ExportGenerator()
      const content = await generator.generateExport(job_id, { format, filters })

      // In production, you'd upload this to blob storage and store the URL
      // For now, we'll store it as a data URL (not recommended for large files)
      const contentType = generator.getContentType(format)
      const dataUrl = `data:${contentType};base64,${Buffer.from(content).toString("base64")}`

      // Update export record with completion
      await query(`
        UPDATE exports 
        SET status = 'completed', file_url = $1, file_size = $2, record_count = $3, updated_at = NOW()
        WHERE id = $4
      `, [dataUrl, Buffer.byteLength(content, "utf8"), content.split("\n").length - 1, exportRecord.id])

      return NextResponse.json({
        success: true,
        export: { ...exportRecord, status: "completed", file_url: dataUrl },
      })
    } catch (error) {
      // Update export record with error
      await query(`
        UPDATE exports 
        SET status = 'failed', error_message = $1, updated_at = NOW()
        WHERE id = $2
      `, [error instanceof Error ? error.message : "Unknown error", exportRecord.id])

      return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error creating export:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
