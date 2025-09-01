import { OpenRouterClient } from "./openrouter-client"
import { S3Client } from "./s3-client"
import { createServerClient } from "./supabase/server"
import { cookies } from "next/headers"

interface GenerateImageOptions {
  tenantId: string
  jobId: string
  recordId: string
  prompt: string
  model: string
  recordData?: Record<string, any>
}

export class ImageGenerator {
  private openRouter: OpenRouterClient
  private s3: S3Client

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY not configured")
    }

    this.openRouter = new OpenRouterClient(apiKey)
    this.s3 = new S3Client()
  }

  async generateAndUploadImage(options: GenerateImageOptions): Promise<string> {
    const { tenantId, jobId, recordId, prompt, model, recordData } = options

    // Enhance prompt with record data context
    const enhancedPrompt = this.enhancePrompt(prompt, recordData)

    try {
      // Generate image via OpenRouter
      const imageUrl = await this.openRouter.generateImage({
        model,
        prompt: enhancedPrompt,
        width: 512,
        height: 512,
      })

      // Generate S3 key
      const timestamp = Date.now()
      const s3Key = `images/${tenantId}/${jobId}/${recordId}/${timestamp}.png`

      // Upload to S3
      const uploadResult = await this.s3.uploadImageFromUrl(imageUrl, s3Key)

      // Save metadata to database
      const supabase = createServerClient(cookies())
      const { error } = await supabase.from("media").insert({
        tenant_id: tenantId,
        job_id: jobId,
        record_id: recordId,
        s3_key: uploadResult.key,
        s3_bucket: uploadResult.bucket,
        md5_hash: uploadResult.md5,
        width: uploadResult.width,
        height: uploadResult.height,
        file_size: uploadResult.size,
        model_name: model,
        prompt: enhancedPrompt,
      })

      if (error) {
        console.error("Failed to save media metadata:", error)
        throw new Error("Failed to save image metadata")
      }

      // Return presigned URL for immediate access
      return await this.s3.getSignedUrl(uploadResult.key)
    } catch (error) {
      console.error("Image generation failed:", error)
      throw error
    }
  }

  private enhancePrompt(basePrompt: string, recordData?: Record<string, any>): string {
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

  async getPresignedUrl(s3Key: string): Promise<string> {
    return await this.s3.getSignedUrl(s3Key)
  }
}
