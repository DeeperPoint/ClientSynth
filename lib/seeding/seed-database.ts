import { query } from "@/lib/postgres/client"

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
  async getSeedCategories(): Promise<SeedCategory[]> {
    console.log("[v0] Fetching seed categories")
    const result = await query<SeedCategory>(
      `SELECT id, name, description, field_types, created_at, updated_at FROM seed_categories ORDER BY name`
    )
    console.log("[v0] Found seed categories:", result.rows.length)
    return result.rows
  }

  async getSeedsByCategory(categoryId: string, seedType?: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for category:", categoryId, "type:", seedType)

    const baseSql = `
      SELECT *
      FROM seeds
      WHERE category_id = $1
        AND is_active = true
        ${seedType ? "AND seed_type = $2" : ""}
      ORDER BY quality_score DESC
    `
    const params = seedType ? [categoryId, seedType] : [categoryId]
    const result = await query<Seed>(baseSql, params)

    console.log("[v0] Found seeds:", result.rows.length)
    return result.rows
  }

  async getSeedsByFieldType(fieldType: string, seedType: string): Promise<Seed[]> {
    console.log("[v0] Fetching seeds for field type:", fieldType, "seed type:", seedType)

    const result = await query<
      Seed & {
        category_field_types: string[] | null
      }
    >(
      `
        SELECT s.*, sc.field_types AS category_field_types
        FROM seeds s
        INNER JOIN seed_categories sc ON sc.id = s.category_id
        WHERE s.seed_type = $1
          AND s.is_active = true
        ORDER BY s.quality_score DESC
      `,
      [seedType]
    )

    const filtered = result.rows.filter((row) => {
      const types = row.category_field_types
      return Array.isArray(types) ? types.includes(fieldType) : false
    })

    console.log("[v0] Found seeds for field type:", filtered.length)
    return filtered
  }

  async recordSeedUsage(seedId: string, jobId: string, context: Record<string, any> = {}): Promise<void> {
    console.log("[v0] Recording seed usage:", seedId, "for job:", jobId)

    await query(
      `
        INSERT INTO seed_usage (seed_id, job_id, context, cooldown_until)
        VALUES ($1, $2, $3::jsonb, $4)
      `,
      [seedId, jobId, JSON.stringify(context), new Date(Date.now() + 60 * 60 * 1000).toISOString()]
    )
    console.log("[v0] Seed usage recorded successfully")
  }

  async getAvailableSeeds(categoryId: string, seedType: string, _jobId: string): Promise<Seed[]> {
    console.log("[v0] Getting available seeds (not in cooldown) for category:", categoryId)

    const result = await query<Seed>(
      `
        SELECT *
        FROM seeds s
        WHERE s.category_id = $1
          AND s.seed_type = $2
          AND s.is_active = true
          AND NOT EXISTS (
            SELECT 1
            FROM seed_usage su
            WHERE su.seed_id = s.id
              AND su.cooldown_until IS NOT NULL
              AND su.cooldown_until > NOW()
          )
        ORDER BY s.quality_score DESC
      `,
      [categoryId, seedType]
    )

    console.log("[v0] Found available seeds:", result.rows.length)
    return result.rows
  }

  async addSeed(seed: Omit<Seed, "id" | "created_at" | "updated_at">): Promise<Seed> {
    console.log("[v0] Adding new seed:", seed.seed_type)

    const result = await query<Seed>(
      `
        INSERT INTO seeds (category_id, content, seed_type, quality_score, metadata, is_active)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        RETURNING *
      `,
      [
        seed.category_id,
        seed.content,
        seed.seed_type,
        seed.quality_score,
        JSON.stringify(seed.metadata),
        seed.is_active,
      ]
    )

    const inserted = result.rows[0]
    if (!inserted) {
      throw new Error("Failed to insert seed")
    }

    console.log("[v0] Seed added successfully:", inserted.id)
    return inserted
  }

  async updateSeedQuality(seedId: string, qualityScore: number): Promise<void> {
    console.log("[v0] Updating seed quality:", seedId, "score:", qualityScore)

    await query(
      `
        UPDATE seeds
        SET quality_score = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [qualityScore, seedId]
    )

    console.log("[v0] Seed quality updated successfully")
  }
}
