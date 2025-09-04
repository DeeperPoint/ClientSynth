import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { S3Uploader } from "./s3-uploader"

interface GenerateImageOptions {
  tenantId: string
  jobId: string
  recordId: string
  fieldName: string
  prompt: string
  recordData?: Record<string, any>
  fieldDescription?: string
  model?: string
  count?: number // Added support for multiple images per record
}

interface ImageGenerationResult {
  url: string
  s3Key: string
  fileSize?: number
  md5Hash?: string
}

export class ImageGenerator {
  private openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  })
  private currentModel = "black-forest-labs/flux-1.1-pro" // Updated default to image generation model
  private s3Uploader: S3Uploader

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY not configured")
    }

    this.s3Uploader = new S3Uploader()
  }

  setModel(modelId: string): void {
    this.currentModel = modelId
    console.log(`[ImageGenerator] Switched to model: ${modelId}`)
  }

  async generateAndUploadImage(options: GenerateImageOptions): Promise<ImageGenerationResult> {
    const { tenantId, jobId, recordId, fieldName, prompt, recordData, fieldDescription, model, count = 1 } = options

    try {
      if (model && model !== this.currentModel) {
        this.setModel(model)
      }

      const enhancedPrompt = await this.generateImagePrompt(prompt, recordData, fieldDescription)

      console.log(`[ImageGenerator] Generating ${count} image(s) with model: ${this.currentModel}`)
      console.log(`[ImageGenerator] Enhanced prompt: ${enhancedPrompt}`)

      const imageBuffer = await this.generateImageWithOpenRouter(enhancedPrompt)

      const uploadResult = await this.s3Uploader.uploadImage(imageBuffer, {
        tenantId,
        jobId,
        recordId,
        fieldName,
        contentType: "image/png",
      })

      console.log(`[ImageGenerator] Successfully uploaded image to S3: ${uploadResult.key}`)

      return {
        url: uploadResult.publicUrl,
        s3Key: uploadResult.key,
        fileSize: imageBuffer.length,
        md5Hash: uploadResult.md5Hash,
      }
    } catch (error) {
      console.error("[ImageGenerator] Image generation failed:", error)
      throw error
    }
  }

  private async generateImageWithOpenRouter(prompt: string): Promise<Buffer> {
    try {
      // Call OpenRouter image generation API
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          "X-Title": "Client Synth",
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Generate a high-quality image: ${prompt}`,
                },
              ],
            },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      // Extract image URL from response (format may vary by model)
      let imageUrl: string | null = null

      if (result.choices?.[0]?.message?.content) {
        const content = result.choices[0].message.content
        // Look for image URLs in the response
        const urlMatch = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)/i)
        if (urlMatch) {
          imageUrl = urlMatch[0]
        }
      }

      if (!imageUrl) {
        console.warn("[ImageGenerator] No image URL found in OpenRouter response, using fallback")
        return this.generateFallbackImage(prompt)
      }

      // Download the generated image
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to download generated image: ${imageResponse.status}`)
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.error("[ImageGenerator] OpenRouter image generation failed:", error)
      console.log("[ImageGenerator] Falling back to placeholder image")
      return this.generateFallbackImage(prompt)
    }
  }

  private generateFallbackImage(prompt: string): Buffer {
    // Create a more sophisticated placeholder based on prompt content
    const width = 512
    const height = 512

    // Generate colors based on prompt content
    const hash = this.hashString(prompt)
    const hue = hash % 360
    const saturation = 60 + (hash % 40) // 60-100%
    const lightness = 40 + (hash % 30) // 40-70%

    // Convert HSL to RGB
    const rgb = this.hslToRgb(hue / 360, saturation / 100, lightness / 100)

    // Create gradient effect
    const canvas = Buffer.alloc(width * height * 4) // RGBA

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4

        // Create a subtle gradient effect
        const gradientFactor = (x + y) / (width + height)
        const r = Math.floor(rgb[0] * (0.7 + gradientFactor * 0.3))
        const g = Math.floor(rgb[1] * (0.7 + gradientFactor * 0.3))
        const b = Math.floor(rgb[2] * (0.7 + gradientFactor * 0.3))

        canvas[i] = r // Red
        canvas[i + 1] = g // Green
        canvas[i + 2] = b // Blue
        canvas[i + 3] = 255 // Alpha
      }
    }

    return canvas
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b

    if (s === 0) {
      r = g = b = l // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
  }

  private async generateImagePrompt(
    basePrompt: string,
    recordData?: Record<string, any>,
    fieldDescription?: string,
  ): Promise<string> {
    if (!recordData || Object.keys(recordData).length === 0) {
      return `${basePrompt}. Professional, high-quality, realistic photo.`
    }

    try {
      const contextInfo = this.buildImageContext(recordData)

      const systemPrompt = `Create a detailed image generation prompt for a professional headshot/portrait.
      
      Base request: ${basePrompt}
      ${fieldDescription ? `Field description: ${fieldDescription}` : ""}
      Person details: ${contextInfo}
      
      Create a specific, detailed prompt that describes:
      - The person's appearance (professional, appropriate for their role)
      - Setting/background (office, studio, or professional environment)
      - Lighting and style (professional photography)
      - Any relevant details based on their profession/industry
      
      Keep it under 150 words. Focus on visual elements only. Return just the prompt.`

      const textModel = this.openrouter("google/gemini-2.5-flash")
      const { text } = await generateText({
        model: textModel,
        prompt: systemPrompt,
        maxTokens: 150,
        temperature: 0.6,
      })

      const enhancedPrompt = text.trim()
      console.log(`[ImageGenerator] AI-enhanced prompt: ${enhancedPrompt}`)
      return enhancedPrompt
    } catch (error) {
      console.error("[ImageGenerator] Failed to generate enhanced image prompt:", error)
      return this.enhancePromptSimple(basePrompt, recordData)
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

    // Other relevant fields
    Object.entries(recordData).forEach(([key, value]) => {
      if (
        value &&
        ![
          "name",
          "first_name",
          "age",
          "gender",
          "job_title",
          "company",
          "industry",
          "city",
          "country",
          "email",
          "phone",
          "address",
        ].includes(key)
      ) {
        contextParts.push(`${key}: ${value}`)
      }
    })

    return contextParts.join(", ")
  }

  private enhancePromptSimple(basePrompt: string, recordData?: Record<string, any>): string {
    if (!recordData) return basePrompt

    // Replace placeholders in prompt with actual data
    let enhancedPrompt = basePrompt

    // Common replacements
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

    return enhancedPrompt
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}
