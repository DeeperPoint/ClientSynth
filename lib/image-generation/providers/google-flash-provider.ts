import { GoogleGenAI } from "@google/genai"
import { BaseImageProvider, type ImageGenerationOptions, type ImageGenerationResult } from "./base-provider"

export class GoogleFlashProvider extends BaseImageProvider {
  private client: GoogleGenAI
  private model = "gemini-2.0-flash-exp"

  constructor() {
    super()
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY environment variable is required")
    }
    this.client = new GoogleGenAI({ apiKey })
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const { prompt, width = 512, height = 512, quality = "standard" } = options

    try {
      console.log("[GoogleFlashProvider] Generating image with prompt:", prompt)

      // Generate image using Gemini 2.0 Flash native image generation.
      //
      // `models.get(name)` resolves model *metadata* and has no
      // generateContent method — calling it that way could never have worked.
      // The generation entry point is `models.generateContent`, with the model
      // named in the request.
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          responseModalities: ["Image"],
          temperature: quality === "hd" ? 0.4 : 0.7,
        },
      })

      // Extract the generated image from the response
      const imagePart = result.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData)

      if (!imagePart || !imagePart.inlineData) {
        throw new Error("No image data returned from Google Flash API")
      }

      // Convert base64 image data to Buffer. `data` is optional on the SDK
      // type, so an inlineData part with no payload must be rejected rather
      // than silently decoded into an empty buffer.
      const base64Data = imagePart.inlineData.data
      if (!base64Data) {
        throw new Error("No image data returned from Google Flash API")
      }
      const buffer = Buffer.from(base64Data, "base64")

      console.log("[GoogleFlashProvider] Generated image successfully, size:", buffer.length, "bytes")

      return {
        buffer,
        contentType: imagePart.inlineData.mimeType || "image/png",
        metadata: {
          model: this.model,
          prompt,
          dimensions: { width, height },
          provider: "google-flash",
          quality,
        },
      }
    } catch (error) {
      console.error("[GoogleFlashProvider] Image generation failed:", error)
      throw error
    }
  }

  getSupportedModels(): string[] {
    return ["gemini-2.0-flash-exp"]
  }

  validateConfig(): boolean {
    return !!process.env.GOOGLE_AI_API_KEY
  }
}
