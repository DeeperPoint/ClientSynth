import { createClient } from "@/lib/supabase/server"
import { AIGenerator, type GenerationContext } from "@/lib/ai-generator"
import { ImageGenerator } from "@/lib/image-generator"

export interface JobData {
  job_id: string
  tenant_id: string
  schema_id: string
  name: string
  total_records: number
  config: any
  schema_definition: any
}

export interface GeneratedRecord {
  [key: string]: any
}

export class JobProcessor {
  private supabase = createClient()
  private aiGenerator = new AIGenerator()
  private imageGenerator = new ImageGenerator()
  private currentJob: JobData | null = null

  async processNextJob(): Promise<boolean> {
    try {
      // Get next job from queue
      const { data: jobs, error } = await (await this.supabase).rpc("get_next_job")

      if (error) {
        console.error("Error getting next job:", error)
        return false
      }

      if (!jobs || jobs.length === 0) {
        return false // No jobs to process
      }

      const job = jobs[0] as JobData
      this.currentJob = job
      console.log(`[JobProcessor] Processing job ${job.job_id}: ${job.name}`)

      await this.logJobMessage(job.job_id, "info", `Started processing job: ${job.name}`)

      // Process the job
      await this.generateData(job)

      // Mark job as completed
      await (await this.supabase).rpc("complete_job", {
        p_job_id: job.job_id,
        p_success: true,
      })

      await this.logJobMessage(job.job_id, "info", `Completed job: ${job.name}`)

      this.currentJob = null

      return true
    } catch (error) {
      console.error("Error processing job:", error)
      this.currentJob = null
      return false
    }
  }

  private async generateData(job: JobData): Promise<void> {
    const { schema_definition, total_records, job_id, tenant_id } = job
    const fields = schema_definition?.fields || []

    console.log(`[JobProcessor] Generating ${total_records} records for ${fields.length} fields`)

    const batchSize = 10 // Process in batches
    let generatedCount = 0

    for (let i = 0; i < total_records; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, total_records)
      const batch: GeneratedRecord[] = []

      // Generate batch of records
      for (let recordIndex = i; recordIndex < batchEnd; recordIndex++) {
        const record = await this.generateSingleRecord(fields, recordIndex)
        batch.push(record)
      }

      // Save batch to database
      const recordsToInsert = batch.map((record, batchIndex) => ({
        job_id,
        tenant_id,
        record_data: record,
        record_index: i + batchIndex,
      }))

      const { error: insertError } = await (await this.supabase).from("generated_data").insert(recordsToInsert)

      if (insertError) {
        throw new Error(`Failed to save generated data: ${insertError.message}`)
      }

      generatedCount += batch.length

      // Update progress
      await (await this.supabase).rpc("update_job_progress", {
        p_job_id: job_id,
        p_generated_records: generatedCount,
      })

      console.log(`[JobProcessor] Generated ${generatedCount}/${total_records} records`)

      // Small delay to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private async generateSingleRecord(fields: any[], recordIndex: number): Promise<GeneratedRecord> {
    const record: GeneratedRecord = {}

    // Generate fields in order to build context for later fields
    for (const field of fields) {
      const context: GenerationContext = {
        fieldType: field.type,
        fieldName: field.name,
        fieldDescription: field.description,
        recordIndex,
        existingData: record, // Pass already generated fields as context
      }

      if (this.shouldUseAI(field.type)) {
        record[field.name] = await this.aiGenerator.generateFieldValue(context)
      } else if (field.type === "image" && field.config?.useAI) {
        record[field.name] = await this.generateAIImage(field, record, recordIndex)
      } else {
        record[field.name] = await this.generateFieldValue(field, recordIndex)
      }
    }

    return record
  }

  private async generateAIImage(field: any, recordData: Record<string, any>, recordIndex: number): Promise<string> {
    try {
      const job = await this.getCurrentJob()
      if (!job) throw new Error("No current job context")

      const prompt = field.config?.prompt || "Professional headshot photo of a person"
      const model = field.config?.model || "black-forest-labs/flux-schnell"

      const imageUrl = await this.imageGenerator.generateAndUploadImage({
        tenantId: job.tenant_id,
        jobId: job.job_id,
        recordId: `record_${recordIndex}`,
        prompt,
        model,
        recordData,
      })

      await this.logJobMessage(job.job_id, "info", `Generated AI image for field: ${field.name}`)
      return imageUrl
    } catch (error) {
      console.error(`Failed to generate AI image for field ${field.name}:`, error)
      await this.logJobMessage(
        (await this.getCurrentJob())?.job_id || "unknown",
        "error",
        `Failed to generate AI image for field: ${field.name}`,
        { error: error.message },
      )
      return "" // Return empty string on failure
    }
  }

  private async getCurrentJob(): Promise<JobData | null> {
    return this.currentJob
  }

  private shouldUseAI(fieldType: string): boolean {
    // Use AI for text-based fields that benefit from context and creativity
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
    ]
    return aiFields.includes(fieldType)
  }

  private async generateFieldValue(field: any, recordIndex: number): Promise<any> {
    const { type, name } = field

    // Simple synthetic data generation (will be enhanced with LLM in next task)
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
      await (await this.supabase).from("job_logs").insert({
        job_id: jobId,
        level,
        message,
        metadata,
      })
    } catch (error) {
      console.error("Error logging job message:", error)
    }
  }
}
