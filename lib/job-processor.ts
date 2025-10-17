import { query, withTransaction } from "@/lib/postgres/client"
import { AIGenerator, type GenerationContext, type PDFGenerationContext } from "@/lib/ai-generator"
import { ImageGenerator } from "@/lib/image-generator"
import { S3Uploader } from "@/lib/s3-uploader"
import { PDFGenerator } from "@/lib/pdf-generator"

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
  private pdfGenerator = new PDFGenerator()
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
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
        hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        hasAwsBucket: !!process.env.AWS_S3_BUCKET,
        hasAwsRegion: !!process.env.AWS_REGION,
      })

      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is required")
      }

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET environment variable is required")
      }

      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY environment variable is required for AI generation")
      }

      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
        console.warn("[v0] AWS credentials not fully configured. Image upload may fail.")
        console.warn("[v0] Missing:", {
          accessKey: !process.env.AWS_ACCESS_KEY_ID,
          secretKey: !process.env.AWS_SECRET_ACCESS_KEY,
          bucket: !process.env.AWS_S3_BUCKET,
        })
      }

      console.log("[v0] Initializing AI generator...")
      this.aiGenerator = new AIGenerator()

      console.log("[v0] Setting up job control listener...")
      this.setupJobControlListener()

      console.log("[v0] JobProcessor initialized successfully")
    } catch (error) {
      console.error("[v0] Failed to initialize JobProcessor:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      throw new Error(
        `JobProcessor initialization failed: ${errorMessage}. Check environment variables and database connection.`,
      )
    }
  }

  private setupJobControlListener(): void {
    // For PostgreSQL, we'll implement a polling mechanism
    // In a production environment, you might use WebSockets or Server-Sent Events
    setInterval(async () => {
      try {
        const result = await query(`
          SELECT * FROM job_controls 
          WHERE processed_at IS NULL 
          AND job_id = $1
          ORDER BY created_at ASC
          LIMIT 1
        `, [this.currentJob?.job_id])
        
        if (result.rows.length > 0) {
          const control = result.rows[0]
          const signal: JobControlSignal = {
            action: control.action,
            jobId: control.job_id,
            timestamp: control.created_at
          }
          await this.handleJobControl(signal)
          
          // Mark as processed
          await query(`
            UPDATE job_controls 
            SET processed_at = NOW() 
            WHERE id = $1
          `, [control.id])
        }
      } catch (error) {
        console.error('Error checking job controls:', error)
      }
    }, 5000) // Check every 5 seconds
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
        await this.retryFailedRecords()
        break
    }
  }

  private async pauseJob(): Promise<void> {
    if (!this.currentJob) return

    this.isPaused = true
    const recoveryState = this.getRecoveryState(this.currentJob.job_id)
    recoveryState.pausedAt = new Date().toISOString()

    await query(`
      UPDATE jobs 
      SET status = 'paused', recovery_state = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(recoveryState), this.currentJob.job_id])

    await this.logJobMessage(this.currentJob.job_id, "info", "Job paused by user request")
  }

  private async resumeJob(): Promise<void> {
    if (!this.currentJob) return

    this.isPaused = false
    const recoveryState = this.getRecoveryState(this.currentJob.job_id)
    recoveryState.resumedAt = new Date().toISOString()

    await query(`
      UPDATE jobs 
      SET status = 'running', recovery_state = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(recoveryState), this.currentJob.job_id])

    await this.logJobMessage(this.currentJob.job_id, "info", "Job resumed by user request")
  }

  private async cancelJob(): Promise<void> {
    if (!this.currentJob) return

    this.isCancelled = true
    const recoveryState = this.getRecoveryState(this.currentJob.job_id)

    await query(`
      UPDATE jobs 
      SET status = 'cancelled', completed_at = NOW(), recovery_state = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(recoveryState), this.currentJob.job_id])

    await this.logJobMessage(this.currentJob.job_id, "info", "Job cancelled by user request")
    this.currentJob = null
  }

  private async retryFailedRecords(): Promise<void> {
    if (!this.currentJob) return

    const recoveryState = this.getRecoveryState(this.currentJob.job_id)
    const failedRecords = recoveryState.failedRecords

    if (failedRecords.length === 0) {
      await this.logJobMessage(this.currentJob.job_id, "info", "No failed records to retry")
      return
    }

    await this.logJobMessage(this.currentJob.job_id, "info", `Retrying ${failedRecords.length} failed records`)

    const fields = this.currentJob.schema_definition?.fields || []

    for (const recordIndex of failedRecords) {
      if (this.isCancelled || this.isPaused) break

      try {
        const record = await this.generateSingleRecord(fields, recordIndex, this.currentJob)

        await query(`
          INSERT INTO generated_data (job_id, tenant_id, record_data, record_index, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [this.currentJob.job_id, this.currentJob.tenant_id, JSON.stringify(record), recordIndex])

        recoveryState.failedRecords = recoveryState.failedRecords.filter((i) => i !== recordIndex)

        await this.logJobMessage(this.currentJob.job_id, "info", `Successfully retried record ${recordIndex}`)
      } catch (error) {
        const retryCount = (recoveryState.retryAttempts[recordIndex.toString()] || 0) + 1
        recoveryState.retryAttempts[recordIndex.toString()] = retryCount

        if (retryCount >= this.retryConfig.maxRetries) {
          await this.logJobMessage(
            this.currentJob.job_id,
            "error",
            `Record ${recordIndex} failed after ${retryCount} retry attempts`,
            { error: error instanceof Error ? error.message : "Unknown error" },
          )
        } else {
          await this.logJobMessage(
            this.currentJob.job_id,
            "warning",
            `Retry ${retryCount}/${this.retryConfig.maxRetries} failed for record ${recordIndex}`,
            { error: error instanceof Error ? error.message : "Unknown error" },
          )
        }
      }
    }

    await query(`
      UPDATE jobs 
      SET recovery_state = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(recoveryState), this.currentJob.job_id])
  }

  private getRecoveryState(jobId: string): JobRecoveryState {
    if (!this.recoveryStates.has(jobId)) {
      this.recoveryStates.set(jobId, {
        lastSuccessfulRecord: -1,
        failedRecords: [],
        retryAttempts: {},
      })
    }
    return this.recoveryStates.get(jobId)!
  }

  private calculateRetryDelay(attempt: number): number {
    return this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1)
  }

  async processNextJob(): Promise<boolean> {
    console.log("[v0] processNextJob called")
    try {
      console.log("[v0] Querying for pending jobs...")
      const result = await query(`
        SELECT 
          j.id,
          j.tenant_id,
          j.schema_id,
          j.name,
          j.total_records,
          j.config,
          j.recovery_state,
          s.schema_definition
        FROM jobs j
        INNER JOIN schemas s ON j.schema_id = s.id
        WHERE j.status IN ('pending', 'paused')
        ORDER BY j.created_at ASC
        LIMIT 1
      `)

      if (result.rows.length === 0) {
        console.log("[v0] No pending jobs found")
        return false
      }

      const jobRow = result.rows[0]
      console.log("[v0] Processing job:", jobRow.id, jobRow.name)

      const job: JobData = {
        job_id: jobRow.id,
        tenant_id: jobRow.tenant_id,
        schema_id: jobRow.schema_id,
        name: jobRow.name,
        total_records: jobRow.total_records,
        config: jobRow.config || {},
        schema_definition: jobRow.schema_definition,
      }

      console.log("[v0] Job data prepared:", {
        jobId: job.job_id,
        totalRecords: job.total_records,
        fieldsCount: job.schema_definition?.fields?.length || 0,
        config: job.config,
      })

      this.currentJob = job
      this.isPaused = false
      this.isCancelled = false

      if (jobRow.recovery_state) {
        console.log("[v0] Loading recovery state:", jobRow.recovery_state)
        this.recoveryStates.set(job.job_id, jobRow.recovery_state)
      }

      console.log(`[v0][SERVER][JobProcessor] Processing job ${job.job_id}: ${job.name}`)

      const textModel = job.config.text_model || "google/gemini-2.5-flash"
      const imageModel = job.config.image_model || "google/gemini-2.5-flash-image-preview"

      console.log("[v0] Setting AI models:", { textModel, imageModel })
      this.aiGenerator.setModel(textModel)

      console.log("[v0] Updating job status to running...")
      await query(`
        UPDATE jobs 
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [job.job_id])

      await this.logJobMessage(job.job_id, "info", `Started processing job: ${job.name}`, {
        textModel,
        imageModel,
        config: job.config,
      })

      console.log("[v0] Starting data generation...")
      await this.generateData(job)

      if (!this.isCancelled && !this.isPaused) {
        console.log("[v0] Job completed successfully, updating status...")
        await query(`
          UPDATE jobs 
          SET status = 'completed', completed_at = NOW(), progress = 100, updated_at = NOW()
          WHERE id = $1
        `, [job.job_id])

        await this.logJobMessage(job.job_id, "info", `Completed job: ${job.name}`)
        console.log("[v0] Job processing completed successfully")
      }

      this.currentJob = null
      return true
    } catch (error) {
      console.error("[v0][SERVER][JobProcessor] Error processing job:", error)

      if (this.currentJob) {
        const recoveryState = this.getRecoveryState(this.currentJob.job_id)

        console.log("[v0] Updating job status to failed...")
        await query(`
          UPDATE jobs 
          SET status = 'failed', error_message = $1, completed_at = NOW(), recovery_state = $2, updated_at = NOW()
          WHERE id = $3
        `, [error instanceof Error ? error.message : "Unknown error", JSON.stringify(recoveryState), this.currentJob.job_id])

        await this.logJobMessage(
          this.currentJob.job_id,
          "error",
          `Job failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          {
            error: error instanceof Error ? error.stack : error,
            recoveryState: recoveryState,
          },
        )
      }

      this.currentJob = null
      return false
    }
  }

  private async generateData(job: JobData): Promise<void> {
    const { schema_definition, total_records, job_id, tenant_id, config } = job
    const fields = schema_definition?.fields || []

    console.log(`[v0][SERVER][JobProcessor] Generating ${total_records} records for ${fields.length} fields`)
    console.log(
      "[v0] Schema fields:",
      fields.map((f: any) => ({ name: f.name, type: f.type })),
    )

    const batchSize = Math.min((config as any).batch_size || 5, 10)
    const recoveryState = this.getRecoveryState(job_id)
    let generatedCount = recoveryState.lastSuccessfulRecord + 1

    console.log("[v0] Generation parameters:", {
      batchSize,
      startingFrom: generatedCount,
      totalRecords: total_records,
    })

    for (let i = generatedCount; i < total_records; i += batchSize) {
      if (this.isCancelled) {
        console.log("[v0] Job generation cancelled")
        await this.logJobMessage(job_id, "info", "Job generation cancelled")
        return
      }

      if (this.isPaused) {
        console.log("[v0] Job generation paused")
        await this.logJobMessage(job_id, "info", "Job generation paused")
        return
      }

      const batchEnd = Math.min(i + batchSize, total_records)
      const batch: GeneratedRecord[] = []

      console.log(`[v0] Processing batch ${i}-${batchEnd - 1}`)

      for (let recordIndex = i; recordIndex < batchEnd; recordIndex++) {
        try {
          console.log(`[v0] Generating record ${recordIndex + 1}/${total_records}`)
          const record = await this.generateSingleRecordWithRetry(fields, recordIndex, job)
          console.log(`[v0] Generated record ${recordIndex}:`, record)
          batch.push(record)

          generatedCount++
          recoveryState.lastSuccessfulRecord = recordIndex
          const progress = Math.floor((generatedCount / total_records) * 100)

          await query(`
            UPDATE jobs 
            SET generated_records = $1, progress = $2, recovery_state = $3, updated_at = NOW()
            WHERE id = $4
          `, [generatedCount, progress, JSON.stringify(recoveryState), job_id])

          console.log(`[v0][SERVER][JobProcessor] Generated record ${generatedCount}/${total_records} (${progress}%)`)
        } catch (error) {
          console.error(`[v0][SERVER][JobProcessor] Error generating record ${recordIndex}:`, error)

          recoveryState.failedRecords.push(recordIndex)

          await this.logJobMessage(job_id, "error", `Failed to generate record ${recordIndex}`, {
            error: error instanceof Error ? error.message : "Unknown error",
            recordIndex,
          })
        }
      }

      if (batch.length > 0) {
        console.log(`[v0] Saving batch of ${batch.length} records to database...`)
        const recordsToInsert = batch.map((record, batchIndex) => ({
          job_id,
          tenant_id,
          record_data: record,
          record_index: i + batchIndex,
          created_at: new Date().toISOString(),
        }))

        try {
          const insertPromises = recordsToInsert.map(record => 
            query(`
              INSERT INTO generated_data (job_id, tenant_id, record_data, record_index, created_at)
              VALUES ($1, $2, $3, $4, NOW())
            `, [record.job_id, record.tenant_id, JSON.stringify(record.record_data), record.record_index])
          )
          
          await Promise.all(insertPromises)
        } catch (insertError) {
          console.error(`[v0][SERVER][JobProcessor] Failed to save batch:`, insertError)
          throw new Error(`Failed to save generated data: ${insertError instanceof Error ? insertError.message : 'Unknown error'}`)
        }
        console.log(`[v0] Successfully saved batch to database`)
      }

      const delay = fields.some((f: any) => this.shouldUseAI(f.type)) ? 200 : 50
      console.log(`[v0] Waiting ${delay}ms before next batch...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    console.log("[v0] Data generation completed")
  }

  private async generateSingleRecordWithRetry(
    fields: any[],
    recordIndex: number,
    job: JobData,
  ): Promise<GeneratedRecord> {
    const recoveryState = this.getRecoveryState(job.job_id)
    const retryKey = recordIndex.toString()
    const currentRetries = recoveryState.retryAttempts[retryKey] || 0

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const record = await this.generateSingleRecord(fields, recordIndex, job)

        if (recoveryState.retryAttempts[retryKey]) {
          delete recoveryState.retryAttempts[retryKey]
        }

        return record
      } catch (error) {
        recoveryState.retryAttempts[retryKey] = attempt

        if (attempt === this.retryConfig.maxRetries) {
          await this.logJobMessage(job.job_id, "error", `Record ${recordIndex} failed after ${attempt} attempts`, {
            error: error instanceof Error ? error.message : "Unknown error",
          })
          throw error
        }

        const delay = this.calculateRetryDelay(attempt)
        await this.logJobMessage(
          job.job_id,
          "warning",
          `Retry ${attempt}/${this.retryConfig.maxRetries} for record ${recordIndex} in ${delay}ms`,
          { error: error instanceof Error ? error.message : "Unknown error" },
        )

        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw new Error(`Failed to generate record ${recordIndex} after ${this.retryConfig.maxRetries} attempts`)
  }

  private async generateSingleRecord(fields: any[], recordIndex: number, job: JobData): Promise<GeneratedRecord> {
    console.log(`[v0] Generating single record ${recordIndex}`)
    const record: GeneratedRecord = {}

    const textFields = fields.filter((field) => field.type !== "image")
    const imageFields = fields.filter((field) => field.type === "image")

    console.log(`[v0] Processing ${textFields.length} text fields and ${imageFields.length} image fields`)

    for (const field of textFields) {
      console.log(`[v0] Generating field: ${field.name} (type: ${field.type})`)

      if (this.isPDFField(field.type)) {
        console.log(`[v0] Using PDF generation for field: ${field.name}`)
        const pdfContext: PDFGenerationContext = {
          fieldType: field.type,
          fieldName: field.name,
          fieldDescription: field.description,
          recordIndex,
          existingData: record,
          tenantContext: job.tenant_id,
          pdfTemplate: field.pdfTemplate,
          pdfBase64: field.pdfBase64,
        }

        // Fallback: if neither a template nor a base64 source is provided, generate a simple template
        // so PDF generation does not fail with invalid base64 input during early runs/configs.
        const hasTemplate = !!pdfContext.pdfTemplate
        const hasBase64 = typeof pdfContext.pdfBase64 === 'string' && pdfContext.pdfBase64.length > 0

        const templateFromRecord = {
          title: pdfContext.fieldName || 'Generated PDF',
          fields: Object.keys(record).length
            ? Object.keys(record).map((k) => ({ name: k, label: k }))
            : [{ name: 'content', label: 'Content' }],
        }

        const pdfOptions = hasTemplate
          ? pdfContext.pdfTemplate
          : hasBase64
          ? { pdfBase64: pdfContext.pdfBase64 as string, data: record }
          : templateFromRecord

        const pdfResult = await this.pdfGenerator.generateAndUploadPDF(
          job.tenant_id,
          job.job_id,
          `record_${recordIndex}`,
          field.name,
          pdfOptions,
          record
        )
        record[field.name] = pdfResult.url
        console.log(`[v0] PDF generated for ${field.name}:`, pdfResult.url)
      } else {
        const context: GenerationContext = {
          fieldType: field.type,
          fieldName: field.name,
          fieldDescription: field.description,
          recordIndex,
          existingData: record,
          tenantContext: job.tenant_id,
        }

        if (this.shouldUseAI(field.type)) {
          console.log(`[v0] Using AI generation for field: ${field.name}`)
          record[field.name] = await this.aiGenerator.generateFieldValue(context)
          console.log(`[v0] AI generated for ${field.name}:`, record[field.name])
        } else {
          console.log(`[v0] Using fallback generation for field: ${field.name}`)
          record[field.name] = await this.generateFieldValue(field, recordIndex)
          console.log(`[v0] Fallback generated for ${field.name}:`, record[field.name])
        }
      }
    }

    if (job.config.enable_images !== false && imageFields.length > 0) {
      console.log(`[v0] Generating ${imageFields.length} image fields with context:`, record)

      for (const field of imageFields) {
        console.log(`[v0] Generating AI image for field: ${field.name}`)
        const imageUrl = await this.generateAIImage(field, record, recordIndex, job)
        record[field.name] = imageUrl
        console.log(`[v0] Generated image URL for ${field.name}:`, imageUrl)
      }
    }

    console.log(`[v0] Completed record ${recordIndex}:`, record)
    return record
  }

  private async generateAIImage(
    field: any,
    recordData: Record<string, any>,
    recordIndex: number,
    job: JobData,
  ): Promise<string> {
    const imagesPerRecord = job.config.images_per_record || 1
    const imageModel = job.config.image_model || "google/gemini-2.5-flash-image-preview"

    const contextPrompt = this.buildImagePrompt(field, recordData)

    console.log(
      `[v0][SERVER][JobProcessor] Generating ${imagesPerRecord} image(s) for ${field.name} using ${imageModel}`,
    )

    const imageResult = await this.imageGenerator.generateAndUploadImage({
      tenantId: job.tenant_id,
      jobId: job.job_id,
      recordId: `record_${recordIndex}`,
      fieldName: field.name,
      prompt: contextPrompt,
      recordData,
      fieldDescription: field.description,
      model: imageModel,
      count: imagesPerRecord,
    })

    await query(`
      INSERT INTO media (
        tenant_id, job_id, record_id, field_name, s3_key, s3_url, 
        content_type, file_size, md5_hash, model_used, prompt_used, generation_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      job.tenant_id,
      job.job_id,
      `record_${recordIndex}`,
      field.name,
      imageResult.s3Key,
      imageResult.url,
      "image/png",
      imageResult.fileSize || 0,
      imageResult.md5Hash || "",
      imageModel,
      contextPrompt,
      JSON.stringify({
        recordData: recordData,
        fieldDescription: field.description,
        imagesPerRecord,
        generationTime: new Date().toISOString(),
      })
    ])

    await this.logJobMessage(job.job_id, "info", `Generated AI image for field: ${field.name}`, {
      model: imageModel,
      s3Key: imageResult.s3Key,
      prompt: contextPrompt,
    })

    return imageResult.url
  }

  private buildImagePrompt(field: any, recordData: Record<string, any>): string {
    const basePrompt = field.config?.prompt || field.description || "Professional headshot photo"

    const contextParts = []

    if (recordData.name || recordData.first_name) {
      const name = recordData.name || recordData.first_name
      contextParts.push(`person named ${name}`)
    }

    if (recordData.job_title) {
      contextParts.push(`working as ${recordData.job_title}`)
    }

    if (recordData.industry) {
      contextParts.push(`in ${recordData.industry} industry`)
    }

    if (recordData.company) {
      contextParts.push(`at ${recordData.company}`)
    }

    const contextString = contextParts.length > 0 ? ` of ${contextParts.join(", ")}` : ""

    return `${basePrompt}${contextString}. Professional, high-quality, realistic photo.`
  }

  private async getCurrentJob(): Promise<JobData | null> {
    return this.currentJob
  }

  private shouldUseAI(fieldType: string): boolean {
    const aiFields = [
      "name",
      "email",
      "company",
      "address",
      "city",
      "job_title",
      "industry",
      "text",
      "long_text",
      "url",
      "first_name",
      "last_name",
      "full_name",
      "description",
      "bio",
      "summary",
      "notes",
      "phone",
      "website",
    ]

    return aiFields.includes(fieldType.toLowerCase())
  }

  private isPDFField(fieldType: string): boolean {
    return fieldType.toLowerCase() === 'pdf'
  }

  private async generateFieldValue(field: any, recordIndex: number): Promise<any> {
    const { type, name } = field

    switch (type) {
      case "name":
        return this.generateName(recordIndex)
      case "email":
        return this.generateEmail(recordIndex)
      case "phone":
        return this.generatePhone()
      case "company":
        return this.generateCompany(recordIndex)
      case "address":
        return this.generateAddress(recordIndex)
      case "city":
        return this.generateCity(recordIndex)
      case "country":
        return this.generateCountry()
      case "job_title":
        return this.generateJobTitle(recordIndex)
      case "industry":
        return this.generateIndustry()
      case "number":
        return Math.floor(Math.random() * 1000) + 1
      case "date":
        return this.generateDate()
      case "boolean":
        return Math.random() > 0.5
      default:
        return `Sample ${name} ${recordIndex + 1}`
    }
  }

  private generateName(index: number): string {
    const firstNames = ["John", "Jane", "Michael", "Sarah", "David", "Emily", "Robert", "Lisa", "James", "Maria"]
    const lastNames = [
      "Smith",
      "Johnson",
      "Williams",
      "Brown",
      "Jones",
      "Garcia",
      "Miller",
      "Davis",
      "Rodriguez",
      "Martinez",
    ]

    const firstName = firstNames[index % firstNames.length]
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length]

    return `${firstName} ${lastName}`
  }

  private generateEmail(index: number): string {
    const domains = ["gmail.com", "yahoo.com", "hotmail.com", "company.com", "business.org"]
    const name = this.generateName(index).toLowerCase().replace(" ", ".")
    const domain = domains[index % domains.length]

    return `${name}${index}@${domain}`
  }

  private generatePhone(): string {
    const areaCode = Math.floor(Math.random() * 900) + 100
    const exchange = Math.floor(Math.random() * 900) + 100
    const number = Math.floor(Math.random() * 9000) + 1000

    return `(${areaCode}) ${exchange}-${number}`
  }

  private generateCompany(index: number): string {
    const prefixes = ["Tech", "Global", "Advanced", "Premier", "Dynamic", "Innovative", "Strategic", "Digital"]
    const suffixes = ["Solutions", "Systems", "Corp", "Industries", "Group", "Enterprises", "Partners", "Technologies"]

    const prefix = prefixes[index % prefixes.length]
    const suffix = suffixes[Math.floor(index / prefixes.length) % suffixes.length]

    return `${prefix} ${suffix}`
  }

  private generateAddress(index: number): string {
    const streetNumbers = [123, 456, 789, 101, 202, 303, 404, 505]
    const streetNames = ["Main St", "Oak Ave", "Pine Rd", "Elm Dr", "Cedar Ln", "Maple Way", "Park Blvd", "First St"]

    const number = streetNumbers[index % streetNumbers.length]
    const street = streetNames[Math.floor(index / streetNumbers.length) % streetNames.length]

    return `${number} ${street}`
  }

  private generateCity(index: number): string {
    const cities = [
      "New York",
      "Los Angeles",
      "Chicago",
      "Houston",
      "Phoenix",
      "Philadelphia",
      "San Antonio",
      "San Diego",
      "Dallas",
      "San Jose",
    ]
    return cities[index % cities.length]
  }

  private generateCountry(): string {
    const countries = ["United States", "Canada", "United Kingdom", "Germany", "France", "Australia", "Japan", "Brazil"]
    return countries[Math.floor(Math.random() * countries.length)]
  }

  private generateJobTitle(index: number): string {
    const titles = [
      "Software Engineer",
      "Marketing Manager",
      "Sales Director",
      "Product Manager",
      "Data Analyst",
      "UX Designer",
      "Operations Manager",
      "Financial Analyst",
    ]
    return titles[index % titles.length]
  }

  private generateIndustry(): string {
    const industries = [
      "Technology",
      "Healthcare",
      "Finance",
      "Education",
      "Manufacturing",
      "Retail",
      "Consulting",
      "Media",
    ]
    return industries[Math.floor(Math.random() * industries.length)]
  }

  private generateDate(): string {
    const start = new Date(1990, 0, 1)
    const end = new Date()
    const randomDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
    return randomDate.toISOString().split("T")[0]
  }

  private async logJobMessage(jobId: string, level: string, message: string, metadata: any = {}): Promise<void> {
    try {
      console.log(`[v0] Logging job message [${level}]: ${message}`, metadata)
      await query(`
        INSERT INTO job_logs (job_id, level, message, metadata, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        jobId,
        level,
        message,
        JSON.stringify({
          ...metadata,
          timestamp: new Date().toISOString(),
          processor_version: "2.0",
        })
      ])
    } catch (error) {
      console.error("[v0][SERVER][JobProcessor] Error logging job message:", error)
    }
  }
}
