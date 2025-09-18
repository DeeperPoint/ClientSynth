import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export interface PromptEnhancementOptions {
  basePrompt: string
  recordData?: Record<string, any>
  fieldDescription?: string
  style?: "professional" | "casual" | "artistic" | "realistic"
}

export class PromptEnhancer {
  private openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  })

  async enhancePrompt(options: PromptEnhancementOptions): Promise<string> {
    const { basePrompt, recordData, fieldDescription, style = "professional" } = options

    if (!recordData || Object.keys(recordData).length === 0) {
      return this.addStyleToPrompt(basePrompt, style)
    }

    try {
      const contextInfo = this.buildImageContext(recordData)

      const systemPrompt = `Create a detailed image generation prompt for a ${style} image.
      
      Base request: ${basePrompt}
      ${fieldDescription ? `Field description: ${fieldDescription}` : ""}
      Context: ${contextInfo}
      
      Create a specific, detailed prompt that describes:
      - Visual appearance (appropriate for ${style} style)
      - Setting/background (suitable for the context)
      - Lighting and composition
      - Any relevant details based on the provided context
      
      Keep it under 150 words. Focus on visual elements only. Return just the enhanced prompt.`

      const textModel = this.openrouter("google/gemini-2.5-flash")
      const { text } = await generateText({
        model: textModel,
        prompt: systemPrompt,
        maxTokens: 150,
        temperature: 0.6,
      })

      const enhancedPrompt = text.trim()
      console.log(`[PromptEnhancer] AI-enhanced prompt: ${enhancedPrompt}`)
      return enhancedPrompt
    } catch (error) {
      console.error("[PromptEnhancer] Failed to generate enhanced prompt:", error)
      return this.enhancePromptSimple(basePrompt, recordData, style)
    }
  }

  private buildImageContext(recordData: Record<string, any>): string {
    const contextParts: string[] = []

    // Personal information
    if (recordData.name || recordData.first_name) {
      contextParts.push(`Name: ${recordData.name || recordData.first_name}`)
    }
    if (recordData.age) contextParts.push(`Age: ${recordData.age}`)
    if (recordData.gender) contextParts.push(`Gender: ${recordData.gender}`)

    // Professional information
    if (recordData.job_title) contextParts.push(`Job: ${recordData.job_title}`)
    if (recordData.company) contextParts.push(`Company: ${recordData.company}`)
    if (recordData.industry) contextParts.push(`Industry: ${recordData.industry}`)

    // Location information
    if (recordData.city) contextParts.push(`City: ${recordData.city}`)
    if (recordData.country) contextParts.push(`Country: ${recordData.country}`)

    return contextParts.join(", ")
  }

  private enhancePromptSimple(basePrompt: string, recordData?: Record<string, any>, style = "professional"): string {
    let enhancedPrompt = basePrompt

    if (recordData) {
      // Replace placeholders in prompt with actual data
      const replacements: Record<string, string> = {
        "{name}": recordData.name || recordData.first_name || "person",
        "{age}": recordData.age || "30",
        "{gender}": recordData.gender || "person",
        "{profession}": recordData.job_title || recordData.profession || "professional",
        "{company}": recordData.company || "office",
      }

      Object.entries(replacements).forEach(([placeholder, value]) => {
        enhancedPrompt = enhancedPrompt.replace(new RegExp(placeholder, "g"), value)
      })
    }

    return this.addStyleToPrompt(enhancedPrompt, style)
  }

  private addStyleToPrompt(prompt: string, style: string): string {
    const styleModifiers = {
      professional: "Professional, high-quality, clean lighting, business appropriate",
      casual: "Natural, relaxed, warm lighting, approachable",
      artistic: "Creative, artistic composition, dramatic lighting, expressive",
      realistic: "Photorealistic, natural lighting, authentic, detailed",
    }

    return `${prompt}. ${styleModifiers[style as keyof typeof styleModifiers] || styleModifiers.professional}.`
  }
}
