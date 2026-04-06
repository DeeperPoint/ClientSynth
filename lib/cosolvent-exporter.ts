import { query } from "@/lib/postgres/client"

export interface CosolventConfig {
  /** Base URL of CosolventAI (e.g. "http://localhost:8003") */
  baseUrl: string
  apiKey?: string
  batchSize?: number
  maxRetries?: number
}

interface ExportResult {
  totalSent: number
  totalFailed: number
  success: boolean
  errors: { recordIndex: number; error: string }[]
}

/**
 * CosolventExporter streams ClientSynth generated records into the
 * CosolventAI profile_service via its multipart registration endpoint.
 *
 * Cosolvent endpoint: POST {baseUrl}/profile/api/register
 * Expects: multipart/form-data matching ProducerRegisterSchema + files
 */
export class CosolventExporter {
  private config: Required<CosolventConfig>
  private readonly REGISTER_PATH = "/profile/api/register"

  constructor(config: CosolventConfig) {
    this.config = {
      apiKey: "",
      batchSize: 50,
      maxRetries: 3,
      ...config,
    }
  }

  /**
   * Stream all generated records for a job to Cosolvent one-by-one.
   * Used by the export API route (CS-301).
   */
  async streamExport(jobId: string, filters: { offset?: number; limit?: number } = {}): Promise<ExportResult> {
    const offset = filters.offset || 0
    const limit = filters.limit || 50000
    const batchSize = this.config.batchSize

    let totalSent = 0
    let totalFailed = 0
    let currentOffset = offset
    const errors: ExportResult["errors"] = []

    while (totalSent + totalFailed < limit) {
      const fetchLimit = Math.min(batchSize, limit - totalSent - totalFailed)

      const result = await query(
        `SELECT record_data, record_index FROM generated_data WHERE job_id = $1 ORDER BY record_index ASC OFFSET $2 LIMIT $3`,
        [jobId, currentOffset, fetchLimit]
      )

      if (!result.rows || result.rows.length === 0) break

      for (const row of result.rows) {
        try {
          await this.registerOneProfile(row.record_data, row.record_index)
          totalSent++
        } catch (err) {
          totalFailed++
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ recordIndex: row.record_index, error: msg })
          console.warn(`[CosolventExporter] Record ${row.record_index} failed: ${msg}`)
        }
      }

