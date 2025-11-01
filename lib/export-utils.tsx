import { query } from "@/lib/postgres/client"

export interface ExportOptions {
  format: "csv" | "json" | "xlsx" | "sql" | "xml" | "parquet"
  filters?: {
    limit?: number
    offset?: number
    fields?: string[]
  }
}

export class ExportGenerator {

  async generateExport(jobId: string, options: ExportOptions): Promise<string | Buffer> {
    const { format, filters = {} } = options

    // Get job data from Postgres
    const offset = filters.offset || 0
    const limit = filters.limit || 50000
    const result = await query(
      `SELECT record_data, record_index FROM generated_data WHERE job_id = $1 ORDER BY record_index ASC OFFSET $2 LIMIT $3`,
      [jobId, offset, limit]
    )
    const generatedData = result.rows

    if (!generatedData || generatedData.length === 0) {
      throw new Error("No data found for export")
    }

    // Filter fields if specified
    const records = generatedData.map((item) => {
      const record = item.record_data
      if (filters.fields && filters.fields.length > 0) {
        const filteredRecord: any = {}
        filters.fields.forEach((field) => {
          if (record[field] !== undefined) {
            filteredRecord[field] = record[field]
          }
        })
        return filteredRecord
      }
      return record
    })

    switch (format) {
      case "csv":
        return this.generateCSV(records)
      case "json":
        return this.generateJSON(records)
      case "xlsx":
        return await this.generateXLSX(records)
      case "sql":
        return this.generateSQL(records, jobId)
      case "xml":
        return this.generateXML(records)
      case "parquet":
        return await this.generateParquet(records)
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  private generateCSV(records: any[]): string {
    if (records.length === 0) return ""

    const headers = Object.keys(records[0])
    const csvRows = [headers.join(",")]

    records.forEach((record) => {
      const values = headers.map((header) => {
        const value = record[header]
        // Handle null/undefined values
        if (value === null || value === undefined) return ""

        // Handle arrays (e.g., multiple images) - join with semicolon
        let stringValue: string
        if (Array.isArray(value)) {
          stringValue = value.join('; ')
        } else {
          stringValue = String(value)
        }

        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (
          stringValue.includes(",") ||
          stringValue.includes('"') ||
          stringValue.includes("\n") ||
          stringValue.includes("\r")
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      })
      csvRows.push(values.join(","))
    })

    return csvRows.join("\n")
  }

  private generateJSON(records: any[]): string {
    return JSON.stringify(
      {
        metadata: {
          recordCount: records.length,
          exportedAt: new Date().toISOString(),
          format: "json",
        },
        data: records,
      },
      null,
      2,
    )
  }

  private async generateXLSX(records: any[]): Promise<Buffer> {
    if (records.length === 0) {
      throw new Error("No data to export")
    }

    // Use xlsx library for proper Excel generation
    const XLSX = await import('xlsx')
    
    const headers = Object.keys(records[0])
    
    // Prepare data array with headers first
    const worksheetData: any[][] = [headers]
    
    // Add data rows
    records.forEach((record) => {
      const row = headers.map((header) => {
        const value = record[header]
        // Handle arrays (e.g., multiple images) - join with newline for Excel
        if (Array.isArray(value)) {
          return value.join('\n')
        }
        return value !== null && value !== undefined ? value : ''
      })
      worksheetData.push(row)
    })

    // Create worksheet from array
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

    // Create workbook and add worksheet
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    
    return buffer
  }


  private escapeXML(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  private generateSQL(records: any[], jobId: string): string {
    if (records.length === 0) return ""

    const tableName = `synthetic_data_${jobId.replace(/-/g, "_")}`
    const headers = Object.keys(records[0])

    // Enhanced CREATE TABLE with better type detection
    const createTable = `-- Synthetic Data Export
-- Generated on: ${new Date().toISOString()}
-- Records: ${records.length}

CREATE TABLE IF NOT EXISTS ${tableName} (
  id SERIAL PRIMARY KEY,
${headers
  .map((header) => {
    // Detect column type based on sample data
    const sampleValue = records.find((r) => r[header] !== null && r[header] !== undefined)?.[header]
    let sqlType = "TEXT"

    if (sampleValue !== undefined) {
      if (typeof sampleValue === "number") {
        sqlType = Number.isInteger(sampleValue) ? "INTEGER" : "DECIMAL(10,2)"
      } else if (typeof sampleValue === "boolean") {
        sqlType = "BOOLEAN"
      } else if (sampleValue instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(sampleValue))) {
        sqlType = "TIMESTAMP"
      } else if (String(sampleValue).includes("@")) {
        sqlType = "VARCHAR(255)"
      } else if (String(sampleValue).length > 255) {
        sqlType = "TEXT"
      } else {
        sqlType = "VARCHAR(255)"
      }
    }

    return `  ${header.replace(/[^a-zA-Z0-9_]/g, "_")} ${sqlType}`
  })
  .join(",\n")},
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert data
`

    // Batch insert statements for better performance
    const batchSize = 1000
    let inserts = ""

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      inserts += `INSERT INTO ${tableName} (${headers.map((h) => h.replace(/[^a-zA-Z0-9_]/g, "_")).join(", ")}) VALUES\n`

      const values = batch.map((record) => {
        const vals = headers.map((header) => {
          const value = record[header]
          if (value === null || value === undefined) return "NULL"
          if (typeof value === "string") {
            return `'${value.replace(/'/g, "''")}'`
          }
          if (typeof value === "boolean") {
            return value ? "TRUE" : "FALSE"
          }
          return `'${value}'`
        })
        return `  (${vals.join(", ")})`
      })

      inserts += values.join(",\n") + ";\n\n"
    }

    return createTable + inserts
  }

  private generateXML(records: any[]): string {
    if (records.length === 0) return '<?xml version="1.0" encoding="UTF-8"?><data></data>'

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += "<data>\n"
    xml += `  <metadata>\n`
    xml += `    <recordCount>${records.length}</recordCount>\n`
    xml += `    <exportedAt>${new Date().toISOString()}</exportedAt>\n`
    xml += `    <format>xml</format>\n`
    xml += `  </metadata>\n`
    xml += "  <records>\n"

    records.forEach((record, index) => {
      xml += `    <record id="${index + 1}">\n`

      Object.entries(record).forEach(([key, value]) => {
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, "_")
        
        // Handle arrays properly
        if (Array.isArray(value)) {
          xml += `      <${sanitizedKey}>\n`
          value.forEach((item, itemIndex) => {
            const itemValue = item !== null && item !== undefined ? this.escapeXML(String(item)) : ""
            xml += `        <item index="${itemIndex + 1}">${itemValue}</item>\n`
          })
          xml += `      </${sanitizedKey}>\n`
        } else {
          const sanitizedValue = value !== null && value !== undefined ? this.escapeXML(String(value)) : ""
          xml += `      <${sanitizedKey}>${sanitizedValue}</${sanitizedKey}>\n`
        }
      })

      xml += "    </record>\n"
    })

    xml += "  </records>\n"
    xml += "</data>"

    return xml
  }

  private async generateParquet(records: any[]): Promise<Buffer> {
    // Parquet is a complex binary format requiring specialized libraries
    // For now, we'll generate a CSV-compatible format that can be converted to Parquet
    // In production, use 'parquetjs' or 'apache-arrow' libraries
    
    if (records.length === 0) {
      throw new Error("No data to export")
    }

    // Generate a structured JSON format with schema information
    // This can be imported into tools like pandas or converted to Parquet
    const schema = this.inferSchema(records)
    
    // Create a format that's compatible with Parquet conversion tools
    const parquetCompatible = {
      schema: schema,
      data: records.map((record) => {
        const converted: any = {}
        Object.entries(record).forEach(([key, value]) => {
          // Convert arrays to strings for Parquet compatibility
          if (Array.isArray(value)) {
            converted[key] = JSON.stringify(value)
          } else {
            converted[key] = value
          }
        })
        return converted
      }),
      metadata: {
        format: "parquet-compatible-json",
        recordCount: records.length,
        exportedAt: new Date().toISOString(),
        note: "Convert this JSON to Parquet using pandas.read_json() and df.to_parquet(), or use a Parquet conversion tool"
      },
    }

    // Return as JSON - users can convert to Parquet using external tools
    // Alternatively, we could throw an error directing users to use CSV/JSON
    return Buffer.from(JSON.stringify(parquetCompatible, null, 2), 'utf8')
  }

  private inferSchema(records: any[]): any {
    if (records.length === 0) return {}

    const schema: any = {}
    const sampleRecord = records[0]

    Object.entries(sampleRecord).forEach(([key, value]) => {
      if (typeof value === "number") {
        schema[key] = Number.isInteger(value) ? "INT64" : "DOUBLE"
      } else if (typeof value === "boolean") {
        schema[key] = "BOOLEAN"
      } else if (value instanceof Date) {
        schema[key] = "TIMESTAMP"
      } else {
        schema[key] = "UTF8"
      }
    })

    return schema
  }

  getContentType(format: string): string {
    switch (format) {
      case "csv":
        return "text/csv"
      case "json":
        return "application/json"
      case "xlsx":
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      case "sql":
        return "application/sql"
      case "xml":
        return "application/xml"
      case "parquet":
        return "application/octet-stream"
      default:
        return "text/plain"
    }
  }

  getFileExtension(format: string): string {
    return format === "xlsx" ? "xlsx" : format
  }

  static getFormatInfo() {
    return {
      csv: {
        name: "CSV",
        description: "Comma-separated values - Universal format",
        icon: "Table",
        maxRecords: 1000000,
      },
      json: {
        name: "JSON",
        description: "JavaScript Object Notation - Web-friendly",
        icon: "Code",
        maxRecords: 100000,
      },
      xlsx: {
        name: "Excel",
        description: "Microsoft Excel format - Spreadsheet ready",
        icon: "FileText",
        maxRecords: 500000,
      },
      sql: {
        name: "SQL",
        description: "SQL INSERT statements - Database ready",
        icon: "Database",
        maxRecords: 1000000,
      },
      xml: {
        name: "XML",
        description: "Extensible Markup Language - Structured data",
        icon: "FileCode",
        maxRecords: 100000,
      },
      parquet: {
        name: "Parquet",
        description: "Columnar storage - Analytics optimized",
        icon: "BarChart",
        maxRecords: 10000000,
      },
    }
  }
}
