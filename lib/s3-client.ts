import { createHash } from "crypto"

interface S3UploadResult {
  key: string
  bucket: string
  md5: string
  size: number
  width?: number
  height?: number
}

export class S3Client {
  private bucket: string
  private region: string
  private accessKeyId: string
  private secretAccessKey: string

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || "client-synth-media"
    this.region = process.env.AWS_REGION || "us-east-1"
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID!
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!

    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error("AWS credentials not configured")
    }
  }

  async uploadImageFromUrl(imageUrl: string, key: string): Promise<S3UploadResult> {
    // Download image from URL
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Calculate MD5 hash
    const md5 = createHash("md5").update(buffer).digest("hex")

    // Get image dimensions (basic implementation)
    const dimensions = await this.getImageDimensions(buffer)

    // Upload to S3 using fetch (simplified approach)
    const uploadUrl = await this.getSignedUploadUrl(key, buffer.length, md5)

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: buffer,
      headers: {
        "Content-Type": "image/png",
        "Content-MD5": Buffer.from(md5, "hex").toString("base64"),
      },
    })

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.status}`)
    }

    return {
      key,
      bucket: this.bucket,
      md5,
      size: buffer.length,
      width: dimensions.width,
      height: dimensions.height,
    }
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    // For now, return a placeholder URL - in production, implement proper S3 signed URLs
    return `https://${this.bucket}.s3.amazonaws.com/${key}?expires=${Date.now() + expiresIn * 1000}`
  }

  private async getSignedUploadUrl(key: string, contentLength: number, md5: string): Promise<string> {
    // Simplified - in production, implement proper S3 signed URL generation
    return `https://${this.bucket}.s3.amazonaws.com/${key}`
  }

  private async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    // Basic PNG dimension reading - in production, use a proper image library
    if (buffer.toString("ascii", 1, 4) === "PNG") {
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      return { width, height }
    }
    return { width: 512, height: 512 } // Default fallback
  }
}