      currentOffset += result.rows.length
    }

    return { totalSent, totalFailed, success: errors.length === 0, errors }
  }

  /**
   * Export a single batch of raw records (used by job-processor for CS-302 live hydration).
   */
  async exportBatch(records: any[]): Promise<void> {
    for (let i = 0; i < records.length; i++) {
      await this.registerOneProfile(records[i], i)
    }
  }

  // ── Core: register one profile via multipart form ──────────────────

  private async registerOneProfile(record: any, index: number): Promise<void> {
    const mapped = this.mapToCosolventFields(record, index)
    const form = this.buildFormData(mapped)

    const url = `${this.config.baseUrl}${this.REGISTER_PATH}`
    const headers: Record<string, string> = {
      "User-Agent": "ClientSynth-Cosolvent-Exporter/1.0",
    }
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`
    }

    let attempt = 0
    let lastError: Error | null = null

    while (attempt < this.config.maxRetries) {
      try {
        const response = await fetch(url, { method: "POST", headers, body: form })

        if (response.ok) return // 2xx → success

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After")
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt + 1) * 1000
          console.warn(`[CosolventExporter] Rate limited. Waiting ${delay}ms...`)
          await this.sleep(delay)
          attempt++
          continue
        }

        if (response.status === 409) {
          // Profile already exists — treat as success (idempotent)
          console.log(`[CosolventExporter] Record ${index} already registered (409). Skipping.`)
          return
        }

        const body = await response.text()
        throw new Error(`Cosolvent returned ${response.status}: ${body}`)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        attempt++
        if (attempt < this.config.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000
          console.warn(`[CosolventExporter] Attempt ${attempt} failed. Retrying in ${delay}ms...`)
          await this.sleep(delay)
        }
      }
    }

    throw new Error(
      `Failed to register record ${index} after ${this.config.maxRetries} attempts. Last error: ${lastError?.message}`
    )
  }

  // ── Field mapping: ClientSynth → Cosolvent ProducerRegisterSchema ──

  private mapToCosolventFields(record: any, index: number) {
    // ClientSynth records have dynamic, schema-driven field names.
    // We do a best-effort mapping to Cosolvent's fixed ProducerRegisterSchema.
    const r = record

    const findField = (candidates: string[], fallback: string) => {
      for (const key of candidates) {
        const lower = key.toLowerCase()
        for (const [rKey, rVal] of Object.entries(r)) {
          if (rKey.toLowerCase() === lower && rVal != null && String(rVal).trim()) {
            return String(rVal).trim()
          }
        }
      }
      return fallback
    }

    const findNumericField = (candidates: string[], fallback: number) => {
      for (const key of candidates) {
        const lower = key.toLowerCase()
        for (const [rKey, rVal] of Object.entries(r)) {
          if (rKey.toLowerCase() === lower && rVal != null) {
            const n = parseFloat(String(rVal))
            if (!isNaN(n)) return n
          }
        }
      }
      return fallback
    }

    const findListField = (candidates: string[]): string[] => {
      for (const key of candidates) {
        const lower = key.toLowerCase()
        for (const [rKey, rVal] of Object.entries(r)) {
          if (rKey.toLowerCase() === lower && rVal != null) {
            if (Array.isArray(rVal)) return rVal.map(String)
            const str = String(rVal).trim()
            if (str) return str.split(",").map(s => s.trim()).filter(Boolean)
          }
        }
      }
      return []
    }

    return {
      farmName: findField(["farm_name", "farmName", "company", "company_name", "name", "organization"], `Synth-Farm-${index}`),
      contactName: findField(["contact_name", "contactName", "full_name", "name", "contact", "first_name"], `Contact-${index}`),
      email: findField(["email", "contact_email", "email_address"], `synth-${index}-${Date.now()}@clientsynth.gen`),
      phone: findField(["phone", "phone_number", "tel", "contact_phone"], "+1-555-000-0000"),
      address: findField(["address", "street_address", "location", "street"], "Generated Address"),
      country: findField(["country", "nation"], "United States"),
      region: findField(["region", "state", "province", "area", "city"], "Default Region"),
      farmSize: findNumericField(["farm_size", "farmSize", "size", "area_acres"], 10),
      annualProduction: findNumericField(["annual_production", "annualProduction", "production", "output"], 1000),
      farmDescription: findField(["farm_description", "farmDescription", "description", "bio", "about"], "Synthetically generated farm profile."),
      exportExperience: findField(["export_experience", "exportExperience", "experience", "years_experience"], "New exporter"),
      primaryCrops: findListField(["primary_crops", "primaryCrops", "crops", "products"]),
      certifications: findListField(["certifications", "certs", "certificates"]),
    }
  }

  // ── Form construction ──────────────────────────────────────────────

  private buildFormData(mapped: ReturnType<typeof this.mapToCosolventFields>): FormData {
    const form = new FormData()

    form.append("farmName", mapped.farmName)
    form.append("contactName", mapped.contactName)
    form.append("email", mapped.email)
    form.append("phone", mapped.phone)
    form.append("address", mapped.address)
    form.append("country", mapped.country)
    form.append("region", mapped.region)
    form.append("farmSize", String(mapped.farmSize))
    form.append("annualProduction", String(mapped.annualProduction))
    form.append("farmDescription", mapped.farmDescription)
    form.append("exportExperience", mapped.exportExperience)
    form.append("primaryCrops", JSON.stringify(mapped.primaryCrops))
    form.append("certifications", JSON.stringify(mapped.certifications))

    // Cosolvent requires at least one file upload.
    // Create a minimal placeholder text file.
    const placeholderContent = `ClientSynth Export\nProfile: ${mapped.farmName}\nGenerated: ${new Date().toISOString()}`
    const blob = new Blob([placeholderContent], { type: "text/plain" })
    form.append("files", blob, "clientsynth_export.txt")
    form.append("files_metadata", JSON.stringify([{ filename: "clientsynth_export.txt", file_type: "document" }]))

    return form
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
