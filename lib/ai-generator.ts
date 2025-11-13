export interface GenerationContext {
  fieldType: string
  fieldName: string
  fieldDescription?: string
  recordIndex: number
  existingData?: Record<string, any>
  tenantContext?: string
  schemaId?: string
  exampleData?: string[]
  previouslyGeneratedValues?: string[] // Values to avoid for uniqueness
  temperature?: number // Optional temperature override for generation
}

export interface PDFGenerationContext extends GenerationContext {
  pdfTemplate?: {
    title: string
    fields: Array<{ name: string; label: string }>
    pageSize?: 'A4' | 'LETTER'
    marginMm?: number
  }
  pdfBase64?: string
}

interface StructuredOutputSchema {
  type: "object"
  properties: Record<string, any>
  required: string[]
  additionalProperties: boolean
}

export class AIGenerator {
  private apiKey: string | undefined
  private model = "google/gemini-2.5-flash"

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY
    if (model) {
      this.model = model
    }

    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required for text generation")
    }
  }

  /**
   * Fetch example data for a field from the database
   */
  async fetchExampleData(schemaId: string, fieldName: string, limit: number = 5): Promise<string[]> {
    try {
      const { query } = await import('@/lib/postgres/client')
      const result = await query(`
        SELECT DISTINCT ed.example_value
        FROM example_data ed
        JOIN example_files ef ON ed.example_file_id = ef.id
        WHERE ef.schema_id = $1 AND ed.field_name = $2
        ORDER BY ed.example_value
        LIMIT $3
      `, [schemaId, fieldName, limit])

      return result.rows.map(row => row.example_value)
    } catch (error) {
      console.error('[AIGenerator] Failed to fetch example data:', error)
      return []
    }
  }

  setModel(modelId: string): void {
    this.model = modelId
    console.log(`[AIGenerator] Switched to model: ${modelId}`)
  }

  getCurrentModel(): string {
    return this.model
  }

  async generateFieldValue(context: GenerationContext, retryAttempt: number = 0): Promise<string> {
    // Fetch example data if schemaId is provided
    let exampleData = context.exampleData
    if (!exampleData && context.schemaId) {
      exampleData = await this.fetchExampleData(context.schemaId, context.fieldName)
    }

    const system = this.systemPromptFor(context, exampleData)
    const prompt = this.buildPrompt(context, exampleData, retryAttempt)

    // Determine max_tokens based on field type
    const fieldName = context.fieldName.toLowerCase()
    const isDocument = context.fieldType === 'pdf' || fieldName.includes('resume') || fieldName.includes('cv') || fieldName.includes('document')
    const maxTokens = isDocument ? 2000 : 150

    // Increase temperature for variation to reduce duplicates
    // Higher temperature = more creative/varied outputs
    // Use context temperature if provided, otherwise calculate from retry attempt
    const temperature = context.temperature ?? (0.9 + (retryAttempt * 0.15)) // 0.9, 1.05, 1.2, 1.35 for retries

    console.log(`[AIGenerator] Generating with OpenRouter: ${this.model} (max_tokens: ${maxTokens}, temperature: ${temperature})`)

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_TITLE || "ClientSynth",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "field_value",
            strict: true,
            schema: {
              type: "object",
              properties: {
                value: { type: "string" },
              },
              required: ["value"],
              additionalProperties: false,
            },
          },
        },
        max_tokens: maxTokens,
        temperature: Math.min(temperature, 1.5), // Cap at 1.5 for most models
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[AIGenerator] OpenRouter API error: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error("[AIGenerator] Invalid response structure:", JSON.stringify(data, null, 2))
      throw new Error("Invalid response from OpenRouter API: missing choices or message")
    }

    const content = data.choices[0].message.content.trim()
    
    // Clean up any JSON artifacts or error messages
    let cleanedContent = content
    
    // Remove common JSON error patterns
    cleanedContent = cleanedContent.replace(/^```json\s*/i, '')
    cleanedContent = cleanedContent.replace(/^```\s*/i, '')
    cleanedContent = cleanedContent.replace(/\s*```$/i, '')
    cleanedContent = cleanedContent.trim()
    
    // Check for error messages in content
    if (cleanedContent.toLowerCase().includes('error') && 
        (cleanedContent.toLowerCase().includes('parsing') || 
         cleanedContent.toLowerCase().includes('invalid') ||
         cleanedContent.toLowerCase().includes('failed'))) {
      console.warn(`[AIGenerator] Detected error message in response: ${cleanedContent}`)
      throw new Error(`AI returned error message instead of value: ${cleanedContent}`)
    }

    try {
      const parsed = JSON.parse(cleanedContent)
      let value = parsed.value || cleanedContent
      
      // Ensure value is a string
      if (typeof value !== 'string') {
        value = String(value)
      }
      
      // Remove any remaining JSON artifacts
      value = this.cleanValue(value)
      
      // Additional validation for instruction patterns
      const instructionPatterns = [
        /for field:\s*\w+/i,
        /cannot be generated/i,
        /cannot be an empty string/i,
        /please try again/i,
        /value cannot be/i,
        /error/i,
        /failed/i,
      ]
      
      const hasInstructions = instructionPatterns.some(pattern => pattern.test(value))
      if (hasInstructions && retryAttempt < 3) {
        console.warn(`[AIGenerator] Detected instruction patterns in value, retrying: ${value}`)
        return await this.generateFieldValue(context, retryAttempt + 1)
      }
      
      // Check for trailing numbers/timestamps that shouldn't be there
      const hasTrailingNumbers = /_\d+(_\d+)?$/.test(value)
      if (hasTrailingNumbers) {
        // Clean it and log a warning
        const originalValue = value
        value = value.replace(/_\d+(_\d+)?$/g, '').trim()
        console.warn(`[AIGenerator] Removed trailing numbers from value: "${originalValue}" -> "${value}"`)
      }
      
      // Validate value is not empty
      if (!value || value.trim().length === 0) {
        console.warn(`[AIGenerator] Generated empty value, retry attempt: ${retryAttempt}`)
        if (retryAttempt < 3) {
          return await this.generateFieldValue(context, retryAttempt + 1)
        }
        throw new Error(`Generated empty value for field ${context.fieldName} after ${retryAttempt + 1} attempts`)
      }
      
      console.log(`[AIGenerator] Generated: ${value}`)
      return value.trim()
    } catch (e) {
      // If JSON parsing fails, try to extract value from text
      console.warn(`[AIGenerator] JSON parse failed, attempting text extraction: ${e}`)
      
      // Try to extract JSON-like content
      const jsonMatch = cleanedContent.match(/\{[\s\S]*"value"[\s\S]*:[\s\S]*"([^"]+)"[\s\S]*\}/)
      if (jsonMatch && jsonMatch[1]) {
        const extracted = this.cleanValue(jsonMatch[1])
        if (extracted && extracted.trim().length > 0) {
          return extracted.trim()
        }
      }
      
      // Last resort: use cleaned content directly if it looks valid
      const cleaned = this.cleanValue(cleanedContent)
      if (cleaned && cleaned.trim().length > 0 && !cleaned.toLowerCase().includes('error')) {
        console.log(`[AIGenerator] Using cleaned content directly: ${cleaned}`)
        return cleaned.trim()
      }
      
      // If all else fails, retry
      if (retryAttempt < 3) {
        console.log(`[AIGenerator] Retrying generation due to parse error (attempt ${retryAttempt + 1})`)
        return await this.generateFieldValue(context, retryAttempt + 1)
      }
      
      throw new Error(`Failed to parse AI response for field ${context.fieldName}: ${cleanedContent}`)
    }
  }

  private cleanValue(value: string): string {
    if (!value) return ''
    
    // Remove JSON structure artifacts
    let cleaned = String(value)
      .replace(/^\{[\s\S]*"value"[\s\S]*:[\s\S]*"/, '') // Remove opening JSON
      .replace(/"[\s\S]*\}$/, '') // Remove closing JSON
      .replace(/\\n/g, ' ') // Replace newlines
      .replace(/\\t/g, ' ') // Replace tabs
      .replace(/\\"/g, '"') // Unescape quotes
      .replace(/\\\\/g, '\\') // Unescape backslashes
      .trim()
    
    // Remove error messages and instruction patterns
    cleaned = cleaned.replace(/for field:\s*[^,]+/gi, '') // Remove "for field: job_title"
    cleaned = cleaned.replace(/cannot be generated based on[^.]*/gi, '') // Remove constraint errors
    cleaned = cleaned.replace(/cannot be an empty string[^.]*/gi, '') // Remove empty string errors
    cleaned = cleaned.replace(/value cannot be[^.]*/gi, '') // Remove "value cannot be" errors
    cleaned = cleaned.replace(/please try again[^.]*/gi, '') // Remove "please try again"
    cleaned = cleaned.replace(/,\s*value\s*cannot/gi, '') // Remove trailing error messages
    cleaned = cleaned.replace(/,\s*cannot\s*be/gi, '') // Remove trailing "cannot be"
    
    // Remove any text after comma that looks like an error message
    cleaned = cleaned.replace(/,\s*(cannot|error|failed|invalid|unable)[^.]*/gi, '')
    
    // Remove trailing numbers and timestamps added by fallback generation (e.g., "Australia_11_1763030500331")
    cleaned = cleaned.replace(/_\d+_\d+$/g, '') // Remove _number_timestamp pattern
    cleaned = cleaned.replace(/_\d{13}$/g, '') // Remove _timestamp (13 digits)
    cleaned = cleaned.replace(/_\d+$/g, '') // Remove trailing _number (but be careful - might remove valid suffixes)
    
    // Remove any remaining error messages or JSON markers
    cleaned = cleaned.replace(/^error[\s:]*/i, '')
    cleaned = cleaned.replace(/^json[\s:]*/i, '')
    cleaned = cleaned.replace(/\{[^}]*\}/g, '') // Remove any remaining JSON objects
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '') // Remove any remaining JSON arrays
    
    // Remove trailing commas and clean up
    cleaned = cleaned.replace(/,\s*$/, '').trim()
    
    return cleaned.trim()
  }

  private systemPromptFor(context: GenerationContext, exampleData?: string[]): string {
    const ft = context.fieldType
    const fieldName = context.fieldName.toLowerCase()
    let basePrompt = ""
    
    // Check if this is a document/PDF field
    if (ft === 'pdf' || fieldName.includes('resume') || fieldName.includes('cv') || fieldName.includes('document')) {
      basePrompt = `You are a professional document generator. Generate a complete, realistic, and well-formatted ${context.fieldName}.
      
For a resume/CV, include:
- Full contact information (name, email, phone, address)
- Professional summary (2-3 sentences)
- Work experience (2-3 positions with company, role, dates, and bullet points)
- Education (degree, institution, graduation year)
- Skills (relevant technical and soft skills)
- Certifications or achievements if applicable

For other documents, generate complete, professional content appropriate to the document type.

IMPORTANT: 
- Generate UNIQUE content that is different from previous generations
- Ensure all required information is present
- Format the content as a complete document with proper sections and realistic details
- Return the full document content in JSON format with a "value" field
- Never return empty values or error messages`
    } else {
      const prompts: Record<string, string> = {
        name: "You are a name generator. Generate realistic, professional human names. Each name must be unique and different from all previous names. Include proper capitalization. Never generate empty values.",
        first_name: "You are a name generator. Generate realistic first names. Each name must be unique. Use proper capitalization. Never generate empty values.",
        last_name: "You are a name generator. Generate realistic last names. Each name must be unique. Use proper capitalization. Never generate empty values.",
        full_name: "You are a name generator. Generate realistic full names (first and last). Each name must be unique. Use proper capitalization. Never generate empty values.",
        email: "You are an email generator. Generate realistic, professional email addresses. Each email must be unique and follow standard email format (username@domain.com). Never generate empty values.",
        company: "You are a company name generator. Generate realistic business names. Each company name must be unique and professional. Never generate empty values.",
        text: "You are a text generator. Generate short, realistic, professional text snippets. Each snippet must be unique and meaningful. Never generate empty values.",
        long_text: "You are a text generator. Generate realistic, detailed paragraphs (3-5 sentences). Each paragraph must be unique and meaningful. Never generate empty values.",
        description: "You are a description generator. Generate concise, professional descriptions. Each description must be unique and informative. Never generate empty values.",
        phone: "You are a phone number generator. Generate realistic phone numbers in standard formats (e.g., (555) 123-4567 or +1-555-123-4567). Each number must be unique. Never generate empty values.",
        address: "You are an address generator. Generate realistic street addresses with house numbers and street names. Each address must be unique. Never generate empty values.",
        city: "You are a city name generator. Generate realistic city names. Each city must be unique. Never generate empty values.",
        job_title: "You are a job title generator. Generate realistic professional job titles. Each title must be unique. Never generate empty values.",
        industry: "You are an industry generator. Generate realistic industry names. Each industry must be unique. Never generate empty values.",
        url: "You are a URL generator. Generate realistic website URLs (e.g., https://example.com). Each URL must be unique and valid. Never generate empty values.",
        website: "You are a website generator. Generate realistic website URLs (e.g., https://example.com). Each URL must be unique and valid. Never generate empty values.",
      }
      
      basePrompt = prompts[ft] || `You are a data generator. Generate realistic, professional values for field type: ${ft}. Each value must be unique and different from all previous generations. Never generate empty values or error messages. Return only clean, valid data.`
    }
    
    // Add example data context if available
    if (exampleData && exampleData.length > 0) {
      const examples = exampleData.slice(0, 5).join(', ')
      basePrompt += `\n\nUse these examples as inspiration for style and format, but ALWAYS generate something different and unique: ${examples}`
    }
    
    basePrompt += `\n\nCRITICAL RULES:
1. NEVER return empty values - always generate meaningful content
2. NEVER include JSON error messages or parsing information in the value
3. ALWAYS ensure values are unique and different from previous generations
4. ALWAYS return valid, realistic data appropriate for the field type
5. Return ONLY a JSON object with a "value" field containing the clean value`
    
    return basePrompt
  }

  private buildPrompt(context: GenerationContext, exampleData?: string[], retryAttempt: number = 0): string {
    const { fieldName, fieldDescription, existingData, recordIndex, previouslyGeneratedValues } = context
    
    // CHANGED: Don't include "for field: {fieldName}" in the prompt to avoid leakage
    const parts: string[] = [`Generate a unique, realistic value.`]

    if (fieldDescription) {
      parts.push(`Context: ${fieldDescription}`)
    }

    // Add variation instruction based on record index to prevent duplicates
    parts.push(`This is record #${recordIndex + 1}. Generate a UNIQUE value that is completely different from all previous records.`)

    // CRITICAL: List previously generated values to explicitly avoid
    if (previouslyGeneratedValues && previouslyGeneratedValues.length > 0) {
      const avoidList = previouslyGeneratedValues.slice(0, 30).join(', ') // Show up to 30 previous values
      parts.push(`CRITICAL: DO NOT generate any of these values that have already been used:`)
      parts.push(`${avoidList}`)
      parts.push(`Your generated value MUST be completely different from all of these.`)
    }

    if (existingData && Object.keys(existingData).length > 0) {
      const pairs = Object.entries(existingData)
        .filter(([_, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
      if (pairs) {
        parts.push(`Use this context to make the data realistic and consistent: ${pairs}`)
        parts.push(`Ensure the generated value makes logical sense with the provided context.`)
      }
    }

    // Add example data to prompt if available
    if (exampleData && exampleData.length > 0) {
      const examples = exampleData.slice(0, 5).join(', ')
      parts.push(`Use these examples as inspiration for style and format, but generate something COMPLETELY DIFFERENT: ${examples}`)
    }

    // Add variation instruction for retries
    if (retryAttempt > 0) {
      parts.push(`IMPORTANT: This is retry attempt ${retryAttempt + 1}. Generate a COMPLETELY different value than all previous attempts. Be creative and unique.`)
    }

    // Add strict realistic data requirements
    parts.push(`STRICT Requirements:`)
    parts.push(`- Generate ONLY a realistic, professional value appropriate for this field type`)
    parts.push(`- The value MUST be unique and completely different from ALL previously generated values listed above`)
    parts.push(`- If similar values were generated before, use different names, numbers, or phrasing`)
    parts.push(`- The value must be complete and non-empty`)
    parts.push(`- CRITICAL: Return ONLY the value itself - NO field names, NO explanations, NO error messages, NO instructions, NO metadata`)
    parts.push(`- Return ONLY a JSON object with a "value" field containing the clean value`)
    parts.push(`- NEVER reuse any value from the "avoid" list - be creative and generate something new`)
    parts.push(`- NEVER include phrases like "for field:", "cannot be", "error", or any explanatory text in the value`)
    parts.push(`- NEVER include trailing numbers, timestamps, or suffixes in the value`)

    return parts.join("\n")
  }

  async generateBatch(contexts: GenerationContext[]): Promise<string[]> {
    const promises = contexts.map((context) => this.generateFieldValue(context))
    return Promise.all(promises)
  }

  async generatePDFField(context: PDFGenerationContext): Promise<{ url: string; s3Key: string }> {
    const { PDFGenerator } = await import('./pdf-generator')
    const pdfGen = new PDFGenerator()

    if (context.pdfTemplate) {
      const result = await pdfGen.createTemplate(context.pdfTemplate)
      if (!result.success || !result.pdfBase64) {
        throw new Error(result.error || 'PDF template creation failed')
      }
      return { url: result.pdfBase64, s3Key: 'template' }
    } else if (context.pdfBase64) {
      const data = context.existingData || {}
      const result = await pdfGen.fillPDF({ pdfBase64: context.pdfBase64, data })
      if (!result.success || !result.pdfBase64) {
        throw new Error(result.error || 'PDF filling failed')
      }
      return { url: result.pdfBase64, s3Key: 'filled' }
    } else {
      throw new Error('PDF template or base64 PDF required for PDF generation')
    }
  }
}
