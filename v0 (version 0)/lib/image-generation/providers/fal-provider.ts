import { BaseImageProvider, type ImageGenerationOptions, type ImageGenerationResult } from "./base-provider"

export class FalImageProvider extends BaseImageProvider {
  private apiKey: string

  constructor() {
    super()
    const apiKey = process.env.FAL_KEY
    if (!apiKey) {
      throw new Error("FAL_KEY environment variable is required")
    }
    this.apiKey = apiKey
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const { prompt, width = 512, height = 512, quality = "standard" } = options

    try {
      console.log("[FalProvider] Generating image with prompt:", prompt)

      const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: `${width}x${height}`,
          num_inference_steps: quality === "hd" ? 50 : 28,
          guidance_scale: 7.5,
          num_images: 1,
        }),
      })

      if (!response.ok) {
        throw new Error(`Fal API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.images || result.images.length === 0) {
        throw new Error("No images returned from Fal API")
      }

      const imageUrl = result.images[0].url
      console.log("[FalProvider] Generated image URL:", imageUrl)

      // Download the generated image
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`)
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      return {
        buffer,
        contentType: "image/png",
        metadata: {
          model: "flux-schnell",
          prompt,
          dimensions: { width, height },
          provider: "fal",
        },
      }
    } catch (error) {
      console.error("[FalProvider] Image generation failed:", error)
      throw error
    }
  }

  getSupportedModels(): string[] {
    return ["flux-schnell", "flux-dev", "flux-pro"]
  }

  validateConfig(): boolean {
    return !!process.env.FAL_KEY
  }
}
