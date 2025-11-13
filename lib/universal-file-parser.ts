/**
 * Universal File Parser
 * 
 * Parses ANY file type (PDF, DOCX, TXT, CSV, JSON, Excel, etc.)
 * Extracts structured data and suggests field mappings
 */

import * as XLSX from 'xlsx'

export interface ExtractedField {
  fieldName: string
  fieldType: string
  exampleValues: string[]
  confidence: number // 0-1 score
  suggestedType: 'name' | 'email' | 'phone' | 'address' | 'company' | 'job_title' | 'text' | 'number' | 'date' | 'url' | 'image' | 'pdf'
}

export interface ParsedFileData {
  success: boolean
  fields: ExtractedField[]
  rawText?: string
  error?: string
  metadata: {
    fileType: string
    fileSize: number
    recordCount: number
    confidence: number
  }
}

export interface FieldMapping {
  extractedField: string
  schemaField: string | null // null means new field to add
  action: 'map' | 'add' | 'skip'
}

export class UniversalFileParser {
  private getBaseUrl(): string {
    // In browser, relative path works
    if (typeof window !== 'undefined') return ''
    // In server, construct absolute URL
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    if (envUrl) {
      const hasProtocol = envUrl.startsWith('http://') || envUrl.startsWith('https://')
      return hasProtocol ? envUrl : `https://${envUrl}`
    }
    return 'http://localhost:3000'
  }
  /**
   * Parse any file type and extract structured data
   */
  async parseFile(file: File): Promise<ParsedFileData> {
    const fileType = this.detectFileType(file.name, file.type)
    
    console.log(`[UniversalParser] Parsing file: ${file.name}, type: ${fileType}`)
    
    try {
      switch (fileType) {
        case 'pdf':
          return await this.parsePDF(file)
        case 'docx':
        case 'doc':
          return await this.parseDOCX(file)
        case 'txt':
          return await this.parseTXT(file)
        case 'csv':
          return await this.parseCSV(file)
        case 'json':
          return await this.parseJSON(file)
        case 'xlsx':
        case 'xls':
          return await this.parseExcel(file)
        case 'xml':
          return await this.parseXML(file)
        default:
          return await this.parseGeneric(file)
      }
    } catch (error) {
      console.error('[UniversalParser] Parse error:', error)
      return {
        success: false,
        fields: [],
        error: error instanceof Error ? error.message : 'Unknown parsing error',
        metadata: {
          fileType,
          fileSize: file.size,
          recordCount: 0,
          confidence: 0
        }
      }
    }
  }

  /**
   * Parse PDF files
   */
  private async parsePDF(file: File): Promise<ParsedFileData> {
    // Use pdf-parse via API endpoint
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(`${this.getBaseUrl()}/api/parse/pdf`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error('PDF parsing failed')
    }
    
    const { text } = await response.json()
    return this.extractFieldsFromText(text, file, 'pdf')
  }

  /**
   * Parse DOCX files
   */
  private async parseDOCX(file: File): Promise<ParsedFileData> {
    // Use mammoth.js via API endpoint
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(`${this.getBaseUrl()}/api/parse/docx`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error('DOCX parsing failed')
    }
    
    const { text } = await response.json()
    return this.extractFieldsFromText(text, file, 'docx')
  }

  /**
   * Parse plain text files with improved handling
   */
  private async parseTXT(file: File): Promise<ParsedFileData> {
    try {
      // Try to read as UTF-8 first
      let text: string
      try {
        text = await file.text()
      } catch (e) {
        // Fallback: read as array buffer and decode with error handling
        const buffer = await file.arrayBuffer()
        const decoder = new TextDecoder('utf-8', { fatal: false })
        text = decoder.decode(buffer)
      }

      // Validate text is not empty
      if (!text || text.trim().length === 0) {
        throw new Error('Text file is empty or contains no readable content')
      }

      // Check if text appears to be binary
      const nullBytes = text.indexOf('\0')
      if (nullBytes !== -1 && nullBytes < 100) {
        throw new Error('File appears to be binary data, not text')
      }

      return this.extractFieldsFromText(text, file, 'txt')
    } catch (error) {
      console.error('[UniversalParser] TXT parse error:', error)
      return {
        success: false,
        fields: [],
        error: error instanceof Error ? error.message : 'Failed to parse text file',
        metadata: {
          fileType: 'txt',
          fileSize: file.size,
          recordCount: 0,
          confidence: 0
        }
      }
    }
  }

