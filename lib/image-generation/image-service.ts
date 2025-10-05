import { OpenRouterImageProvider } from "./providers/openrouter-provider"
import { PromptEnhancer } from "./prompt-enhancer"
import { S3Uploader } from "../s3-uploader"

export interface ImageGenerationRequest {
  tenantId: string
  jobId: string
  recordId: string
  fieldName: string
  prompt: string
  recordData?: Record<string, any>
  fieldDescription?: string
  model?: string
  style?: "professional" | "casual" | "artistic" | "realistic"
  count?: number
}

export interface ImageGenerationResult {
  url: string
  s3Key: string
  fileSize: number
  md5Hash?: string
  metadata?: Record<string, any>
}

export class ImageGenerationService {
  private provider: OpenRouterImageProvider
  private promptEnhancer: PromptEnhancer
  private s3Uploader: S3Uploader

  constructor() {
    this.promptEnhancer = new PromptEnhancer()
    this.s3Uploader = new S3Uploader()

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY environment variable is required for image generation")
    }

    this.provider = new OpenRouterImageProvider()
    console.log("[ImageService] OpenRouter provider initialized")
  }

  async generateAndUploadImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const {
      tenantId,
      jobId,
      recordId,
      fieldName,
      prompt,
      recordData,
      fieldDescription,
      style = "professional",
      count = 1,
    } = request

    console.log(`[ImageService] Starting image generation for ${fieldName}`)

    // Enhance the prompt
    const enhancedPrompt = await this.promptEnhancer.enhancePrompt({
      basePrompt: prompt,
      recordData,
      fieldDescription,
      style,
    })

    console.log(`[ImageService] Enhanced prompt: ${enhancedPrompt}`)

    // Generate the image using OpenRouter
    const generationResult = await this.provider.generateImage({
      prompt: enhancedPrompt,
      width: 512,
      height: 512,
      quality: "standard",
      count,
    })

    console.log(`[ImageService] Image generated successfully, size: ${generationResult.buffer.length} bytes`)

    // Upload to S3
    const uploadResult = await this.s3Uploader.uploadImage(generationResult.buffer, {
      tenantId,
      jobId,
      recordId,
      fieldName,
      contentType: generationResult.contentType,
    })

    console.log(`[ImageService] Image uploaded to S3: ${uploadResult.key}`)

    return {
      url: uploadResult.publicUrl,
      s3Key: uploadResult.key,
      fileSize: generationResult.buffer.length,
      md5Hash: uploadResult.md5Hash,
      metadata: {
        ...generationResult.metadata,
        enhancedPrompt,
        originalPrompt: prompt,
      },
    }
  }

  getAvailableProviders(): string[] {
    return ["openrouter"]
  }

  getSupportedModels(): string[] {
    return this.provider.getSupportedModels()
  }
}
