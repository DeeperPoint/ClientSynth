import type { BaseImageProvider } from "./providers/base-provider"
import { FalImageProvider } from "./providers/fal-provider"
import { PlaceholderImageProvider } from "./providers/placeholder-provider"
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
  provider?: "fal" | "placeholder"
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
  private providers: Map<string, BaseImageProvider> = new Map()
  private promptEnhancer: PromptEnhancer
  private s3Uploader: S3Uploader

  constructor() {
    this.promptEnhancer = new PromptEnhancer()
    this.s3Uploader = new S3Uploader()
    this.initializeProviders()
  }

  private initializeProviders() {
    // Always add placeholder provider as fallback
    this.providers.set("placeholder", new PlaceholderImageProvider())

    // Add Fal provider if configured
    try {
      if (process.env.FAL_KEY) {
        const falProvider = new FalImageProvider()
        if (falProvider.validateConfig()) {
          this.providers.set("fal", falProvider)
          console.log("[ImageService] Fal provider initialized")
        }
      }
    } catch (error) {
      console.warn("[ImageService] Failed to initialize Fal provider:", error)
    }

    console.log(`[ImageService] Initialized ${this.providers.size} providers:`, Array.from(this.providers.keys()))
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
      provider = "fal",
      style = "professional",
      count = 1,
    } = request

    try {
      console.log(`[ImageService] Starting image generation for ${fieldName}`)
      console.log(`[ImageService] Requested provider: ${provider}`)

      // Get the provider (fallback to placeholder if requested provider unavailable)
      let selectedProvider = this.providers.get(provider)
      if (!selectedProvider) {
        console.warn(`[ImageService] Provider '${provider}' not available, falling back to placeholder`)
        selectedProvider = this.providers.get("placeholder")!
      }

      // Enhance the prompt
      const enhancedPrompt = await this.promptEnhancer.enhancePrompt({
        basePrompt: prompt,
        recordData,
        fieldDescription,
        style,
      })

      console.log(`[ImageService] Enhanced prompt: ${enhancedPrompt}`)

      // Generate the image
      const generationResult = await selectedProvider.generateImage({
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
    } catch (error) {
      console.error("[ImageService] Image generation failed:", error)
      throw error
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  getSupportedModels(provider?: string): string[] {
    if (provider) {
      const providerInstance = this.providers.get(provider)
      return providerInstance ? providerInstance.getSupportedModels() : []
    }

    // Return all supported models from all providers
    const allModels: string[] = []
    this.providers.forEach((provider, name) => {
      const models = provider.getSupportedModels().map((model) => `${name}:${model}`)
      allModels.push(...models)
    })
    return allModels
  }
}
