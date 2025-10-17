import * as XLSX from 'xlsx'

export interface ParsedExampleData {
  fieldName: string
  exampleValue: string
  rowIndex: number
}

export interface FileParseResult {
  success: boolean
  data: ParsedExampleData[]
  error?: string
  fieldNames: string[]
  totalRows: number
}

export class FileParser {
  /**
   * Parse uploaded file and extract example data
   */
  async parseFile(file: File): Promise<FileParseResult> {
    const fileType = this.getFileType(file.name)
    
    try {
      switch (fileType) {
        case 'csv':
          return await this.parseCSV(file)
        case 'json':
          return await this.parseJSON(file)
        case 'xlsx':
        case 'xls':
          return await this.parseExcel(file)
        default:
          return {
            success: false,
            data: [],
            error: `Unsupported file type: ${fileType}`,
            fieldNames: [],
            totalRows: 0
          }
      }
    } catch (error) {
      console.error('[FileParser] Parse error:', error)
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown parsing error',
        fieldNames: [],
        totalRows: 0
      }
    }
  }

  /**
   * Parse CSV file
   */
  private async parseCSV(file: File): Promise<FileParseResult> {
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return {
        success: false,
        data: [],
        error: 'CSV file must have at least a header row and one data row',
        fieldNames: [],
        totalRows: 0
      }
    }

    const headers = this.parseCSVLine(lines[0])
    const fieldNames = headers.map(h => h.trim())
    const data: ParsedExampleData[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      
      // Skip empty rows
      if (values.every(v => !v.trim())) continue

      for (let j = 0; j < Math.min(headers.length, values.length); j++) {
        const value = values[j]?.trim()
        if (value) {
          data.push({
            fieldName: fieldNames[j],
            exampleValue: value,
            rowIndex: i
          })
        }
      }
    }

    return {
      success: true,
      data,
      fieldNames,
      totalRows: lines.length - 1
    }
  }

  /**
   * Parse JSON file
   */
  private async parseJSON(file: File): Promise<FileParseResult> {
    const text = await file.text()
    const jsonData = JSON.parse(text)
    
    if (!Array.isArray(jsonData)) {
      return {
        success: false,
        data: [],
        error: 'JSON file must contain an array of objects',
        fieldNames: [],
        totalRows: 0
      }
    }

    if (jsonData.length === 0) {
      return {
        success: false,
        data: [],
        error: 'JSON array is empty',
        fieldNames: [],
        totalRows: 0
      }
    }

    const fieldNames = Object.keys(jsonData[0])
    const data: ParsedExampleData[] = []

    jsonData.forEach((row, rowIndex) => {
      fieldNames.forEach(fieldName => {
        const value = row[fieldName]
        if (value !== null && value !== undefined && value !== '') {
          data.push({
            fieldName,
            exampleValue: String(value),
            rowIndex
          })
        }
      })
    })

    return {
      success: true,
      data,
      fieldNames,
      totalRows: jsonData.length
    }
  }

  /**
   * Parse Excel file
   */
  private async parseExcel(file: File): Promise<FileParseResult> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    
    if (workbook.SheetNames.length === 0) {
      return {
        success: false,
        data: [],
        error: 'Excel file has no worksheets',
        fieldNames: [],
        totalRows: 0
      }
    }

    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
    
    if (jsonData.length < 2) {
      return {
        success: false,
        data: [],
        error: 'Excel file must have at least a header row and one data row',
        fieldNames: [],
        totalRows: 0
      }
    }

    const headers = jsonData[0] as string[]
    const fieldNames = headers.map(h => String(h).trim())
    const data: ParsedExampleData[] = []

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[]
      
      // Skip empty rows
      if (row.every(v => !v || String(v).trim() === '')) continue

      for (let j = 0; j < Math.min(headers.length, row.length); j++) {
        const value = row[j]
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          data.push({
            fieldName: fieldNames[j],
            exampleValue: String(value).trim(),
            rowIndex: i
          })
        }
      }
    }

    return {
      success: true,
      data,
      fieldNames,
      totalRows: jsonData.length - 1
    }
  }

  /**
   * Parse CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"'
          i += 2
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          i++
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current)
        current = ''
        i++
      } else {
        current += char
        i++
      }
    }

    // Add the last field
    result.push(current)
    return result
  }

  /**
   * Get file type from filename
   */
  private getFileType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase()
    
    switch (extension) {
      case 'csv':
        return 'csv'
      case 'json':
        return 'json'
      case 'xlsx':
        return 'xlsx'
      case 'xls':
        return 'xls'
      default:
        return 'unknown'
    }
  }

  /**
   * Validate file before parsing
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = ['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
    
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size must be less than 10MB'
      }
    }

    const fileType = this.getFileType(file.name)
    if (fileType === 'unknown') {
      return {
        valid: false,
        error: 'Unsupported file type. Please upload CSV, JSON, or Excel files.'
      }
    }

    return { valid: true }
  }

  /**
   * Get field mapping suggestions based on schema fields
   */
  getFieldMappingSuggestions(
    exampleFieldNames: string[],
    schemaFieldNames: string[]
  ): Record<string, string | null> {
    const suggestions: Record<string, string> = {}
    
    for (const exampleField of exampleFieldNames) {
      const normalizedExample = exampleField.toLowerCase().replace(/[^a-z0-9]/g, '')
      
      // Find best match from schema fields
      let bestMatch: string | null = null
      let bestScore = 0
      
      for (const schemaField of schemaFieldNames) {
        const normalizedSchema = schemaField.toLowerCase().replace(/[^a-z0-9]/g, '')
        
        // Calculate similarity score
        const score = this.calculateSimilarity(normalizedExample, normalizedSchema)
        
        if (score > bestScore && score > 0.6) { // Minimum 60% similarity
          bestScore = score
          bestMatch = schemaField
        }
      }
      
      suggestions[exampleField] = bestMatch
    }
    
    return suggestions
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = []
    const len1 = str1.length
    const len2 = str2.length

    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    const distance = matrix[len2][len1]
    const maxLength = Math.max(len1, len2)
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength
  }
}
