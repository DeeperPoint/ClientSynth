import { query } from './postgres/client'
import { PDFGenerator, type PDFTemplateConfig, type PDFTemplateGenerateOptions } from './pdf-generator'
import { AIGenerator, type GenerationContext } from './ai-generator'

export interface PDFTemplate {
  id: string
  tenantId: string
  name: string
  version: number
  description?: string
  templateConfig: PDFTemplateConfig
  templatePdfBase64?: string
  isActive: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateTemplateOptions {
  tenantId: string
  name: string
  description?: string
  templateConfig: PDFTemplateConfig
  templatePdfBase64?: string
  createdBy: string
}

export interface TemplateUsageStats {
  total: number
  success: number
  failure: number
  averageGenerationTimeMs: number
  averageOutputSizeBytes: number
}

export class PDFTemplateService {
  private pdfGenerator = new PDFGenerator()
  private aiGenerator: AIGenerator

  constructor() {
    this.aiGenerator = new AIGenerator()
  }

  async createTemplate(options: CreateTemplateOptions): Promise<PDFTemplate> {
    // Get next version
    const versionResult = await query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM pdf_templates
       WHERE tenant_id = $1 AND name = $2`,
      [options.tenantId, options.name]
    )
    const version = parseInt(versionResult.rows[0].next_version)

    // Insert template
    const result = await query(
      `INSERT INTO pdf_templates
       (tenant_id, name, version, description, template_config, template_pdf_base64, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        options.tenantId,
        options.name,
        version,
        options.description || null,
        JSON.stringify(options.templateConfig),
        options.templatePdfBase64 || null,
        options.createdBy,
      ]
    )

    return this.mapRowToTemplate(result.rows[0])
  }

  async getTemplate(
    tenantId: string,
    name: string,
    version?: number
  ): Promise<PDFTemplate | null> {
    let result
    if (version) {
      result = await query(
        `SELECT * FROM pdf_templates
         WHERE tenant_id = $1 AND name = $2 AND version = $3 AND is_active = true`,
        [tenantId, name, version]
      )
    } else {
      result = await query(
        `SELECT * FROM pdf_templates
         WHERE tenant_id = $1 AND name = $2 AND is_active = true
         ORDER BY version DESC
         LIMIT 1`,
        [tenantId, name]
      )
    }

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToTemplate(result.rows[0])
  }

  async listTemplates(tenantId: string, includeInactive = false): Promise<PDFTemplate[]> {
    let queryText = `SELECT * FROM pdf_templates WHERE tenant_id = $1`
    const params: any[] = [tenantId]

    if (!includeInactive) {
      queryText += ` AND is_active = true`
    }

    queryText += ` ORDER BY name, version DESC`

    const result = await query(queryText, params)

    return result.rows.map((row) => this.mapRowToTemplate(row))
  }

  async deactivateTemplate(tenantId: string, name: string, version?: number): Promise<void> {
    if (version) {
      await query(
        `UPDATE pdf_templates
         SET is_active = false, updated_at = NOW()
         WHERE tenant_id = $1 AND name = $2 AND version = $3`,
        [tenantId, name, version]
      )
    } else {
      // Deactivate all versions
      await query(
        `UPDATE pdf_templates
         SET is_active = false, updated_at = NOW()
         WHERE tenant_id = $1 AND name = $2`,
        [tenantId, name]
      )
    }
  }

