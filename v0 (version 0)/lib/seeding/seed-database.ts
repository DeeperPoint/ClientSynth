import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export interface SeedCategory {
  id: string
  name: string
  description: string
  field_types: string[]
  created_at: string
  updated_at: string
}

export interface Seed {
  id: string
  category_id: string
  content: string
  seed_type: "image_prompt" | "name_template" | "text_template"
  quality_score: number
  metadata: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SeedUsage {
  id: string
  seed_id: string
  job_id: string
  used_at: string
  context: Record<string, any>
  cooldown_until: string
}

export class SeedDatabase {
  private supabase

  constructor() {
    this.supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      cookies: {
        get: (name: string) => cookies().get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    })
  }

  async getSeedCategories(): Promise<SeedCategory[]> {
    console.log("[v0] Fetching seed categories")
    const { data, error } = await this.supabase.from("seed_categories").select("*").order("name")

    if (error) {
      console.error("[v0] Error fetching seed categories:", error)
      throw error
    }

    console.log("[v0] Found seed categories:", data?.length)
    return data || []
  }

  async getSeedsByCategory(categoryId: string, seedType?: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for category:", categoryId, "type:", seedType)

    let query = this.supabase
      .from("seeds")
      .select("*")
      .eq("category_id", categoryId)
      .eq("is_active", true)
      .order("quality_score", { ascending: false })

    if (seedType) {
      query = query.eq("seed_type", seedType)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching seeds:", error)
      throw error
    }

    console.log("[v0] Found seeds:", data?.length)
    return data || []
  }

  async getSeedsByFieldType(fieldType: string, seedType: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for field type:", fieldType, "seed type:", seedType)

    const { data, error } = await this.supabase
      .from("seeds")
      .select(`
        *,
        seed_categories!inner(field_types)
      `)
      .eq("seed_type", seedType)
      .eq("is_active", true)
      .contains("seed_categories.field_types", [fieldType])
      .order("quality_score", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching seeds by field type:", error)
      throw error
    }

    console.log("[v0] Found seeds for field type:", data?.length)
    return data || []
  }

  async recordSeedUsage(seedId: string, jobId: string, context: Record<string, any> = {}): Promise<void> {
    console.log("[v0] Recording seed usage:", seedId, "for job:", jobId)

    const { error } = await this.supabase.from("seed_usage").insert({
      seed_id: seedId,
      job_id: jobId,
      context,
      cooldown_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour cooldown
    })

    if (error) {
      console.error("[v0] Error recording seed usage:", error)
      throw error
    }

    console.log("[v0] Seed usage recorded successfully")
  }

  async getAvailableSeeds(categoryId: string, seedType: string, jobId: string): Promise<Seed[]> {
    console.log("[v0] Getting available seeds (not in cooldown) for category:", categoryId)

    const { data, error } = await this.supabase
      .from("seeds")
      .select(`
        *,
        seed_usage!left(cooldown_until)
      `)
      .eq("category_id", categoryId)
      .eq("seed_type", seedType)
      .eq("is_active", true)
      .or(`seed_usage.cooldown_until.is.null,seed_usage.cooldown_until.lt.${new Date().toISOString()}`)
      .order("quality_score", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching available seeds:", error)
      throw error
    }

    console.log("[v0] Found available seeds:", data?.length)
    return data || []
  }

  async addSeed(seed: Omit<Seed, "id" | "created_at" | "updated_at">): Promise<Seed> {
    console.log("[v0] Adding new seed:", seed.seed_type)

    const { data, error } = await this.supabase.from("seeds").insert(seed).select().single()

    if (error) {
      console.error("[v0] Error adding seed:", error)
      throw error
    }

    console.log("[v0] Seed added successfully:", data.id)
    return data
  }

  async updateSeedQuality(seedId: string, qualityScore: number): Promise<void> {
    console.log("[v0] Updating seed quality:", seedId, "score:", qualityScore)

    const { error } = await this.supabase
      .from("seeds")
      .update({
        quality_score: qualityScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seedId)

    if (error) {
      console.error("[v0] Error updating seed quality:", error)
      throw error
    }

    console.log("[v0] Seed quality updated successfully")
  }
}
