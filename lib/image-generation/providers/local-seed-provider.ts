import { BaseImageProvider, type ImageGenerationOptions, type ImageGenerationResult } from "./base-provider"
import sharp from "sharp"
import crypto from "crypto"

export class LocalSeedImageProvider extends BaseImageProvider {
  /**
   * Deterministic local provider for tests.
   * Generates solid-color images without reading actual seed bytes.
   */

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const { width = 512, height = 512, prompt = "", style = "professional", seedImageUrl } = options

    if (seedImageUrl) {
      return this.generateFromSeedUrl(seedImageUrl, prompt, style)
    }

    return this.generateFromSeed(width, height, prompt, style)
  }

  private async generateFromSeed(
    width: number,
    height: number,
    prompt: string,
    style: string,
  ): Promise<ImageGenerationResult> {
    const color = style === "professional" ? { r: 0, g: 128, b: 255 } : { r: 200, g: 50, b: 50 }

    const buffer = await sharp({
      create: {
        width: Math.max(1, width),
        height: Math.max(1, height),
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer()

    return {
      buffer,
      contentType: "image/png",
      metadata: {
        model: "local-seed",
        prompt,
        dimensions: { width, height },
        provider: "local-seed",
        quality: "standard",
      },
    }
  }

  private async generateFromSeedUrl(
    seedImageUrl: string,
    prompt: string,
    style: string,
  ): Promise<ImageGenerationResult> {
    try {
      const seedBytes = await this.loadSeedBytes(seedImageUrl)
      const target = 512

      // Resize and apply tint based on prompt hash
      const hash = crypto
        .createHash("md5")
        .update(prompt || "")
        .digest("hex")
      const tint = {
        r: Number.parseInt(hash.slice(0, 2), 16),
        g: Number.parseInt(hash.slice(2, 4), 16),
        b: Number.parseInt(hash.slice(4, 6), 16),
      }

      const buffer = await sharp(seedBytes)
        .resize(target, target, { fit: "contain", background: { r: 0, g: 0, b: 0 } })
        .modulate({ brightness: 1.0 })
        .tint(tint)
        .png()
        .toBuffer()

      return {
        buffer,
        contentType: "image/png",
        metadata: {
          model: "local-seed",
          prompt,
          dimensions: { width: target, height: target },
          provider: "local-seed",
          quality: "standard",
        },
      }
    } catch (error) {
      console.error("[LocalSeedImageProvider] Error processing seed image:", error)
      return this.generateFromSeed(512, 512, prompt, style)
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

    // Try S3 if configured
    if (process.env.AWS_S3_BUCKET && !seedRef.startsWith("http")) {
      const AWS = await import("aws-sdk")
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      })

      const result = await s3
        .getObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: seedRef,
        })
        .promise()

      return Buffer.from(result.Body as Buffer)
    }

    throw new Error(`Unsupported seed image reference: ${seedRef}`)
  }

  getSupportedModels(): string[] {
    return ["local-seed"]
  }

  validateConfig(): boolean {
    return true
  }
}