  async generatePDF(
    tenantId: string,
    templateName: string,
    data: Record<string, any>,
    version?: number,
    pageSize?: 'A4' | 'LETTER',
    marginMm?: number
  ): Promise<{
    success: boolean
    pdfBase64?: string
    templateId?: string
    templateVersion?: number
    error?: string
    generationTimeMs?: number
    outputSizeBytes?: number
  }> {
    const startTime = Date.now()

    try {
      const template = await this.getTemplate(tenantId, templateName, version)  
      if (!template) {
        return {
          success: false,
          error: `Template "${templateName}" not found${version ? ` (version ${version})` : ''}`,
        }
      }

      // Generate complete PDF document content using data JSON as a prompt
      // The template structure guides the formatting, but AI generates the entire content
      // Includes retry logic for transient API errors
      const fullDocumentContent = await this.generateCompletePDFContent(
        template.templateConfig,
        data,
        3 // max retries
      )

      // Parse the generated content and map it to template sections
      const parsedContent = this.parseContentToTemplateStructure(
        template.templateConfig,
        fullDocumentContent
      )

      const generateOptions: PDFTemplateGenerateOptions = {
        templateConfig: template.templateConfig,
        data: parsedContent, // Structured content mapped to template placeholders
        pageSize: pageSize || template.templateConfig.pageSize || 'A4',
        marginMm: marginMm || template.templateConfig.marginMm || 20,
      }

      const result = await this.pdfGenerator.generateFromTemplate(generateOptions)

      const generationTimeMs = Date.now() - startTime
      const outputSizeBytes = result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64').length : undefined

      // Track usage
      await this.trackUsage(
        template.id,
        tenantId,
        result.success ? 'success' : 'failure',
        result.error,
        generationTimeMs,
        outputSizeBytes
      )

      return {
        success: result.success,
        pdfBase64: result.pdfBase64,
        templateId: template.id,
        templateVersion: template.version,
        error: result.error,
        generationTimeMs,
        outputSizeBytes,
      }
    } catch (error) {
      const generationTimeMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        success: false,
        error: errorMessage,
        generationTimeMs,
      }
    }
  }

  /**
   * Generate complete PDF document content using data JSON as a prompt.
   * Similar to how pdf_content_create works, but guided by template structure.
   * Includes retry logic for transient API errors.
   */
  private async generateCompletePDFContent(
    templateConfig: PDFTemplateConfig,
    dataContext: Record<string, any>,
    maxRetries: number = 3
  ): Promise<string> {
    const contextDescription = this.buildContextDescription(dataContext)
    const templateStructure = this.buildTemplateStructureDescription(templateConfig)
    
    // Build a comprehensive prompt to generate the entire document
    const sections = templateConfig.sections || []
    const sectionDescriptions = sections.map((section, idx) => {
      if (section.type === 'title') {
        return `Section ${idx + 1}: Title section`
      } else if (section.type === 'text') {
        const placeholder = this.extractPlaceholderKey(section.content || '')
        return `Section ${idx + 1}: Text content section${placeholder ? ` (${placeholder})` : ''}`
      } else if (section.type === 'table') {
        return `Section ${idx + 1}: Table with headers: ${section.headers?.join(', ') || ''}`
      }
      return `Section ${idx + 1}: ${section.type}`
    }).join('\n')

    const documentPrompt = `You are generating a complete professional PDF document. Use the provided context data as a prompt to create comprehensive, realistic content.

CONTEXT/PROMPT DATA (use this to generate the document):
${contextDescription}

DOCUMENT STRUCTURE TO FOLLOW:
${templateStructure}

SECTIONS REQUIRED:
${sectionDescriptions}

INSTRUCTIONS:
1. Generate a COMPLETE, professional document based on the context data above
2. Use the context data as inspiration - don't just repeat it verbatim
3. Create comprehensive, detailed content that expands on the context
4. For tables: Generate 3-5 realistic data rows matching the specified headers
5. Format your response clearly with:
   - A clear title at the beginning
   - Well-structured text sections
   - Tables in markdown format (| Header1 | Header2 |) if needed
6. Make the content professional, realistic, and appropriate for the document type

Generate the complete document content now. Be thorough and comprehensive:`

    // Retry logic for transient API errors (503, 429, etc.)
    let lastError: Error | null = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use fieldType 'pdf' to get higher token limit for complete document generation
        const fullContent = await this.aiGenerator.generateFieldValue({
          fieldType: 'pdf',
          fieldName: 'complete_document',
          fieldDescription: documentPrompt,
          recordIndex: 0,
          existingData: dataContext,
        }, attempt)

        return this.extractValue(fullContent)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const errorMessage = lastError.message.toLowerCase()
        
        // Retry on transient errors (503, 429, timeout, rate limit)
        const isTransientError = 
          errorMessage.includes('503') ||
          errorMessage.includes('429') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('service temporarily unavailable') ||
          errorMessage.includes('worker exceeded resource limits')

        if (isTransientError && attempt < maxRetries - 1) {
          // Exponential backoff: 2s, 4s, 8s
          const delayMs = 2000 * Math.pow(2, attempt)
          console.warn(`[PDFTemplateService] API error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms:`, lastError.message)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        
        // Non-retryable error or max retries reached
        throw lastError
      }
    }

    throw lastError || new Error('Failed to generate PDF content after retries')
  }

  /**
   * Parse the generated complete content and map it to template structure placeholders.
   * Intelligently extracts title, text sections, and tables from the AI-generated content.
   */
  private parseContentToTemplateStructure(
    templateConfig: PDFTemplateConfig,
    fullContent: string
  ): Record<string, any> {
    const sections = templateConfig.sections || []
    const parsedContent: Record<string, any> = {}
    
    // Split content into lines for analysis
    const contentLines = fullContent.split('\n')
    
    // Track which content we've already assigned
    let usedLines = new Set<number>()
    
    // Process each section in order
    for (const section of sections) {
      if (section.type === 'title' && section.content) {
        const placeholderKey = this.extractPlaceholderKey(section.content) || 'title'
        if (!parsedContent[placeholderKey]) {
          // Find the first meaningful line as title (skip empty lines, markdown headers)
          for (let i = 0; i < contentLines.length; i++) {
            if (usedLines.has(i)) continue
            const line = contentLines[i].trim()
            if (line) {
              // Extract title, cleaning markdown formatting
              parsedContent[placeholderKey] = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
              usedLines.add(i)
              break
            }
          }
        }
      } else if (section.type === 'text' && section.content) {
        const placeholderKey = this.extractPlaceholderKey(section.content) || 'text_content'
        if (!parsedContent[placeholderKey]) {
          // Collect text content, skipping already used lines and tables
          const textLines: string[] = []
          for (let i = 0; i < contentLines.length; i++) {
            if (usedLines.has(i)) continue
            const line = contentLines[i].trim()
            
            // Skip markdown headers (they're titles), table separators, and empty lines at start
            if (line.match(/^#{1,6}\s/) || line.match(/^[-:|]+$/)) {
              continue
            }
            
            // Stop if we hit a table
            if (line.includes('|') && !line.match(/^[A-Z\s]+\|/)) {
              break
            }
            
            if (line) {
              textLines.push(line.replace(/\*\*/g, '')) // Remove markdown bold
              usedLines.add(i)
            }
          }
          
          parsedContent[placeholderKey] = textLines.join('\n\n').trim() || fullContent.substring(0, 1000)
        }
      } else if (section.type === 'table' && section.headers) {
        const placeholderKey = section.rows && typeof section.rows === 'string'
          ? this.extractPlaceholderKey(section.rows)
          : 'table_data'
        
        if (!parsedContent[placeholderKey]) {
          const tableData = this.extractTableFromContent(contentLines, section.headers, usedLines)
          parsedContent[placeholderKey] = tableData.length > 0 
            ? tableData 
            : this.generateDefaultTableData(section.headers)
        }
      }
    }

    // Fallback: if we couldn't parse anything, use full content for first text section
    if (Object.keys(parsedContent).length === 0) {
      const firstTextSection = sections.find(s => s.type === 'text')
      if (firstTextSection) {
        const placeholderKey = this.extractPlaceholderKey(firstTextSection.content || '') || 'content'
        parsedContent[placeholderKey] = fullContent
      } else {
        // No text section? Use 'content' as default
        parsedContent.content = fullContent
      }
    }

    return parsedContent
  }

  private extractTableFromContent(
    contentLines: string[], 
    headers: string[], 
    usedLines: Set<number>
  ): any[][] {
    const rows: any[][] = []
    
    // Look for markdown table format (| col1 | col2 |)
    for (let i = 0; i < contentLines.length; i++) {
      if (usedLines.has(i)) continue
      
      const line = contentLines[i].trim()
      if (line.includes('|')) {
        // Skip table separator lines (|---|---|)
        if (line.match(/^[-:|]+$/)) {
          usedLines.add(i)
          continue
        }
        
        // Parse table row
        const cells = line.split('|')
          .map(c => c.trim())
          .filter(c => c && !c.match(/^[-:]+$/))
        
        // Check if this looks like a data row (not header)
        if (cells.length >= headers.length) {
          // Skip if it's clearly a header row (all caps or too long)
          const isHeader = cells[0].match(/^[A-Z\s]+$/) && cells[0].length > 20
          if (!isHeader) {
            rows.push(cells.slice(0, headers.length))
            usedLines.add(i)
            if (rows.length >= 5) break // Limit to 5 rows
          }
        }
      }
    }

    // If no markdown table found, try to parse JSON structures
    if (rows.length === 0) {
      const contentStr = contentLines.join('\n')
      try {
        // Try to find JSON array in content
        const jsonMatch = contentStr.match(/\[\[[\s\S]*?\]\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, 5).map((row: any) => 
              Array.isArray(row) ? row : [row]
            )
          }
        }
      } catch {
        // Continue with fallback
      }
    }

    return rows
  }

  private generateDefaultTableData(headers: string[]): any[][] {
    // Generate sample data based on headers
    return [
      headers.map(h => `Sample ${h}`),
      headers.map(h => `Data ${h} 1`),
      headers.map(h => `Data ${h} 2`),
    ]
  }

  private buildTemplateStructureDescription(templateConfig: PDFTemplateConfig): string {
    const parts: string[] = []
    
    if (templateConfig.title) {
      parts.push(`Document title theme: ${templateConfig.title}`)
    }
    
    const sections = templateConfig.sections || []
    const sectionTypes = sections.map(s => s.type).join(', ')
    if (sectionTypes) {
      parts.push(`Document structure: ${sectionTypes}`)
    }
    
    return parts.join('. ') || 'Professional document format'
  }

  private buildContextDescription(dataContext: Record<string, any>): string {
    const entries = Object.entries(dataContext)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ')
    return entries || 'No additional context provided'
  }



  private extractPlaceholderKey(content: string): string | null {
    const match = content.match(/\{\{([^}]+)\}\}/)
    return match ? match[1].trim() : null
  }

  private extractValue(aiResponse: string): string {
    try {
      const parsed = JSON.parse(aiResponse)
      if (typeof parsed === 'object' && parsed.value) {
        return parsed.value
      }
      return aiResponse
    } catch {
      // If not JSON, return as-is
      return aiResponse
    }
  }



  async getUsageStats(
    tenantId: string,
    templateName?: string,
    days = 30
  ): Promise<TemplateUsageStats> {
    let queryText = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure,
        AVG(generation_time_ms) as avg_time,
        AVG(output_size_bytes) as avg_size
      FROM pdf_template_usage u
      INNER JOIN pdf_templates t ON u.template_id = t.id
      WHERE u.tenant_id = $1
        AND u.created_at >= NOW() - INTERVAL '${days} days'
    `
    const params: any[] = [tenantId]

    if (templateName) {
      queryText += ` AND t.name = $2`
      params.push(templateName)
    }

    const result = await query(queryText, params)

    const row = result.rows[0]
    return {
      total: parseInt(row.total) || 0,
      success: parseInt(row.success) || 0,
      failure: parseInt(row.failure) || 0,
      averageGenerationTimeMs: parseFloat(row.avg_time) || 0,
      averageOutputSizeBytes: parseFloat(row.avg_size) || 0,
    }
  }

  private async trackUsage(
    templateId: string,
    tenantId: string,
    status: 'success' | 'failure',
    errorMessage?: string,
    generationTimeMs?: number,
    outputSizeBytes?: number
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO pdf_template_usage
         (template_id, tenant_id, status, error_message, generation_time_ms, output_size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [templateId, tenantId, status, errorMessage || null, generationTimeMs || null, outputSizeBytes || null]
      )
    } catch (error) {
      console.error('[PDFTemplateService] Failed to track usage:', error)
      // Don't throw - telemetry failures shouldn't break operations
    }
  }

  private mapRowToTemplate(row: any): PDFTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      version: row.version,
      description: row.description,
      templateConfig: row.template_config as PDFTemplateConfig,
      templatePdfBase64: row.template_pdf_base64,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
