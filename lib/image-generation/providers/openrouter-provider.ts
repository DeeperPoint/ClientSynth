import { BaseImageProvider, type ImageGenerationOptions, type ImageGenerationResult } from "./base-provider"
import { S3Uploader } from "@/lib/s3-uploader"

interface GenerationResultData {
  content: Buffer
  contentType: string
  width: number
  height: number
}

export class OpenRouterImageProvider extends BaseImageProvider {
  private apiKey: string | undefined
  private model: string
  private s3Uploader: S3Uploader

  constructor(apiKey?: string, model?: string) {
    super()
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY
    this.model = model || process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image"
    this.s3Uploader = new S3Uploader()
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for image generation")
    }

    const { prompt, seedImageUrl, width = 512, height = 512, quality = "standard" } = options

    console.log("[OpenRouterImageProvider] Generating image with model:", this.model)
    console.log("[OpenRouterImageProvider] Prompt:", prompt)

    try {
      const result = await this.generateFromPrompt(seedImageUrl, prompt, quality)

      return {
        buffer: result.content,
        contentType: result.contentType,
        metadata: {
          model: this.model,
          prompt,
          dimensions: { width: result.width, height: result.height },
          provider: "openrouter",
          quality,
        },
      }
    } catch (error) {
      console.error("[OpenRouterImageProvider] Image generation failed:", error)
      throw error
    }
  }

  private async loadSeedBytes(seedRef: string): Promise<Buffer> {
    if (seedRef.startsWith("file://")) {
      const path = seedRef.slice(7)
      const fs = await import("fs/promises")
      const data = await fs.readFile(path)
      return Buffer.from(data)
    }

    if (seedRef.startsWith("http://") || seedRef.startsWith("https://")) {
      const response = await fetch(seedRef)
      if (!response.ok) {
        throw new Error(`Failed to fetch seed image: ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }

    if (process.env.AWS_S3_BUCKET && !seedRef.startsWith("http")) {
      const s3Key = seedRef
      const AWS = await import("aws-sdk")
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      })

      const result = await s3
        .getObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
        })
        .promise()

      return Buffer.from(result.Body as Buffer)
    }

    throw new Error(`Unsupported seed image reference: ${seedRef}`)
  }

  private async generateFromPrompt(
    seedImageUrl: string | undefined,
    prompt: string,
    style = "professional",
  ): Promise<GenerationResultData> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required")
    }

    console.log("[v0] Building OpenRouter request...")

    // Build message content according to OpenRouter docs
    let messageContent: any

    if (seedImageUrl) {
      // Image + text → image (image-conditioned generation)
      console.log("[v0] Loading seed image for conditioning...")
      const seedBytes = await this.loadSeedBytes(seedImageUrl)
      const dataUrl = `data:image/png;base64,${seedBytes.toString("base64")}`

      // Text first, then image (as recommended by docs)
      messageContent = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ]
    } else {
      // Text → image (simple generation)
      messageContent = prompt
    }

    const payload = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
      modalities: ["image", "text"], // Required for image generation
    }

    console.log("[v0] Sending request to OpenRouter...")
    console.log("[v0] Model:", this.model)
    console.log("[v0] Has seed image:", !!seedImageUrl)

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_TITLE || "ClientSynth",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] OpenRouter API error response:", errorText)
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Received response from OpenRouter")

    const { outBytes, outType } = await this.extractImageFromResponse(data)

    console.log("[v0] Successfully extracted image, size:", outBytes.length, "bytes")

    return {
      content: outBytes,
      contentType: outType,
      width: 1024, // Gemini 2.5 Flash Image default
      height: 1024,
    }
  }

  private async extractImageFromResponse(data: any): Promise<{ outBytes: Buffer; outType: string }> {
    console.log("[v0] Extracting image from response...")

    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error("No choices in OpenRouter response")
    }

    const message = choice.message
    if (!message) {
      throw new Error("No message in OpenRouter response")
    }

    // Check for images array (primary format according to docs)
    const images = message.images || []
    if (images.length > 0) {
      console.log("[v0] Found images array with", images.length, "image(s)")
      const imgUrl = images[0].image_url?.url || images[0].url

      if (imgUrl) {
        if (imgUrl.startsWith("data:")) {
          // Base64 data URL
          const [header, b64] = imgUrl.split(",", 2)
          const contentType = header.match(/data:([^;]+)/)?.[1] || "image/png"
          console.log("[v0] Decoding base64 image, type:", contentType)
          return {
            outBytes: Buffer.from(b64, "base64"),
            outType: contentType,
          }
        }

        // External URL
        console.log("[v0] Fetching image from URL:", imgUrl.substring(0, 50) + "...")
        const r2 = await fetch(imgUrl)
        if (!r2.ok) {
          throw new Error(`Failed to fetch image URL: ${r2.statusText}`)
        }
        const arrayBuffer = await r2.arrayBuffer()
        return {
          outBytes: Buffer.from(arrayBuffer),
          outType: r2.headers.get("content-type") || "image/png",
        }
      }
    }

    // Fallback: check content array
    const content = message.content
    if (Array.isArray(content)) {
      console.log("[v0] Checking content array...")
      for (const part of content) {
        if (typeof part === "object" && part.type === "image_url") {
          const imgUrl = part.image_url?.url
          if (imgUrl && imgUrl.startsWith("data:")) {
            const [header, b64] = imgUrl.split(",", 2)
            const contentType = header.match(/data:([^;]+)/)?.[1] || "image/png"
            return {
              outBytes: Buffer.from(b64, "base64"),
              outType: contentType,
            }
          }
        }
      }
    }

    console.error("[v0] Response structure:", JSON.stringify(data, null, 2))
    throw new Error("No images returned from OpenRouter response")
  }

  getSupportedModels(): string[] {
    return ["google/gemini-2.5-flash-image", "openai/dall-e-3", "stability-ai/stable-diffusion-xl", "stability-ai/stable-diffusion-3"]
  }

  validateConfig(): boolean {
    return !!this.apiKey
  }
}
