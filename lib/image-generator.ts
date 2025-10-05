import {
  ImageGenerationService,
  type ImageGenerationRequest,
  type ImageGenerationResult,
} from "./image-generation/image-service"

// Legacy wrapper for backward compatibility
export class ImageGenerator {
  private service: ImageGenerationService

  constructor() {
    this.service = new ImageGenerationService()
  }

  async generateAndUploadImage(options: {
    tenantId: string
    jobId: string
    recordId: string
    fieldName: string
    prompt: string
    recordData?: Record<string, any>
    fieldDescription?: string
    model?: string
    count?: number
  }): Promise<ImageGenerationResult> {
    const request: ImageGenerationRequest = {
      ...options,
      provider: "google-flash",
      style: "professional",
    }

    return this.service.generateAndUploadImage(request)
  }

  setModel(modelId: string): void {
    console.log(`[ImageGenerator] Model setting is now handled by provider selection: ${modelId}`)
  }
}
