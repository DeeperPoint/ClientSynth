import { createClient } from "@/lib/supabase/server"

export interface ExportOptions {
  format: "csv" | "json" | "xlsx" | "sql"
  filters?: {
    limit?: number
    offset?: number
    fields?: string[]
  }
}

export class ExportGenerator {
  private supabase = createClient()

  async generateExport(jobId: string, options: ExportOptions): Promise<string> {
    const { format, filters = {} } = options

    // Get job data
    const { data: generatedData, error } = await (await this.supabase)
      .from("generated_data")
      .select("record_data, record_index")
      .eq("job_id", jobId)
      .order("record_index", { ascending: true })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 10000) - 1)

    if (error) {
      throw new Error(`Failed to fetch data: ${error.message}`)
    }

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
        return this.generateXLSX(records)
      case "sql":
        return this.generateSQL(records, jobId)
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
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (typeof value === "string" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      csvRows.push(values.join(","))
    })

    return csvRows.join("\n")
  }

  private generateJSON(records: any[]): string {
    return JSON.stringify(records, null, 2)
  }

  private generateXLSX(records: any[]): string {
    // For now, return CSV format - in production, you'd use a library like xlsx
    // This is a placeholder implementation
    return this.generateCSV(records)
  }

  private generateSQL(records: any[], jobId: string): string {
    if (records.length === 0) return ""

    const tableName = `synthetic_data_${jobId.replace(/-/g, "_")}`
    const headers = Object.keys(records[0])

    // Create table statement
    const createTable = `CREATE TABLE ${tableName} (\n  ${headers.map((header) => `${header} TEXT`).join(",\n  ")}\n);\n\n`

    // Insert statements
    const inserts = records
      .map((record) => {
        const values = headers.map((header) => {
          const value = record[header]
          if (value === null || value === undefined) return "NULL"
          if (typeof value === "string") {
            return `'${value.replace(/'/g, "''")}'`
          }
          return `'${value}'`
        })
        return `INSERT INTO ${tableName} (${headers.join(", ")}) VALUES (${values.join(", ")});`
      })
      .join("\n")

    return createTable + inserts
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
      default:
        return "text/plain"
    }
  }

  getFileExtension(format: string): string {
    return format === "xlsx" ? "xlsx" : format
  }
}
