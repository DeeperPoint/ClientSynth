import { pool } from "@/lib/database/client"
import { AIGenerator, type GenerationContext } from "@/lib/ai-generator"
import { ImageGenerator } from "@/lib/image-generator"
import { S3Uploader } from "@/lib/s3-uploader"

export interface JobData {
  job_id: string
  tenant_id: string
  schema_id: string
  name: string
  total_records: number
  config: {
    text_model?: string
    image_model?: string
    output_format?: string
    enable_images?: boolean
    images_per_record?: number
    generation_settings?: {
      temperature?: number
      max_tokens?: number
    }
  }
  schema_definition: any
}

export interface GeneratedRecord {
  [key: string]: any
}

export interface JobControlSignal {
  action: "pause" | "resume" | "cancel" | "retry"
  jobId: string
  timestamp: string
}

export interface RetryConfig {
  maxRetries: number
  backoffMultiplier: number
  initialDelay: number
}

export interface JobRecoveryState {
  lastSuccessfulRecord: number
  failedRecords: number[]
  retryAttempts: Record<string, number>
  pausedAt?: string
  resumedAt?: string
}

export class JobProcessor {
  private aiGenerator: AIGenerator
  private imageGenerator = new ImageGenerator()
  private s3Uploader = new S3Uploader()
  private currentJob: JobData | null = null

