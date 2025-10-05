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
    this.model = model || process.env.OPENROUTER_IMAGE_MODEL || "black-forest-labs/flux-1.1-pro"
    this.s3Uploader = new S3Uploader()
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for image generation")
    }

    const { prompt, seedImageUrl, width = 512, height = 512, quality = "standard" } = options

    console.log("[OpenRouterImageProvider] Generating image with prompt:", prompt)

    try {
      let seedBytes: Buffer | undefined
      let dataUrl: string | undefined

      if (seedImageUrl) {
        seedBytes = await this.loadSeedBytes(seedImageUrl)
        const contentType = "image/png"
        dataUrl = `data:${contentType};base64,${seedBytes.toString("base64")}`
      }

      const result = await this.generateFromSeedUrl(seedImageUrl || "", prompt, quality)

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
      // Download from S3
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

  private async generateFromSeedUrl(
    seedImageUrl: string,
    prompt: string,
    style = "professional",
  ): Promise<GenerationResultData> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required")
    }

    let dataUrl: string | undefined

    if (seedImageUrl) {
      const seedBytes = await this.loadSeedBytes(seedImageUrl)
      const contentType = "image/png"
      dataUrl = `data:${contentType};base64,${seedBytes.toString("base64")}`
    }

    const payloadPrimary: any = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: dataUrl
            ? [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ]
            : prompt,
        },
      ],
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "ClientSynth",
        },
        body: JSON.stringify(payloadPrimary),
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const { outBytes, outType } = await this.extractImageFromResponse(data)

      return {
        content: outBytes,
        contentType: outType,
        width: 512,
        height: 512,
      }
    } catch (error) {
      console.error("[OpenRouterImageProvider] Primary attempt failed:", error)

      const payloadAlt: any = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: dataUrl
              ? [
                  { type: "input_text", text: prompt },
                  { type: "input_image", image_url: { url: dataUrl } },
                ]
              : prompt,
          },
        ],
        modalities: ["image", "text"],
      }

      const response2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "ClientSynth",
        },
        body: JSON.stringify(payloadAlt),
      })

      if (!response2.ok) {
        throw new Error(`OpenRouter API error (alternate): ${response2.status} ${response2.statusText}`)
      }

      const data2 = await response2.json()
      const { outBytes, outType } = await this.extractImageFromResponse(data2)

      return {
        content: outBytes,
        contentType: outType,
        width: 512,
        height: 512,
      }
    }
  }

  private async extractImageFromResponse(data: any): Promise<{ outBytes: Buffer; outType: string }> {
    const choice = (data.choices || [{}])[0]
    const message = choice.message || {}
    const content = message.content

    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === "object" && part.type in ["output_image", "image", "image_url"]) {
          const imgUrl = typeof part.image_url === "object" ? part.image_url.url : part.image_url

          if (imgUrl) {
            if (imgUrl.startsWith("data:")) {
              const [header, b64] = imgUrl.split(",", 1)
              const contentType = header.split(";")[0].split(":")[1]
              return {
                outBytes: Buffer.from(b64, "base64"),
                outType: contentType,
              }
            }

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
      }
    }

    const images = message.images || []
    if (images.length > 0) {
      const imgUrl = images[0].image_url?.url
      if (imgUrl) {
        if (imgUrl.startsWith("data:")) {
          const [header, b64] = imgUrl.split(",", 1)
          const contentType = header.split(";")[0].split(":")[1]
          return {
            outBytes: Buffer.from(b64, "base64"),
            outType: contentType,
          }
        }

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

    throw new Error("No images returned from OpenRouter response")
  }

  getSupportedModels(): string[] {
    return ["black-forest-labs/flux-1.1-pro", "openai/dall-e-3", "stability-ai/stable-diffusion-xl"]
  }

  validateConfig(): boolean {
    return !!this.apiKey
  }
}
