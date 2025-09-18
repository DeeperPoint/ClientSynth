export interface ImageGenerationOptions {
  prompt: string
  width?: number
  height?: number
  quality?: "standard" | "hd"
  style?: "natural" | "vivid"
  count?: number
}

export interface ImageGenerationResult {
  buffer: Buffer
  contentType: string
  metadata?: Record<string, any>
}

export abstract class BaseImageProvider {
  abstract generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult>
  abstract getSupportedModels(): string[]
  abstract validateConfig(): boolean
}
