import { SeedDatabase, type Seed } from "./seed-database"

export interface SeedSelectionOptions {
  fieldType: string
  seedType: "image_prompt" | "name_template" | "text_template"
  jobId: string
  context?: Record<string, any>
  excludeRecent?: boolean
  qualityThreshold?: number
}

export class SeedSelector {
  private seedDb: SeedDatabase

  constructor() {
    this.seedDb = new SeedDatabase()
  }

  async selectSeed(options: SeedSelectionOptions): Promise<Seed | null> {
    console.log("[v0] Selecting seed for field type:", options.fieldType, "seed type:", options.seedType)

    try {
      // Get seeds that match the field type and aren't in cooldown
      const availableSeeds = await this.seedDb.getSeedsByFieldType(options.fieldType, options.seedType)

      if (availableSeeds.length === 0) {
        console.log("[v0] No available seeds found for field type:", options.fieldType)
        return null
      }

      // Filter by quality threshold if specified
      let filteredSeeds = availableSeeds
      if (options.qualityThreshold) {
        filteredSeeds = availableSeeds.filter((seed) => seed.quality_score >= options.qualityThreshold)
      }

      if (filteredSeeds.length === 0) {
        console.log("[v0] No seeds meet quality threshold:", options.qualityThreshold)
        filteredSeeds = availableSeeds // Fallback to all available seeds
      }

      // Weighted random selection based on quality score
      const selectedSeed = this.weightedRandomSelection(filteredSeeds)

      if (selectedSeed) {
        // Record usage to prevent immediate repetition
        await this.seedDb.recordSeedUsage(selectedSeed.id, options.jobId, options.context || {})

        console.log("[v0] Selected seed:", selectedSeed.id, "quality:", selectedSeed.quality_score)
      }

      return selectedSeed
    } catch (error) {
      console.error("[v0] Error selecting seed:", error)
      return null
    }
  }

  private weightedRandomSelection(seeds: Seed[]): Seed | null {
    if (seeds.length === 0) return null
    if (seeds.length === 1) return seeds[0]

    // Calculate weights based on quality scores
    const weights = seeds.map((seed) => Math.max(seed.quality_score, 1)) // Minimum weight of 1
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

    // Generate random number
    const random = Math.random() * totalWeight

    // Select seed based on weighted probability
    let currentWeight = 0
    for (let i = 0; i < seeds.length; i++) {
      currentWeight += weights[i]
      if (random <= currentWeight) {
        console.log("[v0] Weighted selection chose seed with quality:", seeds[i].quality_score)
        return seeds[i]
      }
    }

    // Fallback to last seed (shouldn't happen)
    return seeds[seeds.length - 1]
  }

  async selectMultipleSeeds(options: SeedSelectionOptions, count: number): Promise<Seed[]> {
    console.log("[v0] Selecting multiple seeds:", count, "for field type:", options.fieldType)

    const selectedSeeds: Seed[] = []
    const usedSeedIds = new Set<string>()

    for (let i = 0; i < count; i++) {
      const availableSeeds = await this.seedDb.getSeedsByFieldType(options.fieldType, options.seedType)

      // Filter out already used seeds in this batch
      const filteredSeeds = availableSeeds.filter((seed) => !usedSeedIds.has(seed.id))

      if (filteredSeeds.length === 0) {
        console.log("[v0] No more unique seeds available, stopping at:", selectedSeeds.length)
        break
      }

      const selectedSeed = this.weightedRandomSelection(filteredSeeds)
      if (selectedSeed) {
        selectedSeeds.push(selectedSeed)
        usedSeedIds.add(selectedSeed.id)

        // Record usage
        await this.seedDb.recordSeedUsage(selectedSeed.id, options.jobId, { ...options.context, batch_index: i })
      }
    }

    console.log("[v0] Selected seeds batch:", selectedSeeds.length, "out of", count, "requested")
    return selectedSeeds
  }

  async getRecommendedSeeds(fieldType: string, limit = 10): Promise<Seed[]> {
    console.log("[v0] Getting recommended seeds for field type:", fieldType)

    try {
      const seeds = await this.seedDb.getSeedsByFieldType(fieldType, "image_prompt")
      return seeds.slice(0, limit)
    } catch (error) {
      console.error("[v0] Error getting recommended seeds:", error)
      return []
    }
  }
}
