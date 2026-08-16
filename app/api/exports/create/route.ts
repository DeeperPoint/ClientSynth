import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query, hasTenantAccess } from "@/lib/postgres/client"
import { ExportGenerator } from "@/lib/export-utils"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { job_id, name, format, filters = {} } = body

    if (!job_id || !name || !format) {
      return NextResponse.json({ error: "Missing required fields: job_id, name, format" }, { status: 400 })
    }

    // Validate format
    const validFormats = ["csv", "json", "xlsx", "sql", "xml", "parquet", "cosolvent", "population"]
    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: "Invalid format. Must be one of: csv, json, xlsx, sql, xml, parquet, cosolvent, population" }, { status: 400 })
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

    // Verify user has access to the job's tenant
    const hasAccess = await hasTenantAccess(user.id, job.tenant_id)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: You do not have access to this job" }, { status: 403 })
    }

    // Allow export as long as there are generated records (partial export for running/paused/failed jobs)
    const recordCountResult = await query(`
      SELECT COUNT(*)::int as count FROM generated_data WHERE job_id = $1
    `, [job_id])
    
    if (recordCountResult.rows[0].count === 0) {
      return NextResponse.json({ error: "No records generated yet. Wait for the job to produce data before exporting." }, { status: 400 })
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
      if (format === 'cosolvent') {
        const baseUrl = filters.cosolventBaseUrl || process.env.COSOLVENT_BASE_URL
        if (!baseUrl) {
          throw new Error("Cosolvent base URL is required in filters.cosolventBaseUrl or COSOLVENT_BASE_URL env var")
        }
        
        const { CosolventExporter } = await import("@/lib/cosolvent-exporter")
        const exporter = new CosolventExporter({ baseUrl })
        
        const result = await exporter.streamExport(job_id, filters)
        
        if (!result.success && result.totalSent === 0) {
           throw new Error(`Cosolvent export failed fully. Errors: ${JSON.stringify(result.errors)}`)
        }

        await query(`
          UPDATE exports 
          SET status = 'completed', file_url = null, file_size = 0, record_count = $1, updated_at = NOW()
          WHERE id = $2
        `, [result.totalSent, exportRecord.id])

        return NextResponse.json({
          success: true,
          export: { ...exportRecord, status: "completed", file_url: null, record_count: result.totalSent },
          cosolventStats: result
        })
      }

      // C0 synthetic population file for Cosolvent ingest (GAP-10/9).
      // Produces a downloadable, watermarked file rather than streaming to a
      // live endpoint, so the population can be reviewed before it is loaded.
      if (format === 'population') {
        const { exportJobPopulation, parseTargetSchema } = await import("@/lib/population/job-population-service")
        const { serializePopulation } = await import("@/lib/population/population-export")

        const result = await exportJobPopulation(job_id, {
          targetSchema: filters.targetSchema ? parseTargetSchema(filters.targetSchema) : undefined,
          participantType: filters.participantType,
          mode: filters.mode === 'production' ? 'production' : 'demo',
          strict: filters.allowInvalid !== true,
          limit: filters.limit,
          offset: filters.offset,
        })

        if (result.stats.exported === 0) {
          throw new Error(
            `No records passed the population validity gate (${result.stats.rejected} rejected). ` +
            `First reasons: ${result.rejected.slice(0, 3).map(r => r.reasons.join('; ')).join(' | ')}`
          )
        }

        const content = serializePopulation(result.file)
        const fileSize = Buffer.byteLength(content, 'utf8')
        const dataUrl = `data:application/json;base64,${Buffer.from(content).toString("base64")}`

        await query(`
          UPDATE exports
          SET status = 'completed', file_url = $1, file_size = $2, record_count = $3, updated_at = NOW()
          WHERE id = $4
        `, [dataUrl, fileSize, result.stats.exported, exportRecord.id])

        return NextResponse.json({
          success: true,
          export: { ...exportRecord, status: "completed", file_url: dataUrl, record_count: result.stats.exported },
          populationStats: result.stats,
          rejected: result.rejected,
        })
      }

      const generator = new ExportGenerator()
      const content = await generator.generateExport(job_id, { format, filters: filters as any })

      // In production, you'd upload this to blob storage and store the URL
      // For now, we'll store it as a data URL (not recommended for large files)
      const contentType = generator.getContentType(format)
      const dataUrl = `data:${contentType};base64,${Buffer.from(content).toString("base64")}`

      // Calculate file size and record count based on format
      const fileSize = Buffer.isBuffer(content) 
        ? content.length 
        : Buffer.byteLength(content, typeof content === 'string' ? 'utf8' : 'binary')
      const recordCount = format === 'json' 
        ? (JSON.parse(content as string).data?.length || 0)
        : (typeof content === 'string' ? content.split('\n').length - 1 : 0)

      // Update export record with completion
      await query(`
        UPDATE exports 
        SET status = 'completed', file_url = $1, file_size = $2, record_count = $3, updated_at = NOW()
        WHERE id = $4
      `, [dataUrl, fileSize, recordCount, exportRecord.id])

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
