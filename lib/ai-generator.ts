export interface GenerationContext {
  fieldType: string
  fieldName: string
  fieldDescription?: string
  recordIndex: number
  existingData?: Record<string, any>
  tenantContext?: string
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

  setModel(modelId: string): void {
    this.model = modelId
    console.log(`[AIGenerator] Switched to model: ${modelId}`)
  }

  getCurrentModel(): string {
    return this.model
  }

  async generateFieldValue(context: GenerationContext): Promise<string> {
    const system = this.systemPromptFor(context)
    const prompt = this.buildPrompt(context)

    console.log(`[AIGenerator] Generating with OpenRouter: ${this.model}`)

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
        max_tokens: 150,
        temperature: 0.7,
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
    try {
      const parsed = JSON.parse(content)
      const value = parsed.value || content
      console.log(`[AIGenerator] Generated: ${value}`)
      return value
    } catch (e) {
      // Fallback if not JSON
      console.log(`[AIGenerator] Generated (non-JSON): ${content}`)
      return content
    }
  }

  private systemPromptFor(context: GenerationContext): string {
    const ft = context.fieldType
    const prompts: Record<string, string> = {
      name: "Generate realistic human names. Return only the name value in JSON format.",
      email: "Generate realistic email addresses. Return only the email value in JSON format.",
      company: "Generate realistic company names. Return only the company name in JSON format.",
      text: "Generate short, realistic text snippet. Return only the text value in JSON format.",
      description: "Generate concise descriptive text. Return only the description in JSON format.",
    }
    return prompts[ft] || "Generate realistic data. Return only the value in JSON format."
  }

  private buildPrompt(context: GenerationContext): string {
    const { fieldName, fieldDescription, existingData } = context
    const parts: string[] = [`Field: ${fieldName}`]

    if (fieldDescription) {
      parts.push(`Description: ${fieldDescription}`)
    }

    if (existingData && Object.keys(existingData).length > 0) {
      const pairs = Object.entries(existingData)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
      if (pairs) {
        parts.push(`Context: ${pairs}`)
      }
    }

    parts.push('Return a JSON object with a "value" field containing only the generated value.')
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
