import { ImageGenerationService, type ImageGenerationRequest } from "./image-generation/image-service"
import { query } from "@/lib/postgres/client"

export interface BatchImageGenerationOptions {
  tenantId: string
  seedId: string
  totalOutputs: number
  repeatPerImage?: number
  prompt?: string
  style?: "professional" | "casual" | "artistic" | "realistic"
  jobId?: string
  recordPrefix?: string
  fieldName?: string
  provider?: "fal" | "google-flash" | "placeholder"
}

export interface BatchImageResult {
  sourceImageId: string
  index: number
  url: string
  s3Key: string
  contentType: string
  width?: number
  height?: number
  fileSize: number
}

/**
 * Generate N images by iterating over a seed's images in order, top-to-bottom (insertion/filename order),
 * calling the image provider once per output. If repeat_per_image > 1, use each seed image multiple times before
 * moving to the next one.
 */
export class BatchImageGenerator {
  private imageService: ImageGenerationService
  private listeners: { [event: string]: Array<(data: any) => void> } = {}

  constructor() {
    this.imageService = new ImageGenerationService()
  }

  on(event: 'progress', listener: (data: { total: number; completed: number }) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(listener)
  }

  private emit(event: string, data: any) {
    const fns = this.listeners[event] || []
    for (const fn of fns) fn(data)
  }

  async generateForRecords(args: {
    tenantId: string
    jobId: string
    records: Array<Record<string, any> & { id: string }>
    fieldName: string
    fieldDescription?: string
    provider?: 'fal' | 'google-flash' | 'placeholder'
    model?: string
    batchSize?: number
    continueOnError?: boolean
  }) {
    const {
      tenantId,
      jobId,
      records,
      fieldName,
      provider = 'google-flash',
      model,
      batchSize = 5,
      continueOnError = false,
    } = args

    const total = records.length
    let completed = 0
    const results: Array<{ success: boolean; url?: string; s3Key?: string; error?: string }> = []

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const settled = await Promise.allSettled(
        batch.map((rec) =>
          this.imageService
            .generateAndUploadImage({
              tenantId,
              jobId,
              recordId: rec.id,
              fieldName,
              prompt: args.fieldDescription || 'professional photo',
              provider,
              model: (model as any) || 'gemini-2.0-flash-exp',
            })
            .then((r) => ({ success: true, url: r.url, s3Key: r.s3Key }))
        )
      )

      for (const s of settled) {
        completed++
        if (s.status === 'fulfilled') {
          results.push(s.value)
        } else {
          results.push({ success: false, error: s.reason?.message || 'failed' })
          if (!continueOnError) throw s.reason
        }
        this.emit('progress', { total, completed })
      }
    }

    return results
  }

  async generate(options: BatchImageGenerationOptions): Promise<BatchImageResult[]> {
    const {
      tenantId,
      seedId,
      totalOutputs,
      repeatPerImage = 1,
      prompt = "",
      style = "professional",
      jobId = "batch",
      recordPrefix = "batch",
      fieldName = "image",
      provider = "google-flash",
    } = options

    console.log("[BatchImageGenerator] Starting batch generation:", {
      seedId,
      totalOutputs,
      repeatPerImage,
      provider,
    })

    // Get seed and its images from database
    const seedResult = await query(
      `SELECT * FROM seeds WHERE id = $1 AND tenant_id = $2`,
      [seedId, tenantId]
    )

    const seed = seedResult.rows[0]
    if (!seed) {
      throw new Error(`Seed not found or access denied`)
    }

    const imagesResult = await query(
      `SELECT * FROM seed_images WHERE seed_id = $1 ORDER BY created_at ASC`,
      [seedId]
    )

    const images = imagesResult.rows
    if (!images || images.length === 0) {
      console.warn("[BatchImageGenerator] No seed images found")
      return []
    }

    console.log(`[BatchImageGenerator] Found ${images.length} seed images`)

    const results: BatchImageResult[] = []
    let outIndex = 0

    // Iterate through seed images
    for (const img of images) {
      for (let r = 0; r < repeatPerImage; r++) {
        if (outIndex >= totalOutputs) {
          break
        }

        try {
          console.log(`[BatchImageGenerator] Generating image ${outIndex + 1}/${totalOutputs} from seed ${img.id}`)

          const recordId = `${recordPrefix}-${outIndex}`

          // Generate image using the image service
          const request: ImageGenerationRequest = {
            tenantId,
            jobId,
            recordId,
            fieldName,
            prompt: prompt || `Generate an image based on the seed image`,
            provider,
            style,
            count: 1,
          }

          const result = await this.imageService.generateAndUploadImage(request)

          results.push({
            sourceImageId: img.id,
            index: outIndex,
            url: result.url,
            s3Key: result.s3Key,
            contentType: "image/png",
            width: result.metadata?.dimensions?.width,
            height: result.metadata?.dimensions?.height,
            fileSize: result.fileSize,
          })

          console.log(`[BatchImageGenerator] Generated image ${outIndex}: ${result.url}`)

          outIndex++
        } catch (error) {
          console.error(`[BatchImageGenerator] Failed to generate image ${outIndex}:`, error)
          throw error
        }

        if (outIndex >= totalOutputs) {
          break
        }
      }

      if (outIndex >= totalOutputs) {
        break
      }
    }

    console.log(`[BatchImageGenerator] Batch generation complete: ${results.length} images generated`)

    return results
  }
}
