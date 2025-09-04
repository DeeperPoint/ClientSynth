import { createClient } from "@supabase/supabase-js"
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
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
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
    this.aiGenerator = new AIGenerator()
    this.setupJobControlListener()
  }

  private setupJobControlListener(): void {
    // Listen for job control signals via Supabase real-time
    this.supabase
      .channel("job-controls")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_controls" }, (payload) => {
        const signal = payload.new as JobControlSignal
        this.handleJobControl(signal)
      })
      .subscribe()
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

    await this.supabase
      .from("jobs")
      .update({
        status: "paused",
        recovery_state: recoveryState,
      })
      .eq("id", this.currentJob.job_id)

    await this.logJobMessage(this.currentJob.job_id, "info", "Job paused by user request")
  }

  private async resumeJob(): Promise<void> {
    if (!this.currentJob) return

    this.isPaused = false
    const recoveryState = this.getRecoveryState(this.currentJob.job_id)
    recoveryState.resumedAt = new Date().toISOString()

    await this.supabase
      .from("jobs")
      .update({
        status: "processing",
        recovery_state: recoveryState,
      })
      .eq("id", this.currentJob.job_id)

    await this.logJobMessage(this.currentJob.job_id, "info", "Job resumed by user request")
  }

  private async cancelJob(): Promise<void> {
    if (!this.currentJob) return

    this.isCancelled = true
    const recoveryState = this.getRecoveryState(this.currentJob.job_id)

    await this.supabase
      .from("jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        recovery_state: recoveryState,
      })
      .eq("id", this.currentJob.job_id)

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

        // Save the retried record
        await this.supabase.from("generated_data").insert({
          job_id: this.currentJob.job_id,
          tenant_id: this.currentJob.tenant_id,
          record_data: record,
          record_index: recordIndex,
          created_at: new Date().toISOString(),
        })

        // Remove from failed records list
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

    // Update recovery state
    await this.supabase.from("jobs").update({ recovery_state: recoveryState }).eq("id", this.currentJob.job_id)
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
    try {
      const { data: jobs, error } = await this.supabase
        .from("jobs")
        .select(`
          id,
          tenant_id,
          schema_id,
          name,
          total_records,
          config,
          recovery_state,
          schemas!inner(schema_definition)
        `)
        .in("status", ["pending", "paused"]) // Also process paused jobs
        .order("created_at", { ascending: true })
        .limit(1)

      if (error) {
        console.error("Error getting next job:", error)
        return false
      }

      if (!jobs || jobs.length === 0) {
        return false
      }

      const jobRow = jobs[0]
      const job: JobData = {
        job_id: jobRow.id,
        tenant_id: jobRow.tenant_id,
        schema_id: jobRow.schema_id,
        name: jobRow.name,
        total_records: jobRow.total_records,
        config: jobRow.config || {},
        schema_definition: jobRow.schemas.schema_definition,
      }

      this.currentJob = job
      this.isPaused = false
      this.isCancelled = false

      if (jobRow.recovery_state) {
        this.recoveryStates.set(job.job_id, jobRow.recovery_state)
      }

      console.log(`[SERVER][JobProcessor] Processing job ${job.job_id}: ${job.name}`)

      const textModel = job.config.text_model || "google/gemini-2.5-flash"
      const imageModel = job.config.image_model || "black-forest-labs/flux-1.1-pro"

      this.aiGenerator.setModel(textModel)

      await this.supabase
        .from("jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
        })
        .eq("id", job.job_id)

      await this.logJobMessage(job.job_id, "info", `Started processing job: ${job.name}`, {
        textModel,
        imageModel,
        config: job.config,
      })

      await this.generateData(job)

      if (!this.isCancelled && !this.isPaused) {
        await this.supabase
          .from("jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            progress: 100,
          })
          .eq("id", job.job_id)

        await this.logJobMessage(job.job_id, "info", `Completed job: ${job.name}`)
      }

      this.currentJob = null
      return true
    } catch (error) {
      console.error("[SERVER][JobProcessor] Error processing job:", error)

      if (this.currentJob) {
        const recoveryState = this.getRecoveryState(this.currentJob.job_id)

        await this.supabase
          .from("jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            completed_at: new Date().toISOString(),
            recovery_state: recoveryState,
          })
          .eq("id", this.currentJob.job_id)

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

    console.log(`[SERVER][JobProcessor] Generating ${total_records} records for ${fields.length} fields`)

    const batchSize = Math.min(config.batch_size || 5, 10)
    const recoveryState = this.getRecoveryState(job_id)
    let generatedCount = recoveryState.lastSuccessfulRecord + 1 // Resume from last successful record

    for (let i = generatedCount; i < total_records; i += batchSize) {
      if (this.isCancelled) {
        await this.logJobMessage(job_id, "info", "Job generation cancelled")
        return
      }

      if (this.isPaused) {
        await this.logJobMessage(job_id, "info", "Job generation paused")
        return
      }

      const batchEnd = Math.min(i + batchSize, total_records)
      const batch: GeneratedRecord[] = []

      for (let recordIndex = i; recordIndex < batchEnd; recordIndex++) {
        try {
          const record = await this.generateSingleRecordWithRetry(fields, recordIndex, job)
          batch.push(record)

          generatedCount++
          recoveryState.lastSuccessfulRecord = recordIndex // Track successful records
          const progress = Math.floor((generatedCount / total_records) * 100)

          await this.supabase
            .from("jobs")
            .update({
              generated_records: generatedCount,
              progress: progress,
              recovery_state: recoveryState, // Save recovery state
            })
            .eq("id", job_id)

          console.log(`[SERVER][JobProcessor] Generated record ${generatedCount}/${total_records} (${progress}%)`)
        } catch (error) {
          console.error(`[SERVER][JobProcessor] Error generating record ${recordIndex}:`, error)

          recoveryState.failedRecords.push(recordIndex)

          await this.logJobMessage(job_id, "error", `Failed to generate record ${recordIndex}`, {
            error: error instanceof Error ? error.message : "Unknown error",
            recordIndex,
          })
        }
      }

      if (batch.length > 0) {
        const recordsToInsert = batch.map((record, batchIndex) => ({
          job_id,
          tenant_id,
          record_data: record,
          record_index: i + batchIndex,
          created_at: new Date().toISOString(),
        }))

        const { error: insertError } = await this.supabase.from("generated_data").insert(recordsToInsert)

        if (insertError) {
          console.error(`[SERVER][JobProcessor] Failed to save batch:`, insertError)
          throw new Error(`Failed to save generated data: ${insertError.message}`)
        }
      }

      const delay = fields.some((f) => this.shouldUseAI(f.type)) ? 200 : 50
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
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

        // Clear retry count on success
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
    const record: GeneratedRecord = {}

    const textFields = fields.filter((field) => field.type !== "image")
    const imageFields = fields.filter((field) => field.type === "image")

    for (const field of textFields) {
      const context: GenerationContext = {
        fieldType: field.type,
        fieldName: field.name,
        fieldDescription: field.description,
        recordIndex,
        existingData: record,
        tenantContext: job.tenant_id,
      }

      if (this.shouldUseAI(field.type)) {
        record[field.name] = await this.aiGenerator.generateFieldValue(context)
      } else {
        record[field.name] = await this.generateFieldValue(field, recordIndex)
      }
    }

    if (job.config.enable_images !== false) {
      for (const field of imageFields) {
        try {
          const imageUrl = await this.generateAIImage(field, record, recordIndex, job)
          record[field.name] = imageUrl
        } catch (error) {
          console.error(`[SERVER][JobProcessor] Failed to generate image for ${field.name}:`, error)
          record[field.name] = this.generatePlaceholderImage(recordIndex)
        }
      }
    }

    return record
  }

  private async generateAIImage(
    field: any,
    recordData: Record<string, any>,
    recordIndex: number,
    job: JobData,
  ): Promise<string> {
    try {
      const imagesPerRecord = job.config.images_per_record || 1
      const imageModel = job.config.image_model || "black-forest-labs/flux-1.1-pro"

      const contextPrompt = this.buildImagePrompt(field, recordData)

      console.log(`[SERVER][JobProcessor] Generating ${imagesPerRecord} image(s) for ${field.name} using ${imageModel}`)

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

      await this.supabase.from("media").insert({
        tenant_id: job.tenant_id,
        job_id: job.job_id,
        record_id: `record_${recordIndex}`,
        field_name: field.name,
        s3_key: imageResult.s3Key,
        s3_url: imageResult.url,
        content_type: "image/png",
        file_size: imageResult.fileSize || 0,
        md5_hash: imageResult.md5Hash || "",
        model_used: imageModel,
        prompt_used: contextPrompt,
        generation_metadata: {
          recordData: recordData,
          fieldDescription: field.description,
          imagesPerRecord,
          generationTime: new Date().toISOString(),
        },
      })

      await this.logJobMessage(job.job_id, "info", `Generated AI image for field: ${field.name}`, {
        model: imageModel,
        s3Key: imageResult.s3Key,
        prompt: contextPrompt,
      })

      return imageResult.url
    } catch (error) {
      console.error(`[SERVER][JobProcessor] Failed to generate AI image for field ${field.name}:`, error)
      await this.logJobMessage(job.job_id, "error", `Failed to generate AI image for field: ${field.name}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      })
      return this.generatePlaceholderImage(recordIndex)
    }
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
      case "image":
        return this.generatePlaceholderImage(recordIndex)
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

  private generatePlaceholderImage(index: number): string {
    const width = 400
    const height = 400
    const seed = index
    return `/placeholder.svg?height=${height}&width=${width}&query=profile-photo-${seed}`
  }

  private async logJobMessage(jobId: string, level: string, message: string, metadata: any = {}): Promise<void> {
    try {
      await this.supabase.from("job_logs").insert({
        job_id: jobId,
        level,
        message,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          processor_version: "2.0",
        },
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error("[SERVER][JobProcessor] Error logging job message:", error)
    }
  }
}
