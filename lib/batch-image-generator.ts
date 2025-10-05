import { createClient } from "@/lib/supabase/server"
import { ImageGenerationService, type ImageGenerationRequest } from "./image-generation/image-service"

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

  constructor() {
    this.imageService = new ImageGenerationService()
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
    const supabase = await createClient()

    const { data: seed, error: seedError } = await supabase
      .from("seeds")
      .select("*")
      .eq("id", seedId)
      .eq("tenant_id", tenantId)
      .single()

    if (seedError || !seed) {
      throw new Error(`Seed not found or access denied: ${seedError?.message}`)
    }

    const { data: images, error: imagesError } = await supabase
      .from("seed_images")
      .select("*")
      .eq("seed_id", seedId)
      .order("created_at", { ascending: true })

    if (imagesError) {
      throw new Error(`Failed to fetch seed images: ${imagesError.message}`)
    }

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
