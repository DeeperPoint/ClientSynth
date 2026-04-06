import { query, withTransaction } from "@/lib/postgres/client"
import { AIGenerator, type GenerationContext, type PDFGenerationContext } from "@/lib/ai-generator"
import { ImageGenerator } from "@/lib/image-generator"
import { S3Uploader } from "@/lib/s3-uploader"
import { PDFGenerator } from "@/lib/pdf-generator"
import { PersonaGenerator } from "@/lib/intelligence/persona-generator"
import { PersonaContext } from "@/lib/types/schema-extensions"

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
  
  // Track generated values per field to enforce strict uniqueness
  private generatedValuesPerField = new Map<string, Map<string, Set<string>>>()
  
  // Store persona context per job (Task 3: Persona Context)
  private jobPersonaContext = new Map<string, PersonaContext>()

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
    // Get jobId from currentJob if available, otherwise we can't resume (shouldn't happen)
    const jobId = this.currentJob?.job_id
    if (!jobId) {
      console.warn("[JobProcessor] Cannot resume: no current job")
      return
    }

    this.isPaused = false
    const recoveryState = this.getRecoveryState(jobId)
    recoveryState.resumedAt = new Date().toISOString()

    // Set status to 'pending' so processNextJob can pick it up and continue
    // The recovery state will ensure it continues from where it left off
    await query(`
      UPDATE jobs 
      SET status = 'pending', recovery_state = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(recoveryState), jobId])

    await this.logJobMessage(jobId, "info", "Job resumed by user request - will continue from last checkpoint")
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
        const record = await this.generateSingleRecord(fields, recordIndex, this.currentJob, this.currentJob.job_id)

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
      this.isCancelled = false
      
      // If job was paused, check if it's still paused or should resume
      if (jobRow.status === 'paused') {
        // Check if job status is still paused (might have been resumed)
        const statusCheck = await query(`SELECT status FROM jobs WHERE id = $1`, [job.job_id])
        if (statusCheck.rows[0]?.status === 'paused') {
          this.isPaused = true
        } else {
          this.isPaused = false
        }
      } else {
        this.isPaused = false
      }

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
      // Only set started_at if job wasn't previously running (to preserve original start time on resume)
      if (jobRow.status === 'paused') {
        await query(`
          UPDATE jobs 
          SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
          WHERE id = $1
        `, [job.job_id])
      } else {
        await query(`
          UPDATE jobs 
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [job.job_id])
      }

      await this.logJobMessage(job.job_id, "info", `Started processing job: ${job.name}`, {
        textModel,
        imageModel,
        config: job.config,
      })

      console.log("[v0] Starting data generation...")
      try {
        await this.generateData(job)
        console.log("[v0] Data generation completed successfully")
      } catch (genError) {
        console.error("[v0] Error in generateData:", genError)
        console.error("[v0] Error stack:", genError instanceof Error ? genError.stack : "No stack trace")
        await this.logJobMessage(job.job_id, "error", `Data generation failed: ${genError instanceof Error ? genError.message : String(genError)}`, {
          error: genError instanceof Error ? genError.stack : String(genError)
        })
        throw genError // Re-throw so outer catch handles it
      }

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

    // Early validation
    if (!fields || fields.length === 0) {
      throw new Error("Schema has no fields defined")
    }

    if (total_records <= 0) {
      throw new Error(`Invalid total_records: ${total_records}`)
    }

    if (!schema_definition) {
      throw new Error("Schema definition is missing")
    }

    console.log(`[v0][SERVER][JobProcessor] Generating ${total_records} records for ${fields.length} fields`)
    console.log(
      "[v0] Schema fields:",
      fields.map((f: any) => ({ name: f.name, type: f.type })),
    )

    // Generate persona context for this job (Task 2 & 3: Persona Context)
    let personaContext: PersonaContext | undefined = undefined
    try {
      console.log(`[v0][SERVER][JobProcessor] 🎭 Generating persona context for schema ${job.schema_id}...`)
      await this.logJobMessage(job_id, "info", "🎭 Generating persona context for consistent data generation...")
      const personaGenerator = new PersonaGenerator()
      personaContext = await personaGenerator.generateSeedPersona(job.schema_id)
      console.log(`[v0][SERVER][JobProcessor] ✅ Persona context generated:`, JSON.stringify(personaContext, null, 2))
      // Store persona context for this job
      this.jobPersonaContext.set(job_id, personaContext)
      // Log persona context to job logs for visibility
      await this.logJobMessage(job_id, "info", `✅ Persona context generated: ${Object.keys(personaContext).length} properties`, {
        personaContext: personaContext
      })
      console.log(`[v0][SERVER][JobProcessor] Persona context stored for job ${job_id}`)
    } catch (personaError) {
      console.warn(`[v0][SERVER][JobProcessor] ⚠️ Failed to generate persona context, continuing without it:`, personaError)
      await this.logJobMessage(job_id, "warn", `⚠️ Persona context generation failed, continuing without it: ${personaError instanceof Error ? personaError.message : String(personaError)}`)
      // Continue without persona context - it's optional
    }

    console.log(`[v0][SERVER][JobProcessor] ✅ Continuing with data generation after persona context...`)

    // Initialize field-level tracking for this job (jobKey must be in outer scope)
    const jobKey = job_id
    try {
      console.log(`[v0][SERVER][JobProcessor] Initializing field-level tracking for ${fields.length} fields...`)
      this.generatedValuesPerField.set(jobKey, new Map())
      fields.forEach((field: any) => {
        this.generatedValuesPerField.get(jobKey)!.set(field.name, new Set())
      })
      console.log(`[v0][SERVER][JobProcessor] Field-level tracking initialized`)
    } catch (trackingError) {
      console.error(`[v0][SERVER][JobProcessor] Error initializing field tracking:`, trackingError)
      throw new Error(`Failed to initialize field tracking: ${trackingError instanceof Error ? trackingError.message : String(trackingError)}`)
    }

    // Load existing values from database to prevent duplicates
    try {
      const existing = await query(
        `SELECT record_data FROM generated_data WHERE job_id = $1`,
        [job_id]
      )
      existing.rows.forEach((row: any) => {
        const record = row.record_data
        fields.forEach((field: any) => {
          if (record[field.name]) {
            const valueSet = this.generatedValuesPerField.get(jobKey)!.get(field.name)
            if (valueSet) {
              valueSet.add(String(record[field.name]).toLowerCase().trim())
            }
          }
        })
      })
      console.log(`[v0] Loaded ${existing.rows.length} existing records for duplicate prevention`)
    } catch (e) {
      console.warn('[v0] Failed to load existing records, starting fresh:', e)
    }

    const batchSize = (config as any).batch_size || 10
    const recoveryState = this.getRecoveryState(job_id)
    // Start from 0 if no records generated yet, otherwise continue from last successful + 1
    let generatedCount = recoveryState.lastSuccessfulRecord === -1 ? 0 : recoveryState.lastSuccessfulRecord + 1

    console.log("[v0] Generation parameters:", {
      batchSize,
      startingFrom: generatedCount,
      totalRecords: total_records,
      lastSuccessful: recoveryState.lastSuccessfulRecord
    })

    console.log(`[v0][SERVER][JobProcessor] 🚀 Starting record generation loop (${generatedCount} to ${total_records})...`)
    
    if (generatedCount >= total_records) {
      console.log(`[v0][SERVER][JobProcessor] All records already generated (${generatedCount}/${total_records}), skipping generation loop`)
      return
    }

    // Generate exactly total_records records (indices 0 to total_records-1)
    for (let i = generatedCount; i < total_records; i += batchSize) {
      if (this.isCancelled) {
        console.log("[v0] Job generation cancelled")
        await this.logJobMessage(job_id, "info", "Job generation cancelled")
        return
      }

      // Wait if paused - poll until resumed
      while (this.isPaused && !this.isCancelled) {
        // Check database status in case it was resumed externally
        const statusCheck = await query(`SELECT status FROM jobs WHERE id = $1`, [job_id])
        if (statusCheck.rows[0]?.status !== 'paused') {
          console.log("[v0] Job resumed from database, continuing...")
          this.isPaused = false
          break
        }
        
        console.log("[v0] Job is paused, waiting...")
        await this.logJobMessage(job_id, "info", "Job generation paused - waiting for resume")
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before checking again
      }

      if (this.isCancelled) {
        return
      }

      const batchEnd = Math.min(i + batchSize, total_records)
      const batch: GeneratedRecord[] = []

      console.log(`[v0] Processing batch ${i}-${batchEnd - 1}`)

      for (let recordIndex = i; recordIndex < batchEnd; recordIndex++) {
        // Check for pause/cancel before each record
        if (this.isCancelled) {
          console.log("[v0] Job generation cancelled")
          await this.logJobMessage(job_id, "info", "Job generation cancelled")
          return
        }

        // Check if paused - wait if so
        while (this.isPaused && !this.isCancelled) {
          const statusCheck = await query(`SELECT status FROM jobs WHERE id = $1`, [job_id])
          if (statusCheck.rows[0]?.status !== 'paused') {
            console.log("[v0] Job resumed, continuing record generation...")
            this.isPaused = false
            break
          }
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        if (this.isCancelled) {
          return
        }

        try {
          console.log(`[v0] Generating record ${recordIndex + 1}/${total_records}`)
          const record = await this.generateSingleRecordWithRetry(fields, recordIndex, job, jobKey)
          console.log(`[v0] Generated record ${recordIndex}:`, record)
          
          // Track generated values for duplicate checking
          fields.forEach((field: any) => {
            if (record[field.name]) {
              const valueSet = this.generatedValuesPerField.get(jobKey)!.get(field.name)
              if (valueSet) {
                valueSet.add(String(record[field.name]).toLowerCase().trim())
              }
            }
          })
          
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
        // De-duplicate within this job by record content to avoid duplicates
        const stringifyRecord = (obj: any) => JSON.stringify(obj)
        const batchHashes = new Set<string>()
        const dedupedBatch = batch.filter((record) => {
          const h = stringifyRecord(record)
          if (batchHashes.has(h)) return false
          batchHashes.add(h)
          return true
        })

        // Fetch existing records for this job to prevent duplicates across batches
        let existingHashes = new Set<string>()
        try {
          const existing = await query(
            `SELECT record_data FROM generated_data WHERE job_id = $1`,
            [job_id]
          )
          existing.rows.forEach((row: any) => {
            existingHashes.add(stringifyRecord(row.record_data))
          })
        } catch (e) {
          console.warn('[v0] Failed to fetch existing records for dedupe, proceeding without cross-batch dedupe')
        }

        const finalBatch = dedupedBatch.filter((record) => !existingHashes.has(stringifyRecord(record)))

        if (finalBatch.length === 0) {
          console.log('[v0] All records in this batch were duplicates; skipping insert')
        }

        const recordsToInsert = finalBatch.map((record, batchIndex) => ({
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

        // CS-302: Trigger Continuous Hydration webhook for Cosolvent
        const cosolventBaseUrl = (job.config as any)?.cosolventBaseUrl || process.env.COSOLVENT_BASE_URL
        if (cosolventBaseUrl && finalBatch.length > 0) {
          try {
            console.log(`[v0] Streaming live batch to Cosolvent (${finalBatch.length} records)...`)
            const { CosolventExporter } = await import("@/lib/cosolvent-exporter")
            const exporter = new CosolventExporter({ baseUrl: cosolventBaseUrl })
            await exporter.exportBatch(finalBatch)
            console.log(`[v0] Successfully streamed live batch to Cosolvent.`)
          } catch (whError) {
            console.warn(`[v0] Non-fatal: Cosolvent hydration failed:`, whError)
            await this.logJobMessage(job_id, "warning", `Cosolvent live hydration failed: ${whError instanceof Error ? whError.message : String(whError)}`)
          }
        }
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
    jobKey: string,
  ): Promise<GeneratedRecord> {
    const recoveryState = this.getRecoveryState(job.job_id)
    const retryKey = recordIndex.toString()
    const currentRetries = recoveryState.retryAttempts[retryKey] || 0

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries * 2; attempt++) {
      try {
        const record = await this.generateSingleRecord(fields, recordIndex, job, jobKey)
        
        // Check for field-level duplicates
        let hasDuplicate = false
        for (const field of fields) {
          const fieldValue = String(record[field.name] || '').toLowerCase().trim()
          if (fieldValue) {
            const existingValues = this.generatedValuesPerField.get(jobKey)?.get(field.name)
            if (existingValues && existingValues.has(fieldValue)) {
              console.warn(`[v0] DUPLICATE DETECTED for field ${field.name}: ${fieldValue}`)
              hasDuplicate = true
              break
            }
          }
        }
        
        if (hasDuplicate && attempt < this.retryConfig.maxRetries * 2) {
          console.log(`[v0] Retrying record ${recordIndex} due to duplicate (attempt ${attempt})`)
          await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          continue
        }

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

  private async generateSingleRecord(fields: any[], recordIndex: number, job: JobData, jobKey: string): Promise<GeneratedRecord> {
    console.log(`[v0] Generating single record ${recordIndex}`)
    const record: GeneratedRecord = {}
    const maxRetries = 5 // Maximum retries for required fields

    const textFields = fields.filter((field) => field.type !== "image")
    const imageFields = fields.filter((field) => field.type === "image")

    console.log(`[v0] Processing ${textFields.length} text fields and ${imageFields.length} image fields`)

    for (const field of textFields) {
      console.log(`[v0] Generating field: ${field.name} (type: ${field.type}, required: ${field.required})`)

      let fieldValue: any = null
      let attempts = 0
      const existingValues = this.generatedValuesPerField.get(jobKey)?.get(field.name) || new Set<string>()

      // Retry loop for required fields to ensure they're never empty AND unique
      while ((!fieldValue || fieldValue.toString().trim().length === 0 || existingValues.has(String(fieldValue).toLowerCase().trim())) && attempts < maxRetries) {
        attempts++
        try {
          if (this.isPDFField(field.type)) {
            console.log(`[v0] Using PDF generation for field: ${field.name}`)
            console.log(`[v0] Job details - tenant_id: ${job.tenant_id}, job_id: ${job.job_id}`)
            
            // First, generate the PDF content using AI
            const aiContext: GenerationContext = {
              fieldType: field.type,
              fieldName: field.name,
              fieldDescription: field.description || `Generate a complete ${field.name}`,
              recordIndex,
              existingData: record,
              tenantContext: job.tenant_id,
              schemaId: job.schema_id,
              personaContext: this.jobPersonaContext.get(job.job_id), // Task 3: Add persona context
              seedRules: job.schema_definition.seed_rules, // Knowledge Slot rules (CS-103)
            }
            
            // Pass previously generated values for uniqueness
            const pdfExistingValues = this.generatedValuesPerField.get(jobKey)?.get(field.name) || new Set<string>()
            const previousPdfValues = Array.from(pdfExistingValues).slice(-20)
            aiContext.previouslyGeneratedValues = previousPdfValues
            
            console.log(`[v0] Generating AI content for PDF field: ${field.name}`)
            const pdfContent = await this.aiGenerator.generateFieldValue(aiContext, attempts - 1)
            
            // Validate PDF content is not empty
            if (!pdfContent || pdfContent.trim().length === 0) {
              throw new Error(`Generated empty PDF content for field ${field.name}`)
            }
            
            console.log(`[v0] Generated PDF content (${pdfContent.length} chars)`)
            
            // Create a PDF directly from the AI-generated content
            const { PDFGenerator } = await import('./pdf-generator')
            const pdfGen = new PDFGenerator()
            
            const pdfResult = await pdfGen.createFromContent({
              title: field.name || 'Generated Document',
              content: pdfContent,
              pageSize: 'A4',
              marginMm: 20
            })
            
            if (!pdfResult.success || !pdfResult.pdfBase64) {
              throw new Error(pdfResult.error || 'PDF creation failed')
            }
            
            console.log(`[v0] PDF created successfully, uploading to S3...`)
            
            // Upload the PDF to S3
            const filename = `record_${recordIndex}_${field.name}_${Date.now()}.pdf` // Add timestamp for uniqueness
            console.log(`[v0] Uploading PDF with: tenantId=${job.tenant_id}, jobId=${job.job_id}, filename=${filename}`)
            
            const s3Result = await pdfGen.uploadPDFToS3(
              pdfResult.pdfBase64,
              job.tenant_id,
              job.job_id,
              filename
            )
            
            if (!s3Result.url || s3Result.url.trim().length === 0) {
              throw new Error(`Failed to get S3 URL for PDF field ${field.name}`)
            }
            
            // Check for duplicate PDF URLs (though unlikely due to timestamps)
            const normalizedUrl = s3Result.url.toLowerCase().trim()
            if (existingValues.has(normalizedUrl)) {
              console.warn(`[v0] Duplicate PDF URL detected, retrying...`)
              throw new Error(`Generated duplicate PDF URL for field ${field.name}`)
            }
            
            fieldValue = s3Result.url
            console.log(`[v0] PDF uploaded successfully for ${field.name}:`, s3Result.url)
            console.log(`[v0] S3 Key:`, s3Result.s3Key)
          } else {
            const context: GenerationContext = {
              fieldType: field.type,
              fieldName: field.name,
              fieldDescription: field.description,
              recordIndex,
              existingData: record,
              tenantContext: job.tenant_id,
              schemaId: job.schema_id,
              personaContext: this.jobPersonaContext.get(job.job_id), // Task 3: Add persona context
              seedRules: job.schema_definition.seed_rules, // Knowledge Slot rules (CS-103)
            }

            if (this.shouldUseAI(field.type)) {
              console.log(`[v0] Using AI generation for field: ${field.name} (attempt ${attempts})`)
              
              // Pass previously generated values to AI to avoid duplicates
              // Show more previous values to help AI avoid duplicates
              const previousValues = Array.from(existingValues).slice(-50) // Last 50 values to avoid (increased from 20)
              context.previouslyGeneratedValues = previousValues
              
              // Increase temperature slightly on retries to encourage variation
              const retryTemperature = attempts > 1 ? 1.2 : undefined
              if (retryTemperature) {
                context.temperature = retryTemperature
              }
              
              fieldValue = await this.aiGenerator.generateFieldValue(context, attempts - 1)
              
              // Validate AI-generated value
              if (!fieldValue || String(fieldValue).trim().length === 0) {
                throw new Error(`AI generated empty value for required field ${field.name}`)
              }
              
              // Check for duplicate - but allow some duplicates for realistic data (names, cities, countries can repeat)
              const normalizedValue = String(fieldValue).toLowerCase().trim()
              if (existingValues.has(normalizedValue)) {
                // For common fields that can realistically repeat, allow duplicates after many records
                const isCommonField = 
                  field.type === 'name' || 
                  field.name.toLowerCase().includes('name') ||
                  field.type === 'city' ||
                  field.name.toLowerCase().includes('city') ||
                  field.type === 'country' ||
                  field.name.toLowerCase().includes('country') ||
                  field.type === 'industry' ||
                  field.name.toLowerCase().includes('industry')
                
                const totalGenerated = existingValues.size
                
                if (isCommonField && totalGenerated > 20 && attempts < maxRetries) {
                  // Allow duplicate common values if we have many records (realistic - people can share cities, countries, etc.)
                  console.log(`[v0] Allowing duplicate ${field.type} "${fieldValue}" (realistic data, ${totalGenerated} records generated)`)
                } else {
                  console.warn(`[v0] AI generated duplicate value for ${field.name}: ${fieldValue}`)
                  throw new Error(`Generated duplicate value for field ${field.name}`)
                }
              }
              
              // Final cleanup: remove any trailing numbers or timestamps that might have leaked through
              const originalValue = String(fieldValue)
              fieldValue = String(fieldValue).replace(/_\d+(_\d+)?$/g, '').trim()
              if (originalValue !== fieldValue) {
                console.warn(`[v0] Cleaned trailing numbers from AI-generated value: "${originalValue}" -> "${fieldValue}"`)
              }
              
              console.log(`[v0] AI generated for ${field.name}:`, fieldValue)

              // Post-generation validation against Knowledge Slot rules (CS-102/103)
              if (job.schema_definition.seed_rules && job.schema_definition.seed_rules.length > 0) {
                const { RuleValidator } = await import("./validation/rule-validator")
                const validationIssues = RuleValidator.validate(
                  { ...record, [field.name]: fieldValue },
                  job.schema_definition.seed_rules
                )
                
                if (validationIssues.some(issue => issue.severity === 'error' && issue.field === field.name)) {
                  const errorIssue = validationIssues.find(issue => issue.severity === 'error' && issue.field === field.name)
                  console.warn(`[v0] AI output violated Knowledge Slot rule: ${errorIssue?.message}`)
                  throw new Error(`Knowledge Slot Rule Violation: ${errorIssue?.message}`)
                }
              }
            } else {
              console.log(`[v0] Using fallback generation for field: ${field.name}`)
              fieldValue = await this.generateFieldValue(field, recordIndex, existingValues)
              
              // Clean any trailing numbers that might have been added
              fieldValue = String(fieldValue).replace(/_\d+(_\d+)?$/g, '').trim()
              
              // Check for duplicate in fallback generation
              const normalizedFallbackValue = String(fieldValue).toLowerCase().trim()
              if (existingValues.has(normalizedFallbackValue)) {
                console.warn(`[v0] Fallback generated duplicate value, retrying with different approach...`)
                // Instead of adding numbers, try generating again with a different seed
                // This is better than adding ugly suffixes
                if (attempts < maxRetries - 1) {
                  throw new Error(`Fallback generated duplicate value for field ${field.name}`)
                }
                // Last attempt: use a more unique variation without numbers
                const uniqueSuffix = Math.random().toString(36).substring(2, 6) // Short random string
                fieldValue = `${fieldValue} ${uniqueSuffix}`
                const newNormalized = String(fieldValue).toLowerCase().trim()
                if (existingValues.has(newNormalized)) {
                  throw new Error(`Fallback generated duplicate value for field ${field.name} even with variation`)
                }
              }
              
              console.log(`[v0] Fallback generated for ${field.name}:`, fieldValue)
            }
          }
        } catch (error) {
          console.warn(`[v0] Attempt ${attempts} failed for field ${field.name}:`, error)
          if (attempts >= maxRetries) {
            throw new Error(`Failed to generate value for field ${field.name} after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
        }
      }

      // Final validation for required fields
      if (field.required) {
        if (!fieldValue || String(fieldValue).trim().length === 0) {
          throw new Error(`Required field ${field.name} is empty after all generation attempts`)
        }
      }

      // Final cleanup: remove any trailing numbers, timestamps, or instruction patterns
      let finalValue = String(fieldValue)
      const originalFinal = finalValue
      
      // Remove trailing numbers/timestamps (e.g., "Australia_11_1763030500331")
      finalValue = finalValue.replace(/_\d+(_\d+)?$/g, '').trim()
      
      // Remove instruction patterns that might have leaked through
      finalValue = finalValue.replace(/for field:\s*[^,]+/gi, '').trim()
      finalValue = finalValue.replace(/cannot be generated[^.]*/gi, '').trim()
      finalValue = finalValue.replace(/cannot be an empty string[^.]*/gi, '').trim()
      finalValue = finalValue.replace(/value cannot be[^.]*/gi, '').trim()
      finalValue = finalValue.replace(/please try again[^.]*/gi, '').trim()
      finalValue = finalValue.replace(/,\s*(cannot|error|failed|invalid|unable)[^.]*/gi, '').trim()
      
      if (originalFinal !== finalValue) {
        console.warn(`[v0] Final cleanup for ${field.name}: "${originalFinal}" -> "${finalValue}"`)
        fieldValue = finalValue
      }
      
      // Validate field value is not a JSON error message
      const valueStr = String(fieldValue)
      if (valueStr.toLowerCase().includes('error') && 
          (valueStr.toLowerCase().includes('parsing') || 
           valueStr.toLowerCase().includes('invalid') ||
           valueStr.toLowerCase().includes('failed'))) {
        console.warn(`[v0] Detected error message in field ${field.name}, regenerating...`)
        if (attempts < maxRetries) {
          continue // Retry
        }
        throw new Error(`Field ${field.name} contains error message: ${valueStr}`)
      }

      // Store cleaned value
      record[field.name] = fieldValue
      
      // NOTE: Values are NOT added to tracking set here - they're added after duplicate check passes
      // in generateSingleRecordWithRetry to avoid infinite retry loops
    }

    if (job.config.enable_images !== false && imageFields.length > 0) {
      console.log(`[v0] Generating ${imageFields.length} image fields with context:`, record)

      for (const field of imageFields) {
        console.log(`[v0] Generating AI image for field: ${field.name}`)
        let imageResult: string | string[] | null = null
        let attempts = 0
        
        while ((!imageResult || (Array.isArray(imageResult) ? imageResult.length === 0 : imageResult.trim().length === 0)) && attempts < maxRetries) {
          attempts++
          try {
            imageResult = await this.generateAIImage(field, record, recordIndex, job)
            
            if (!imageResult || (Array.isArray(imageResult) ? imageResult.length === 0 : imageResult.trim().length === 0)) {
              throw new Error(`Generated empty image URL(s) for field ${field.name}`)
            }
            
            // Store as array if multiple images, single value if one image
            record[field.name] = imageResult
            const imageCount = Array.isArray(imageResult) ? imageResult.length : 1
            console.log(`[v0] Generated ${imageCount} image URL(s) for ${field.name}:`, Array.isArray(imageResult) ? imageResult.join(', ') : imageResult)
            break
          } catch (error) {
            console.warn(`[v0] Image generation attempt ${attempts} failed for ${field.name}:`, error)
            if (attempts >= maxRetries) {
              if (field.required) {
                throw new Error(`Required image field ${field.name} failed after ${maxRetries} attempts`)
              }
              // For non-required fields, continue without image
              break
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts))
          }
        }
      }
    }

    // Final validation - ensure all required fields have values
    for (const field of fields) {
      if (field.required && (!record[field.name] || String(record[field.name]).trim().length === 0)) {
        throw new Error(`Required field ${field.name} is missing or empty in final record`)
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
  ): Promise<string | string[]> {
    const imagesPerRecord = job.config.images_per_record || 1
    const imageModel = job.config.image_model || "google/gemini-2.5-flash-image"

    const contextPrompt = this.buildImagePrompt(field, recordData, recordIndex)

    console.log(
      `[v0][SERVER][JobProcessor] Generating ${imagesPerRecord} image(s) for ${field.name} using ${imageModel}`,
    )

    const imageUrls: string[] = []
    const baseRecordId = `record_${recordIndex}`

    // Generate multiple images if imagesPerRecord > 1
    for (let imgIndex = 0; imgIndex < imagesPerRecord; imgIndex++) {
      try {
        const uniqueRecordId = `${baseRecordId}_img${imgIndex}_${Date.now()}`
        
        console.log(`[v0][SERVER][JobProcessor] Generating image ${imgIndex + 1}/${imagesPerRecord} for ${field.name}`)

        const imageResult = await this.imageGenerator.generateAndUploadImage({
          tenantId: job.tenant_id,
          jobId: job.job_id,
          recordId: uniqueRecordId,
          fieldName: field.name,
          prompt: contextPrompt,
          recordData,
          fieldDescription: field.description,
          model: imageModel,
          count: 1, // Generate one at a time to get individual URLs
        })

        // Store each image in media table
        await query(`
          INSERT INTO media (
            tenant_id, job_id, record_id, field_name, s3_key, s3_url, 
            content_type, file_size, md5_hash, model_used, prompt_used, generation_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          job.tenant_id,
          job.job_id,
          baseRecordId,
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
            imageIndex: imgIndex,
            imagesPerRecord,
            generationTime: new Date().toISOString(),
          })
        ])

        imageUrls.push(imageResult.url)
        console.log(`[v0][SERVER][JobProcessor] Generated image ${imgIndex + 1}/${imagesPerRecord}: ${imageResult.url}`)

        // Small delay between image generations to avoid rate limits
        if (imgIndex < imagesPerRecord - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (error) {
        console.error(`[v0][SERVER][JobProcessor] Failed to generate image ${imgIndex + 1}/${imagesPerRecord}:`, error)
        // If it's a required field and we haven't generated any images, throw error
        if (imgIndex === 0) {
          throw error
        }
        // Otherwise, continue with the images we have
        break
      }
    }

    await this.logJobMessage(job.job_id, "info", `Generated ${imageUrls.length} AI image(s) for field: ${field.name}`, {
      model: imageModel,
      imageCount: imageUrls.length,
      prompt: contextPrompt,
    })

    // Return single URL if count is 1, array if count > 1
    return imagesPerRecord === 1 ? imageUrls[0] : imageUrls
  }

  private buildImagePrompt(field: any, recordData: Record<string, any>, recordIndex: number = 0): string {
    // Pay more attention to field description - use it as the primary prompt if available
    const basePrompt = field.description || field.config?.prompt || "Professional headshot photo"

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

    // Add variation instruction to prevent duplicate images
    return `${basePrompt}${contextString}. Professional, high-quality, realistic photo. This is record #${recordIndex + 1}, generate a UNIQUE image that is different from all previous images. Use different lighting, pose, background, or composition.`
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

  private async generateFieldValue(field: any, recordIndex: number, existingValues?: Set<string>): Promise<any> {
    const { type, name } = field

    switch (type) {
      case "name":
        return this.generateName(recordIndex, existingValues)
      case "email":
        return this.generateEmail(recordIndex, existingValues)
      case "phone":
        return this.generatePhone(existingValues)
      case "company":
        return this.generateCompany(recordIndex, existingValues)
      case "address":
        return this.generateAddress(recordIndex, existingValues)
      case "city":
        return this.generateCity(recordIndex, existingValues)
      case "country":
        return this.generateCountry(existingValues)
      case "job_title":
        return this.generateJobTitle(recordIndex, existingValues)
      case "industry":
        return this.generateIndustry(existingValues)
      case "number":
        // Generate unique number without trailing underscore suffix
        // Use a combination of random number and record index in a way that doesn't add visible suffix
        const baseNumber = Math.floor(Math.random() * 1000) + 1
        const uniqueOffset = recordIndex * 7 // Small multiplier for uniqueness
        return baseNumber + uniqueOffset
      case "date":
        // For dates, add slight variation based on record index
        return this.generateDate(recordIndex)
      case "boolean":
        return Math.random() > 0.5
      default:
        // Generate a clean sample value without trailing numbers
        return `Sample ${name} ${recordIndex + 1}`
    }
  }

  private generateName(index: number, existingValues?: Set<string>): string {
    const firstNames = ["John", "Jane", "Michael", "Sarah", "David", "Emily", "Robert", "Lisa", "James", "Maria", "William", "Jessica", "Christopher", "Ashley", "Daniel", "Amanda", "Matthew", "Michelle", "Anthony", "Stephanie"]
    const lastNames = [
      "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
      "Wilson", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Martin", "Jackson", "Thompson", "White"
    ]

    // Try to generate unique name
    for (let attempt = 0; attempt < 50; attempt++) {
      const firstNameIdx = (index * 3 + attempt) % firstNames.length
      const lastNameIdx = (index * 7 + attempt) % lastNames.length
      const name = `${firstNames[firstNameIdx]} ${lastNames[lastNameIdx]}`
      
      if (!existingValues || !existingValues.has(name.toLowerCase())) {
        return name
      }
    }
    
    // Fallback with index-based uniqueness
    const firstName = firstNames[index % firstNames.length]
    const lastName = `${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}${index}`
    return `${firstName} ${lastName}`
  }

  private generateEmail(index: number, existingValues?: Set<string>): string {
    const domains = ["gmail.com", "yahoo.com", "hotmail.com", "company.com", "business.org", "outlook.com", "protonmail.com", "icloud.com"]
    const name = this.generateName(index).toLowerCase().replace(/\s+/g, ".")
    
    // Try unique email
    for (let attempt = 0; attempt < 50; attempt++) {
      const domain = domains[(index + attempt) % domains.length]
      const email = `${name}.${index}.${attempt}@${domain}`
      if (!existingValues || !existingValues.has(email.toLowerCase())) {
        return email
      }
    }
    
    // Fallback
    const domain = domains[index % domains.length]
    return `${name}.${index}.${Date.now()}@${domain}`
  }

  private generatePhone(existingValues?: Set<string>): string {
    // Generate unique phone number
    for (let attempt = 0; attempt < 50; attempt++) {
      const areaCode = 200 + (Math.floor(Math.random() * 800) + attempt) % 800
      const exchange = 200 + (Math.floor(Math.random() * 800) + attempt) % 800
      const number = 1000 + (Math.floor(Math.random() * 9000) + attempt) % 9000
      const phone = `(${areaCode}) ${exchange}-${number}`
      
      if (!existingValues || !existingValues.has(phone.toLowerCase())) {
        return phone
      }
    }
    
    // Fallback
    const areaCode = Math.floor(Math.random() * 900) + 100
    const exchange = Math.floor(Math.random() * 900) + 100
    const number = Math.floor(Math.random() * 9000) + 1000
    return `(${areaCode}) ${exchange}-${number}`
  }

  private generateCompany(index: number, existingValues?: Set<string>): string {
    const prefixes = ["Tech", "Global", "Advanced", "Premier", "Dynamic", "Innovative", "Strategic", "Digital", "Modern", "Elite", "Progressive", "Smart"]
    const suffixes = ["Solutions", "Systems", "Corp", "Industries", "Group", "Enterprises", "Partners", "Technologies", "Services", "Consulting", "Ventures", "Holdings"]

    for (let attempt = 0; attempt < 50; attempt++) {
      const prefixIdx = (index * 2 + attempt) % prefixes.length
      const suffixIdx = (index * 3 + attempt) % suffixes.length
      const company = `${prefixes[prefixIdx]} ${suffixes[suffixIdx]}`
      
      if (!existingValues || !existingValues.has(company.toLowerCase())) {
        return company
      }
    }
    
    // Fallback
    const prefix = prefixes[index % prefixes.length]
    const suffix = `${suffixes[Math.floor(index / prefixes.length) % suffixes.length]} ${index}`
    return `${prefix} ${suffix}`
  }

  private generateAddress(index: number, existingValues?: Set<string>): string {
    const streetNumbers = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]
    const streetNames = ["Main St", "Oak Ave", "Pine Rd", "Elm Dr", "Cedar Ln", "Maple Way", "Park Blvd", "First St", "Second Ave", "Third St", "Broadway", "Market St"]

    for (let attempt = 0; attempt < 50; attempt++) {
      const number = streetNumbers[(index + attempt) % streetNumbers.length]
      const street = streetNames[(index * 2 + attempt) % streetNames.length]
      const address = `${number + attempt} ${street}`
      
      if (!existingValues || !existingValues.has(address.toLowerCase())) {
        return address
      }
    }
    
    // Fallback
    const number = streetNumbers[index % streetNumbers.length] + index
    const street = streetNames[Math.floor(index / streetNumbers.length) % streetNames.length]
    return `${number} ${street}`
  }

  private generateCity(index: number, existingValues?: Set<string>): string {
    const cities = [
      "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose",
      "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "San Francisco", "Indianapolis", "Seattle", "Denver", "Washington"
    ]
    
    const city = cities[index % cities.length]
    if (!existingValues || !existingValues.has(city.toLowerCase())) {
      return city
    }
    
    // If duplicate, try next city
    return cities[(index + 1) % cities.length]
  }

  private generateCountry(existingValues?: Set<string>): string {
    const countries = ["United States", "Canada", "United Kingdom", "Germany", "France", "Australia", "Japan", "Brazil", "Mexico", "Italy", "Spain", "Netherlands"]
    const country = countries[Math.floor(Math.random() * countries.length)]
    
    if (!existingValues || !existingValues.has(country.toLowerCase())) {
      return country
    }
    
    // If duplicate, try another
    return countries[(Math.floor(Math.random() * countries.length) + 1) % countries.length]
  }

  private generateJobTitle(index: number, existingValues?: Set<string>): string {
    const titles = [
      "Software Engineer", "Marketing Manager", "Sales Director", "Product Manager", "Data Analyst", "UX Designer", "Operations Manager", "Financial Analyst",
      "Project Manager", "Business Analyst", "HR Manager", "Account Executive", "Content Manager", "DevOps Engineer", "Security Analyst", "Research Scientist"
    ]
    
    const title = titles[index % titles.length]
    if (!existingValues || !existingValues.has(title.toLowerCase())) {
      return title
    }
    
    // If duplicate, try next
    return titles[(index + 1) % titles.length]
  }

  private generateIndustry(existingValues?: Set<string>): string {
    const industries = [
      "Technology", "Healthcare", "Finance", "Education", "Manufacturing", "Retail", "Consulting", "Media",
      "Energy", "Transportation", "Real Estate", "Agriculture", "Hospitality", "Telecommunications", "Aerospace", "Pharmaceuticals"
    ]
    const industry = industries[Math.floor(Math.random() * industries.length)]
    
    if (!existingValues || !existingValues.has(industry.toLowerCase())) {
      return industry
    }
    
    // If duplicate, try another
    return industries[(Math.floor(Math.random() * industries.length) + 1) % industries.length]
  }

  private generateDate(recordIndex: number = 0): string {
    // Add variation based on record index to ensure uniqueness
    const daysOffset = recordIndex * 3 // Each record gets a date 3 days apart
    const start = new Date(1990, 0, 1)
    const baseDate = new Date(start.getTime() + Math.random() * ((new Date().getTime() - start.getTime())))
    const uniqueDate = new Date(baseDate.getTime() + (daysOffset * 24 * 60 * 60 * 1000))
    return uniqueDate.toISOString().split("T")[0]
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

