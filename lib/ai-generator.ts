import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export interface GenerationContext {
  fieldType: string
  fieldName: string
  fieldDescription?: string
  recordIndex: number
  existingData?: Record<string, any>
  tenantContext?: string
}

export class AIGenerator {
  private openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  })

  private currentModel = "google/gemini-2.5-flash"
  private model = this.openrouter(this.currentModel)

  setModel(modelId: string): void {
    this.currentModel = modelId
    this.model = this.openrouter(modelId)
    console.log(`[AIGenerator] Switched to model: ${modelId}`)
  }

  getCurrentModel(): string {
    return this.currentModel
  }

  async generateFieldValue(context: GenerationContext): Promise<string> {
    const { fieldType, fieldName, fieldDescription, recordIndex, existingData } = context

    try {
      const prompt = this.buildPrompt(context)

      console.log(`[v0] Generating AI content for ${fieldName} with model ${this.currentModel}`)
      console.log(`[v0] Prompt: ${prompt.substring(0, 100)}...`)

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 150, // Increased token limit for better responses
        temperature: 0.3, // Lower temperature for more consistent results
      })

      console.log(`[v0] AI generated for ${fieldName}: ${text}`)

      const cleanedText = text.trim().replace(/^["']|["']$/g, "") // Remove quotes if present
      return cleanedText
    } catch (error) {
      console.error(`[v0] AI generation failed for ${fieldName}:`, error)
      console.error(`[v0] Error details:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        fieldName,
        fieldType,
        model: this.currentModel,
      })

      // Fallback to deterministic generation
      const fallbackValue = this.getFallbackValue(fieldType, fieldName, recordIndex)
      console.log(`[v0] Using fallback value for ${fieldName}: ${fallbackValue}`)
      return fallbackValue
    }
  }

  private buildPrompt(context: GenerationContext): string {
    const { fieldType, fieldName, fieldDescription, recordIndex, existingData } = context

    // Build context from existing data in the record
    const contextInfo = existingData ? this.buildContextFromExistingData(existingData) : ""

    const basePrompts: Record<string, string> = {
      name: `Generate a realistic full name (first and last name).`,
      first_name: `Generate a realistic first name only.`,
      last_name: `Generate a realistic last name only.`,
      email: `Generate a professional email address.`,
      phone: `Generate a phone number in format (XXX) XXX-XXXX.`,
      company: `Generate a realistic company name.`,
      address: `Generate a realistic street address.`,
      city: `Generate a real city name.`,
      country: `Generate a real country name.`,
      job_title: `Generate a realistic job title.`,
      industry: `Generate a realistic industry name.`,
      text: fieldDescription
        ? `Generate realistic content for: ${fieldDescription}`
        : `Generate realistic ${fieldName.replace(/_/g, " ")} content.`,
      long_text: fieldDescription
        ? `Generate a realistic paragraph about: ${fieldDescription}`
        : `Generate a realistic paragraph about ${fieldName.replace(/_/g, " ")}.`,
      url: `Generate a realistic website URL.`,
    }

    const specificPrompt =
      basePrompts[fieldType] || basePrompts[fieldName] || `Generate realistic ${fieldName.replace(/_/g, " ")} content.`

    return `${specificPrompt} ${contextInfo} Return only the generated value, no explanations or quotes.`
  }

  private buildContextFromExistingData(existingData: Record<string, any>): string {
    const relevantFields = ["name", "company", "industry", "job_title", "city", "country"]
    const context = relevantFields
      .filter((field) => existingData[field])
      .map((field) => `${field}: ${existingData[field]}`)
      .join(", ")

    return context ? `Context from this record: ${context}.` : ""
  }

  private getFallbackValue(fieldType: string, fieldName: string, recordIndex: number): string {
    // Deterministic fallback values
    switch (fieldType) {
      case "name":
        return this.generateFallbackName(recordIndex)
      case "email":
        return `user${recordIndex}@example.com`
      case "phone":
        return `(555) ${String(recordIndex).padStart(3, "0")}-${String(recordIndex * 7).slice(-4)}`
      case "company":
        return `Company ${recordIndex + 1}`
      case "address":
        return `${100 + recordIndex} Main Street`
      case "city":
        return ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"][recordIndex % 5]
      case "country":
        return "United States"
      case "job_title":
        return ["Manager", "Director", "Analyst", "Coordinator", "Specialist"][recordIndex % 5]
      case "industry":
        return ["Technology", "Healthcare", "Finance", "Education", "Manufacturing"][recordIndex % 5]
      case "url":
        return `https://website${recordIndex}.com`
      case "text":
      case "long_text":
        return `Sample ${fieldName} content ${recordIndex + 1}`
      default:
        return `${fieldName} ${recordIndex + 1}`
    }
  }

  private generateFallbackName(index: number): string {
    const firstNames = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Avery", "Quinn"]
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"]

    const firstName = firstNames[index % firstNames.length]
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length]

    return `${firstName} ${lastName}`
  }

  async generateBatch(contexts: GenerationContext[]): Promise<string[]> {
    // Generate multiple fields in parallel for better performance
    const promises = contexts.map((context) => this.generateFieldValue(context))
    return Promise.all(promises)
  }
}
