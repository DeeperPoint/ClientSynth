import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import crypto from "crypto"

export interface S3UploadResult {
  key: string
  url: string
  publicUrl: string
  metadata: {
    size: number
    contentType: string
    md5: string
  }
}

export class S3Uploader {
  private s3Client: S3Client
  private bucketName: string

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
    this.bucketName = process.env.AWS_S3_BUCKET!
  }

  async uploadImage(
    imageBuffer: Buffer,
    options: {
      tenantId: string
      jobId: string
      recordId: string
      fieldName: string
      contentType?: string
    },
  ): Promise<S3UploadResult> {
    const { tenantId, jobId, recordId, fieldName, contentType = "image/png" } = options

    // Generate MD5 hash for integrity
    const md5Hash = crypto.createHash("md5").update(imageBuffer).digest("hex")

    // Create structured key path with better organization
    const timestamp = new Date().toISOString().split("T")[0]
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const key = `synthetic-data/${tenantId}/${timestamp}/${jobId}/${recordId}/${fieldName}-${md5Hash.substring(0, 8)}-${randomSuffix}.png`

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType,
        Metadata: {
          tenantId,
          jobId,
          recordId,
          fieldName,
          md5: md5Hash,
          uploadedAt: new Date().toISOString(),
        },
        // Enhanced cache headers and CORS
        CacheControl: "public, max-age=31536000, immutable", // 1 year with immutable
        ContentDisposition: `inline; filename="${fieldName}-${recordId}.png"`,
      })

      await this.s3Client.send(command)

      // Generate public URL with proper region
      const region = process.env.AWS_REGION || "us-east-1"
      const publicUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`

      console.log(`[S3Uploader] Successfully uploaded image: ${key}`)

      return {
        key,
        url: publicUrl,
        publicUrl,
        metadata: {
          size: imageBuffer.length,
          contentType,
          md5: md5Hash,
        },
      }
    } catch (error) {
      console.error("[S3Uploader] Upload failed:", error)
      throw new Error(`Failed to upload image to S3: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  async uploadMultipleImages(
    images: Array<{
      buffer: Buffer
      options: {
        tenantId: string
        jobId: string
        recordId: string
        fieldName: string
        contentType?: string
      }
    }>,
  ): Promise<S3UploadResult[]> {
    const results = await Promise.allSettled(images.map(({ buffer, options }) => this.uploadImage(buffer, options)))

    const successful: S3UploadResult[] = []
    const failed: string[] = []

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successful.push(result.value)
      } else {
        failed.push(`Image ${index + 1}: ${result.reason.message}`)
        console.error(`[S3Uploader] Batch upload failed for image ${index + 1}:`, result.reason)
      }
    })

    if (failed.length > 0) {
      console.warn(`[S3Uploader] ${failed.length} out of ${images.length} uploads failed:`, failed)
    }

    return successful
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })

      return await getSignedUrl(this.s3Client, command, { expiresIn })
    } catch (error) {
      console.error("Failed to generate presigned URL:", error)
      throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  async deleteImage(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })

      await this.s3Client.send(command)
      console.log(`[S3Uploader] Successfully deleted image: ${key}`)
    } catch (error) {
      console.error("Failed to delete image from S3:", error)
      throw new Error(`Failed to delete image: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
}
