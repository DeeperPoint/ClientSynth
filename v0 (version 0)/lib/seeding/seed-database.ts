// import { createServerClient } from "@supabase/ssr" // disabled in local backend mode
// Local backend integration: disable Supabase-based seeding utilities

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
  constructor() {}

  async getSeedCategories(): Promise<SeedCategory[]> {
    console.log("[v0] Fetching seed categories")
    console.log("[v0] Seed categories are disabled in local backend mode")
    return []
  }

  async getSeedsByCategory(categoryId: string, seedType?: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for category:", categoryId, "type:", seedType)

    console.log("[v0] Seeds fetching is disabled in local backend mode")
    return []
  }

  async getSeedsByFieldType(fieldType: string, seedType: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for field type:", fieldType, "seed type:", seedType)

    console.log("[v0] Seeds by field type disabled in local backend mode")
    return []
  }

  async recordSeedUsage(seedId: string, jobId: string, context: Record<string, any> = {}): Promise<void> {
    console.log("[v0] Recording seed usage:", seedId, "for job:", jobId)

    console.log("[v0] Seed usage recording disabled in local backend mode")
  }

  async getAvailableSeeds(categoryId: string, seedType: string, jobId: string): Promise<Seed[]> {
    console.log("[v0] Getting available seeds (not in cooldown) for category:", categoryId)

    console.log("[v0] Available seeds disabled in local backend mode")
    return []
  }

  async addSeed(seed: Omit<Seed, "id" | "created_at" | "updated_at">): Promise<Seed> {
    console.log("[v0] Adding new seed:", seed.seed_type)

    console.log("[v0] Add seed disabled in local backend mode")
    return {
      ...(seed as any),
      id: "disabled",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async updateSeedQuality(seedId: string, qualityScore: number): Promise<void> {
    console.log("[v0] Updating seed quality:", seedId, "score:", qualityScore)

    console.log("[v0] Update seed quality disabled in local backend mode")
  }
}
