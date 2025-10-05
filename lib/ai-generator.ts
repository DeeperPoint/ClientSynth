export interface GenerationContext {
  fieldType: string
  fieldName: string
  fieldDescription?: string
  recordIndex: number
  existingData?: Record<string, any>
  tenantContext?: string
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
        max_tokens: 100,
        temperature: 0.6,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Invalid response from OpenRouter API: missing choices or message")
    }

    const content = data.choices[0].message.content.trim()

    console.log(`[AIGenerator] Generated: ${content}`)
    return content
  }

  private systemPromptFor(context: GenerationContext): string {
    const ft = context.fieldType
    const prompts: Record<string, string> = {
      name: "Generate realistic human names.",
      email: "Generate realistic email addresses.",
      company: "Generate realistic company names.",
      text: "Generate short, realistic text snippet.",
      description: "Generate concise descriptive text.",
    }
    return prompts[ft] || "Generate realistic data."
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

    parts.push("Return only the value.")
    return parts.join("\n")
  }

  async generateBatch(contexts: GenerationContext[]): Promise<string[]> {
    const promises = contexts.map((context) => this.generateFieldValue(context))
    return Promise.all(promises)
  }
}