  /**
   * Parse CSV files
   */
  private async parseCSV(file: File): Promise<ParsedFileData> {
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row')
    }

    const headers = this.parseCSVLine(lines[0])
    const fields: ExtractedField[] = []

    // Parse data rows (skip header row at index 0)
    const records: Record<string, string[]> = {}
    for (const header of headers) {
      records[header] = []
    }

    let dataRowCount = 0
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      // Skip completely empty rows
      if (values.every(v => !v || !v.trim())) continue
      
      dataRowCount++
      for (let j = 0; j < Math.min(headers.length, values.length); j++) {
        const value = values[j]?.trim()
        if (value) {
          records[headers[j]].push(value)
        }
      }
    }

    // Create field objects
    for (const header of headers) {
      const exampleValues = records[header].slice(0, 10) // First 10 examples
      const suggestedType = this.detectFieldType(header, exampleValues)
      
      fields.push({
        fieldName: header.trim(),
        fieldType: suggestedType,
        exampleValues,
        confidence: this.calculateConfidence(exampleValues),
        suggestedType
      })
    }

    return {
      success: true,
      fields,
      metadata: {
        fileType: 'csv',
        fileSize: file.size,
        recordCount: dataRowCount, // Count actual data rows, not including header
        confidence: 0.95
      }
    }
  }

  /**
   * Parse JSON files
   */
  private async parseJSON(file: File): Promise<ParsedFileData> {
    const text = await file.text()
    const jsonData = JSON.parse(text)
    
    if (!Array.isArray(jsonData)) {
      throw new Error('JSON file must contain an array of objects')
    }

    if (jsonData.length === 0) {
      throw new Error('JSON array is empty')
    }

    const fieldNames = Object.keys(jsonData[0])
    const fields: ExtractedField[] = []

    for (const fieldName of fieldNames) {
      const exampleValues = jsonData
        .map(record => String(record[fieldName]))
        .filter(v => v && v !== 'null' && v !== 'undefined')
        .slice(0, 10)

      const suggestedType = this.detectFieldType(fieldName, exampleValues)
      
      fields.push({
        fieldName,
        fieldType: suggestedType,
        exampleValues,
        confidence: this.calculateConfidence(exampleValues),
        suggestedType
      })
    }

    return {
      success: true,
      fields,
      metadata: {
        fileType: 'json',
        fileSize: file.size,
        recordCount: jsonData.length,
        confidence: 0.95
      }
    }
  }

  /**
   * Parse Excel files
   */
  private async parseExcel(file: File): Promise<ParsedFileData> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    
    if (workbook.SheetNames.length === 0) {
      throw new Error('Excel file has no worksheets')
    }

    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
    
    if (jsonData.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row')
    }

    const headers = jsonData[0] as string[]
    const fields: ExtractedField[] = []

    // Parse data
    const records: Record<string, string[]> = {}
    for (const header of headers) {
      records[String(header).trim()] = []
    }

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[]
      for (let j = 0; j < Math.min(headers.length, row.length); j++) {
        const value = row[j]
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          records[String(headers[j]).trim()].push(String(value).trim())
        }
      }
    }

    // Create fields
    for (const header of headers) {
      const headerStr = String(header).trim()
      const exampleValues = records[headerStr].slice(0, 10)
      const suggestedType = this.detectFieldType(headerStr, exampleValues)
      
      fields.push({
        fieldName: headerStr,
        fieldType: suggestedType,
        exampleValues,
        confidence: this.calculateConfidence(exampleValues),
        suggestedType
      })
    }

    return {
      success: true,
      fields,
      metadata: {
        fileType: 'xlsx',
        fileSize: file.size,
        recordCount: jsonData.length - 1,
        confidence: 0.95
      }
    }
  }

  /**
   * Parse XML files
   */
  private async parseXML(file: File): Promise<ParsedFileData> {
    const text = await file.text()
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(text, 'text/xml')
    
    // Extract all unique element names and their values
    const fieldMap = new Map<string, string[]>()
    
    const extractFields = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        const tagName = element.tagName
        const textContent = element.textContent?.trim()
        
        if (textContent && !element.children.length) {
          if (!fieldMap.has(tagName)) {
            fieldMap.set(tagName, [])
          }
          fieldMap.get(tagName)!.push(textContent)
        }
        
        // Recurse children
        for (let i = 0; i < element.children.length; i++) {
          extractFields(element.children[i])
        }
      }
    }
    
    extractFields(xmlDoc.documentElement)
    
    const fields: ExtractedField[] = []
    for (const [fieldName, values] of fieldMap.entries()) {
      const exampleValues = values.slice(0, 10)
      const suggestedType = this.detectFieldType(fieldName, exampleValues)
      
      fields.push({
        fieldName,
        fieldType: suggestedType,
        exampleValues,
        confidence: this.calculateConfidence(exampleValues),
        suggestedType
      })
    }

    return {
      success: true,
      fields,
      metadata: {
        fileType: 'xml',
        fileSize: file.size,
        recordCount: Math.max(...Array.from(fieldMap.values()).map(v => v.length)),
        confidence: 0.85
      }
    }
  }

  /**
   * Generic parser for unknown file types
   */
  private async parseGeneric(file: File): Promise<ParsedFileData> {
    const text = await file.text()
    return this.extractFieldsFromText(text, file, 'text')
  }

  /**
   * Extract structured fields from raw text using intelligent parsing
   */
  extractFieldsFromText(text: string, file: File | { name: string; size: number }, fileType: string): ParsedFileData {
    const fields: ExtractedField[] = []
    
    // Patterns to detect different field types
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b/g,
      url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
      date: /\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi,
      number: /\b\d+(?:\.\d+)?\b/g,
    }

    // Extract emails
    const emails = text.match(patterns.email) || []
    if (emails.length > 0) {
      fields.push({
        fieldName: 'email',
        fieldType: 'email',
        exampleValues: [...new Set(emails)].slice(0, 10),
        confidence: 0.9,
        suggestedType: 'email'
      })
    }

    // Extract phone numbers
    const phones = text.match(patterns.phone) || []
    if (phones.length > 0) {
      fields.push({
        fieldName: 'phone',
        fieldType: 'phone',
        exampleValues: [...new Set(phones)].slice(0, 10),
        confidence: 0.85,
        suggestedType: 'phone'
      })
    }

    // Extract URLs
    const urls = text.match(patterns.url) || []
    if (urls.length > 0) {
      fields.push({
        fieldName: 'website',
        fieldType: 'url',
        exampleValues: [...new Set(urls)].slice(0, 10),
        confidence: 0.9,
        suggestedType: 'url'
      })
    }

    // Extract dates
    const dates = text.match(patterns.date) || []
    if (dates.length > 0) {
      fields.push({
        fieldName: 'date',
        fieldType: 'date',
        exampleValues: [...new Set(dates)].slice(0, 10),
        confidence: 0.8,
        suggestedType: 'date'
      })
    }

    // Extract names (lines that look like names)
    const lines = text.split('\n').filter(line => line.trim())
    const namePattern = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/
    const possibleNames = lines.filter(line => namePattern.test(line.trim()))
    if (possibleNames.length > 0) {
      fields.push({
        fieldName: 'name',
        fieldType: 'name',
        exampleValues: possibleNames.slice(0, 10),
        confidence: 0.75,
        suggestedType: 'name'
      })
    }

    // Extract key-value pairs (e.g., "Company: Tech Corp")
    const kvPattern = /^([A-Za-z\s]+):\s*(.+)$/gm
    let match
    const kvFields = new Map<string, string[]>()
    
    while ((match = kvPattern.exec(text)) !== null) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_')
      const value = match[2].trim()
      
      if (!kvFields.has(key)) {
        kvFields.set(key, [])
      }
      kvFields.get(key)!.push(value)
    }

    for (const [key, values] of kvFields.entries()) {
      const exampleValues = [...new Set(values)].slice(0, 10)
      const suggestedType = this.detectFieldType(key, exampleValues)
      
      fields.push({
        fieldName: key,
        fieldType: suggestedType,
        exampleValues,
        confidence: 0.7,
        suggestedType
      })
    }

    return {
      success: true,
      fields,
      rawText: text,
      metadata: {
        fileType,
        fileSize: file.size,
        recordCount: fields.length > 0 ? Math.max(...fields.map(f => f.exampleValues.length)) : 0,
        confidence: fields.length > 0 ? 0.7 : 0.3
      }
    }
  }

  /**
   * Detect field type from field name and example values
   */
  private detectFieldType(fieldName: string, exampleValues: string[]): ExtractedField['suggestedType'] {
    const name = fieldName.toLowerCase()
    
    // Email detection
    if (name.includes('email') || name.includes('e-mail')) {
      return 'email'
    }
    
    // Check if values look like emails
    if (exampleValues.some(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
      return 'email'
    }

    // Phone detection
    if (name.includes('phone') || name.includes('tel') || name.includes('mobile')) {
      return 'phone'
    }

    // Name detection
    if (name.includes('name') || name === 'fullname' || name === 'full_name') {
      return 'name'
    }

    // Address detection
    if (name.includes('address') || name.includes('street') || name.includes('location')) {
      return 'address'
    }

    // Company detection
    if (name.includes('company') || name.includes('organization') || name.includes('employer')) {
      return 'company'
    }

    // Job title detection
    if (name.includes('job') || name.includes('title') || name.includes('position') || name.includes('role')) {
      return 'job_title'
    }

    // URL detection
    if (name.includes('url') || name.includes('website') || name.includes('link')) {
      return 'url'
    }
    
    if (exampleValues.some(v => /^https?:\/\//.test(v))) {
      return 'url'
    }

    // Date detection
    if (name.includes('date') || name.includes('time') || name.includes('day')) {
      return 'date'
    }

    // Number detection
    if (name.includes('age') || name.includes('count') || name.includes('amount') || name.includes('price')) {
      return 'number'
    }
    
    if (exampleValues.every(v => !isNaN(Number(v)))) {
      return 'number'
    }

    // Default to text
    return 'text'
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(exampleValues: string[]): number {
    if (exampleValues.length === 0) return 0
    if (exampleValues.length >= 10) return 0.95
    if (exampleValues.length >= 5) return 0.85
    if (exampleValues.length >= 3) return 0.75
    return 0.6
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
          current += '"'
          i += 2
        } else {
          inQuotes = !inQuotes
          i++
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
        i++
      } else {
        current += char
        i++
      }
    }

    result.push(current)
    return result
  }

  /**
   * Detect file type from filename and MIME type
   */
  private detectFileType(filename: string, mimeType: string): string {
    const extension = filename.split('.').pop()?.toLowerCase()
    
    // Check extension first
    if (extension) {
      if (['pdf'].includes(extension)) return 'pdf'
      if (['doc', 'docx'].includes(extension)) return 'docx'
      if (['txt', 'text'].includes(extension)) return 'txt'
      if (['csv'].includes(extension)) return 'csv'
      if (['json'].includes(extension)) return 'json'
      if (['xls', 'xlsx'].includes(extension)) return 'xlsx'
      if (['xml'].includes(extension)) return 'xml'
    }

    // Check MIME type
    if (mimeType.includes('pdf')) return 'pdf'
    if (mimeType.includes('word') || mimeType.includes('document')) return 'docx'
    if (mimeType.includes('text')) return 'txt'
    if (mimeType.includes('csv')) return 'csv'
    if (mimeType.includes('json')) return 'json'
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'xlsx'
    if (mimeType.includes('xml')) return 'xml'

    return 'text'
  }

  /**
   * Suggest field mappings between extracted fields and schema fields
   */
  suggestFieldMappings(
    extractedFields: ExtractedField[],
    schemaFields: Array<{ name: string; type: string }>
  ): FieldMapping[] {
    const mappings: FieldMapping[] = []

    for (const extracted of extractedFields) {
      let bestMatch: string | null = null
      let bestScore = 0

      // Try to match with existing schema fields
      for (const schemaField of schemaFields) {
        const score = this.calculateSimilarity(
          extracted.fieldName.toLowerCase(),
          schemaField.name.toLowerCase()
        )

        // Also consider type matching
        const typeMatch = extracted.suggestedType === schemaField.type ? 0.2 : 0
        const totalScore = score + typeMatch

        if (totalScore > bestScore && totalScore > 0.6) {
          bestScore = totalScore
          bestMatch = schemaField.name
        }
      }

      mappings.push({
        extractedField: extracted.fieldName,
        schemaField: bestMatch,
        action: bestMatch ? 'map' : 'add' // If no match, suggest adding as new field
      })
    }

    return mappings
  }

  /**
   * Calculate string similarity (Levenshtein distance)
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

  /**
   * Validate file before parsing
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 50 * 1024 * 1024 // 50MB (increased for PDFs/DOCX)
    
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size must be less than 50MB'
      }
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: 'File is empty'
      }
    }

    return { valid: true }
  }
}