  private jobControls = new Map<string, JobControlSignal>()
  private recoveryStates = new Map<string, JobRecoveryState>()
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
  }
  private isPaused = false
  private isCancelled = false

  constructor() {
    console.log("[v0] JobProcessor constructor called")
    try {
      console.log("[v0] Environment variables check:", {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      })

      if (!process.env.DATABASE_URL) {
        throw new Error("Missing required DATABASE_URL environment variable")
      }

      console.log("[v0] Initializing AI generator...")
      this.aiGenerator = new AIGenerator()

      console.log("[v0] JobProcessor initialized successfully")
    } catch (error) {
      console.error("[v0] Failed to initialize JobProcessor:", error)
      throw new Error(`JobProcessor initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  // Add cleanup method
  public async cleanup(): Promise<void> {
    console.log("[v0] Cleaning up JobProcessor...")
    
    // Clear current job
    this.currentJob = null
    
    // Clear maps
    this.jobControls.clear()
    this.recoveryStates.clear()
    
    console.log("[v0] JobProcessor cleanup completed")
  }

  private async handleJobControl(signal: JobControlSignal): Promise<void> {
    if (!this.currentJob || this.currentJob.job_id !== signal.jobId) {
      return
    }

    console.log(`[JobProcessor] Received control signal: ${signal.action} for job ${signal.jobId}`)

    switch (signal.action) {
      case "pause":
        await this.pauseJob()
        break
      case "resume":
        await this.resumeJob()
        break
      case "cancel":
        await this.cancelJob()
        break
      case "retry":
        await this.retryJob()
        break
    }
  }

  private async pauseJob(): Promise<void> {
    this.isPaused = true
    console.log(`[JobProcessor] Job ${this.currentJob?.job_id} paused`)
  }

  private async resumeJob(): Promise<void> {
    this.isPaused = false
    console.log(`[JobProcessor] Job ${this.currentJob?.job_id} resumed`)
  }

  private async cancelJob(): Promise<void> {
    this.isCancelled = true
    console.log(`[JobProcessor] Job ${this.currentJob?.job_id} cancelled`)
  }

  private async retryJob(): Promise<void> {
    console.log(`[JobProcessor] Retrying job ${this.currentJob?.job_id}`)
    // Reset job state and continue processing
    this.isPaused = false
    this.isCancelled = false
  }

  public async processNextJob(): Promise<void> {
    console.log("[v0] processNextJob called")
    
    try {
      // Get next job using the local database function
      console.log("[v0] Querying for next job using safe function...")
      const result = await pool.query('SELECT * FROM get_next_job_safe()')
      
      console.log("[v0] Job query result:", { hasJob: result.rows.length > 0 })
      
      if (result.rows.length === 0) {
        console.log("[v0] No jobs to process")
        return
      }

      const jobData = result.rows[0]
      this.currentJob = jobData

      console.log(`[v0] Processing job: ${jobData.job_id} ${jobData.name}`)
      
      // Load recovery state
      const recoveryState = jobData.recovery_state || {
        lastSuccessfulRecord: -1,
        failedRecords: [],
        retryAttempts: {}
      }
      
      console.log("[v0] Loading recovery state:", recoveryState)
      this.recoveryStates.set(jobData.job_id, recoveryState)

      // Process the job
      await this.processJob(jobData)
      
    } catch (error) {
      console.error("[v0] Error processing job:", error)
      throw error
    } finally {
      // Cleanup
      await this.cleanup()
    }
  }

  private async processJob(job: JobData): Promise<void> {
    try {
      console.log(`[v0][SERVER][JobProcessor] Processing job ${job.job_id}: ${job.name}`)
      
      // Set AI models
      const textModel = job.config.text_model || 'google/gemini-2.5-flash'
      const imageModel = job.config.image_model || 'black-forest-labs/flux-1.1-pro'
      
      console.log("[v0] Setting AI models:", { textModel, imageModel })
      this.aiGenerator.setModel(textModel)

      // Update job status to processing (already done by get_next_job_safe)
      console.log("[v0] Job status already updated to processing by get_next_job_safe()")

      // Log job start
      await this.logJobMessage(job.job_id, 'info', 'Started processing job: ' + job.name, {
        textModel,
        imageModel,
        config: job.config
      })

      // Start data generation
      console.log("[v0] Starting data generation...")
      await this.generateData(job)

      // Mark job as completed
      console.log("[v0] Job completed successfully, updating status...")
      await pool.query('SELECT update_job_status($1, $2)', [job.job_id, 'completed'])
      
      await this.logJobMessage(job.job_id, 'info', 'Completed job: ' + job.name, {})

      console.log("[v0] Job processing completed successfully")
      
    } catch (error) {
      console.error("[v0] Job processing failed:", error)
      
      // Update job status to failed
      await pool.query('SELECT update_job_status($1, $2, $3)', [
        job.job_id, 
        'failed', 
        error instanceof Error ? error.message : 'Unknown error'
      ])
      
      await this.logJobMessage(job.job_id, 'error', 'Job failed: ' + (error instanceof Error ? error.message : 'Unknown error'), {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }

  private async generateData(job: JobData): Promise<void> {
    const { total_records, schema_definition } = job
    const fields = schema_definition.fields || []
    
    console.log(`[v0][SERVER][JobProcessor] Generating ${total_records} records for ${fields.length} fields`)
    
    // Prepare generation parameters
    const batchSize = 5
    const startingFrom = 0
    
    console.log("[v0] Schema fields:", fields.map(f => ({ name: f.name, type: f.type })))
    console.log("[v0] Generation parameters:", { batchSize, startingFrom, totalRecords: total_records })
    
    // Process in batches
    for (let batchStart = startingFrom; batchStart < total_records; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, total_records)
      console.log(`[v0] Processing batch ${batchStart}-${batchEnd - 1}`)
      
      const batch = []
      
      for (let i = batchStart; i < batchEnd; i++) {
        console.log(`[v0] Generating record ${i + 1}/${total_records}`)
        
        try {
          const record = await this.generateSingleRecord(i, fields, job)
          batch.push({
            job_id: job.job_id,
            record_data: record
          })
          
          console.log(`[v0] Generated record ${i}:`, record)
          
        } catch (error) {
          console.error(`[v0] Failed to generate record ${i}:`, error)
          // Continue with next record
        }
      }
      
      if (batch.length > 0) {
        console.log(`[v0] Saving batch of ${batch.length} records to database...`)
        await this.saveBatchToDatabase(batch)
        console.log(`[v0] Successfully saved batch to database`)
      }
      
      // Update progress
      const progress = Math.round(((batchEnd) / total_records) * 100)
      await pool.query('SELECT update_job_progress_safe($1, $2, $3)', [
        job.job_id,
        batchEnd,
        progress
      ])
      
      console.log(`[v0][SERVER][JobProcessor] Generated record ${batchEnd}/${total_records} (${progress}%)`)
      
      // Small delay between batches
      if (batchEnd < total_records) {
        console.log("[v0] Waiting 200ms before next batch...")
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    console.log("[v0] Data generation completed")
  }

  private async generateSingleRecord(recordIndex: number, fields: any[], job: JobData): Promise<GeneratedRecord> {
    console.log(`[v0] Generating single record ${recordIndex}`)
    
    const record: GeneratedRecord = {}
    const textFields = fields.filter(f => f.type === 'text')
    const imageFields = fields.filter(f => f.type === 'image')
    
    console.log(`[v0] Processing ${textFields.length} text fields and ${imageFields.length} image fields`)
    
    // Generate text fields
    for (const field of textFields) {
      console.log(`[v0] Generating field: ${field.name} (type: ${field.type})`)
      
      try {
        const value = await this.generateTextField(field, record)
        record[field.name] = value
        console.log(`[v0] Generated field ${field.name}:`, value)
      } catch (error) {
        console.error(`[v0] Failed to generate field ${field.name}:`, error)
        record[field.name] = `Error generating ${field.name}`
      }
    }
    
    // Generate image fields
    if (imageFields.length > 0) {
      console.log(`[v0] Generating ${imageFields.length} image fields with context:`, record)
      
      for (const field of imageFields) {
        console.log(`[v0] Generating AI image for field: ${field.name}`)
        
        try {
          const imageUrl = await this.generateAIImage(field, record, job)
          record[field.name] = imageUrl
          console.log(`[v0] Generated image URL for ${field.name}:`, imageUrl)
        } catch (error) {
          console.error(`[v0] Failed to generate image for ${field.name}:`, error)
          record[field.name] = `Error generating image for ${field.name}`
        }
      }
    }
    
    console.log(`[v0] Completed record ${recordIndex}:`, record)
    return record
  }

  private async generateTextField(field: any, context: GeneratedRecord): Promise<string> {
    console.log(`[v0] Using AI generation for field: ${field.name}`)
    
    const generationContext: GenerationContext = {
      fieldName: field.name,
      fieldType: field.type,
      fieldDescription: field.description || field.name,
      existingData: context,
      schema: field
    }
    
    console.log(`[v0] Generating AI content for ${field.name} with model ${this.aiGenerator.getCurrentModel()}`)
    const prompt = this.aiGenerator.buildPrompt(generationContext)
    console.log(`[v0] Prompt: ${prompt.substring(0, 100)}...`)
    
    const result = await this.aiGenerator.generateContent(generationContext)
    console.log(`[v0] AI generated for ${field.name}:`, result)
    
    return result
  }

  private async generateAIImage(field: any, context: GeneratedRecord, job: JobData): Promise<string> {
    console.log(`[v0][SERVER][JobProcessor] Generating 1 image(s) for ${field.name} using ${job.config.image_model || 'black-forest-labs/flux-1.1-pro'}`)
    
    const imageModel = job.config.image_model || 'black-forest-labs/flux-1.1-pro'
    const contextPrompt = `A ${field.description || field.name} of the person above. Professional, high-quality, realistic photo.`
    
    try {
      const imageResult = await this.imageGenerator.generateImage({
        prompt: contextPrompt,
        model: imageModel,
        size: "1024x1024",
        quality: "high"
      })
      
      if (!imageResult.success || !imageResult.imageUrl) {
        throw new Error('Image generation failed')
      }
      
      // Generate a UUID for the record_id
      const recordId = crypto.randomUUID()
      
      // Insert media record
      const { error: mediaError } = await pool.query(
        'INSERT INTO media (tenant_id, job_id, record_id, s3_key, s3_bucket, md5_hash, file_size, model_name, prompt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          job.tenant_id,
          job.job_id,
          recordId,
          imageResult.s3Key,
          "grainplaza-synthetic-data-bucket",
          imageResult.md5Hash || "",
          imageResult.fileSize || 0,
          imageModel,
          contextPrompt,
        ]
      )
      
      if (mediaError) {
        console.error("[v0] Failed to insert media record:", mediaError)
        throw new Error(`Failed to insert media record: ${mediaError.message}`)
      }
      
      console.log("[v0] Media record inserted successfully")
      
      await this.logJobMessage(job.job_id, 'info', `Generated AI image for field: ${field.name}`, {
        model: imageModel,
        s3Key: imageResult.s3Key,
        prompt: contextPrompt
      })
      
      return imageResult.imageUrl
      
    } catch (error) {
      console.error(`[v0] Failed to generate image for ${field.name}:`, error)
      throw error
    }
  }

  private async saveBatchToDatabase(batch: any[]): Promise<void> {
    try {
      const result = await pool.query('SELECT insert_generated_data_batch($1)', [JSON.stringify(batch)])
      
      if (!result.rows[0].insert_generated_data_batch) {
        throw new Error('Failed to save batch to database')
      }
    } catch (error) {
      console.error("[v0] Failed to save batch to database:", error)
      throw error
    }
  }

  private async logJobMessage(jobId: string, level: string, message: string, metadata: any = {}): Promise<void> {
    try {
      await pool.query(
        'INSERT INTO job_logs (job_id, level, message, metadata) VALUES ($1, $2, $3, $4)',
        [jobId, level, message, JSON.stringify(metadata)]
      )
    } catch (error) {
      console.error("[v0] Failed to log job message:", error)
    }
  }
}
