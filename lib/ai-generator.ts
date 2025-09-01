import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

export interface GenerationContext {
  fieldType: string
  fieldName: string
  fieldDescription?: string
  recordIndex: number
  existingData?: Record<string, any>
  tenantContext?: string
}

export class AIGenerator {
  private model = openai("gpt-4o-mini") // Using cost-effective model for data generation

  async generateFieldValue(context: GenerationContext): Promise<string> {
    const { fieldType, fieldName, fieldDescription, recordIndex, existingData } = context

    try {
      const prompt = this.buildPrompt(context)

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 100,
        temperature: 0.7,
      })

      return text.trim()
    } catch (error) {
      console.error(`AI generation failed for ${fieldName}:`, error)
      // Fallback to deterministic generation
      return this.getFallbackValue(fieldType, fieldName, recordIndex)
    }
  }

  private buildPrompt(context: GenerationContext): string {
    const { fieldType, fieldName, fieldDescription, recordIndex, existingData } = context

    // Build context from existing data in the record
    const contextInfo = existingData ? this.buildContextFromExistingData(existingData) : ""

    const basePrompts: Record<string, string> = {
      name: `Generate a realistic full name for a person. ${contextInfo}`,
      email: `Generate a professional email address. ${contextInfo}`,
      phone: `Generate a realistic phone number in US format (XXX) XXX-XXXX.`,
      company: `Generate a realistic company name. ${contextInfo}`,
      address: `Generate a realistic street address. ${contextInfo}`,
      city: `Generate a realistic city name. ${contextInfo}`,
      country: `Generate a country name. ${contextInfo}`,
      job_title: `Generate a realistic job title. ${contextInfo}`,
      industry: `Generate a business industry name. ${contextInfo}`,
      text: `Generate realistic text content for "${fieldName}". ${fieldDescription ? `Context: ${fieldDescription}` : ""} ${contextInfo}`,
      long_text: `Generate a realistic paragraph of text for "${fieldName}". ${fieldDescription ? `Context: ${fieldDescription}` : ""} ${contextInfo}`,
      url: `Generate a realistic website URL. ${contextInfo}`,
    }

    const specificPrompt =
      basePrompts[fieldType] ||
      `Generate realistic content for a ${fieldType} field named "${fieldName}". ${fieldDescription ? `Description: ${fieldDescription}` : ""}`

    return `${specificPrompt}

Requirements:
- Return ONLY the generated value, no explanations
- Make it realistic and professional
- Ensure variety across different records
- Keep it concise and appropriate

Generate:`
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
