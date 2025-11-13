import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"
import { AILabelingEngine } from "@/lib/ai-labeling-engine"
import { ExportGenerator } from "@/lib/export-utils"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id

    if (!schemaId) {
      return NextResponse.json({ error: "Schema ID is required" }, { status: 400 })
    }

    // Verify authentication
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify schema access
    const schemaResult = await query(
      `SELECT s.*, t.id as tenant_id
       FROM schemas s
       JOIN tenants t ON s.tenant_id = t.id
       JOIN user_tenant_roles utr ON t.id = utr.tenant_id
       WHERE s.id = $1 AND utr.user_id = $2`,
      [schemaId, user.id]
    )

    if (schemaResult.rows.length === 0) {
      return NextResponse.json({ error: "Schema not found or access denied" }, { status: 404 })
    }

    // Get export parameters
    const body = await request.json()
    const format = body.format || 'json'
    const includeReport = body.includeReport !== false // Default true

    // Run auto-labeling to get validated seeds
    const engine = new AILabelingEngine()
    const labelResult = await engine.autoLabelAndMap(schemaId, body.exampleFileIds)

    const seeds = labelResult.validatedSeeds

    // Check if we have records
    if (!seeds || !seeds.records || seeds.records.length === 0) {
      return NextResponse.json(
        { error: "No seed records available to export. Please ensure example files are uploaded and mapped to schema fields." },
        { status: 400 }
      )
    }

    // Generate export file
    let exportContent: string | Buffer

    if (format === 'json') {
      // Include full metadata in JSON export
      const exportData = {
        seeds: seeds.records,
        report: includeReport ? {
          summary: seeds.metadata?.summary || {},
          coverage: seeds.metadata?.coverage || {},
          fieldMappings: labelResult.mappings || [],
          validationResults: seeds.metadata?.coverage?.validationResults || [],
          sourceFiles: seeds.metadata?.sourceFiles || [],
          validatedAt: seeds.metadata?.validatedAt || new Date().toISOString()
        } : undefined
      }
      exportContent = JSON.stringify(exportData, null, 2)
    } else if (format === 'csv') {
      // Generate CSV manually
      const records = seeds.records
      const headers = Object.keys(records[0])
      const csvRows = [headers.join(',')]
      
      records.forEach(record => {
        const values = headers.map(header => {
          const value = record[header]
          if (value === null || value === undefined) return ''
          
          // Handle arrays (e.g., multiple images)
          let stringValue: string
          if (Array.isArray(value)) {
            stringValue = value.join('; ')
          } else {
            stringValue = String(value)
          }
          
          // Escape CSV special characters
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        csvRows.push(values.join(','))
      })
      
      let csv = csvRows.join('\n')
      if (includeReport && seeds.metadata) {
        const report = generateSummaryReport(seeds.metadata.coverage || {}, labelResult.mappings || [])
        csv = `# Seed Dataset Export Summary\n# Generated: ${new Date().toISOString()}\n# Precision: ${Math.round((seeds.metadata.summary?.precision || 0) * 100)}%\n# Field Coverage: ${Math.round((seeds.metadata.coverage?.fieldCoverage?.coveragePercentage || 0))}%\n\n${report}\n\n# Data Records:\n${csv}`
      }
      exportContent = csv
    } else if (format === 'sql') {
      // Generate SQL export
      const records = seeds.records
      const tableName = `seed_data_${schemaId.replace(/-/g, '_')}`
      const headers = Object.keys(records[0])
      
      let sql = `-- Seed Dataset Export\n-- Generated: ${new Date().toISOString()}\n-- Records: ${records.length}\n\n`
      sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`
      sql += `  id SERIAL PRIMARY KEY,\n`
      sql += headers.map(h => `  ${h.replace(/[^a-zA-Z0-9_]/g, '_')} TEXT`).join(',\n')
      sql += `\n);\n\n`
      
      if (records.length > 0) {
        sql += `INSERT INTO ${tableName} (${headers.map(h => h.replace(/[^a-zA-Z0-9_]/g, '_')).join(', ')}) VALUES\n`
        const values = records.map(record => {
          const vals = headers.map(header => {
            const value = record[header]
            if (value === null || value === undefined) return 'NULL'
            const stringValue = Array.isArray(value) ? value.join('; ') : String(value)
            return `'${stringValue.replace(/'/g, "''")}'`
          })
          return `  (${vals.join(', ')})`
        })
        sql += values.join(',\n') + ';'
      }
      
      exportContent = sql
    } else {
      // Default to JSON for unknown formats
      exportContent = JSON.stringify({
        seeds: seeds.records,
        report: includeReport ? {
          summary: seeds.metadata?.summary || {},
          coverage: seeds.metadata?.coverage || {},
          fieldMappings: labelResult.mappings || [],
          validationResults: seeds.metadata?.coverage?.validationResults || [],
          sourceFiles: seeds.metadata?.sourceFiles || [],
          validatedAt: seeds.metadata?.validatedAt || new Date().toISOString()
        } : undefined
      }, null, 2)
    }

    // Return export data
    const contentType = format === 'json' 
      ? 'application/json' 
      : format === 'csv' 
        ? 'text/csv' 
        : format === 'sql'
          ? 'application/sql'
          : 'application/octet-stream'

    return new NextResponse(exportContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="seeds_${schemaId}_${Date.now()}.${format}"`
      }
    })
  } catch (error) {
    console.error("Export seeds error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    )
  }
}

// Helper to generate summary report text
function generateSummaryReport(coverage: any, mappings: any[]): string {
  const report = []
  report.push('# Coverage Summary')
  report.push(`- Total Fields: ${coverage.fieldCoverage.totalFields}`)
  report.push(`- Covered Fields: ${coverage.fieldCoverage.coveredFields}`)
  report.push(`- Coverage: ${Math.round(coverage.fieldCoverage.coveragePercentage)}%`)
  report.push(`- Missing Fields: ${coverage.fieldCoverage.missingFields.join(', ') || 'None'}`)
  report.push('')
  report.push('# Precision Metrics')
  report.push(`- Overall Precision: ${Math.round(coverage.precision * 100)}%`)
  report.push(`- High Confidence Mappings: ${mappings.filter(m => m.confidence >= 0.9).length}`)
  report.push('')
  report.push('# Field Mappings')
  mappings.forEach(m => {
    report.push(`- ${m.extractedField} → ${m.schemaField || 'NEW'} (${Math.round(m.confidence * 100)}%)`)
    if (m.issues?.length) {
      report.push(`  Issues: ${m.issues.join(', ')}`)
    }
  })
  
  return report.join('\n')
}

