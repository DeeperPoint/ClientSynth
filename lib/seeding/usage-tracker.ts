import { query } from "@/lib/postgres/client"

export interface GenerationPattern {
  id: string
  job_id: string
  pattern_hash: string
  pattern_data: Record<string, any>
  created_at: string
}

export class UsageTracker {
  async recordGenerationPattern(jobId: string, patternData: Record<string, any>): Promise<void> {
    console.log("[v0] Recording generation pattern for job:", jobId)

    // Create a hash of the pattern data for quick comparison
    const patternHash = this.createPatternHash(patternData)

    try {
      await query(
        `
          INSERT INTO generation_patterns (job_id, pattern_hash, pattern_data)
          VALUES ($1, $2, $3::jsonb)
        `,
        [jobId, patternHash, JSON.stringify(patternData)]
      )
      console.log("[v0] Generation pattern recorded with hash:", patternHash)
    } catch (error) {
      console.error("[v0] Failed to record generation pattern:", error)
    }
  }

  async checkPatternSimilarity(patternData: Record<string, any>, threshold = 0.8): Promise<boolean> {
    console.log("[v0] Checking pattern similarity with threshold:", threshold)

    const patternHash = this.createPatternHash(patternData)

    try {
      // Check for exact hash matches first
      const result = await query(
        `
          SELECT 1
          FROM generation_patterns
          WHERE pattern_hash = $1
            AND created_at >= $2
        `,
        [patternHash, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]
      )

      if ((result.rows as Array<any>).length > 0) {
        console.log("[v0] Found exact pattern match, similarity detected")
        return true
      }

      // For more complex similarity checking, we could implement fuzzy matching here
      // For now, we'll use exact hash matching
      console.log("[v0] No similar patterns found")
      return false
    } catch (error) {
      console.error("[v0] Error in pattern similarity check:", error)
      return false
    }
  }

  async getRecentPatterns(jobId?: string, hours = 24): Promise<GenerationPattern[]> {
    console.log("[v0] Getting recent patterns for last", hours, "hours")

    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      const result = await query<GenerationPattern>(
        `
          SELECT *
          FROM generation_patterns
          WHERE created_at >= $1
            ${jobId ? "AND job_id = $2" : ""}
          ORDER BY created_at DESC
        `,
        jobId ? [cutoff, jobId] : [cutoff]
      )

      console.log("[v0] Found recent patterns:", result.rows.length)
      return result.rows
    } catch (error) {
      console.error("[v0] Failed to get recent patterns:", error)
      return []
    }
  }

  async cleanupOldPatterns(daysToKeep = 30): Promise<void> {
    console.log("[v0] Cleaning up patterns older than", daysToKeep, "days")

    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()

      await query(
        `
          DELETE FROM generation_patterns
          WHERE created_at < $1
        `,
        [cutoffDate]
      )

      console.log("[v0] Old patterns cleaned up successfully")
    } catch (error) {
      console.error("[v0] Failed to cleanup old patterns:", error)
    }
  }

  private createPatternHash(patternData: Record<string, any>): string {
    // Create a consistent hash from the pattern data
    const sortedKeys = Object.keys(patternData).sort()
    const normalizedData = sortedKeys.reduce(
      (acc, key) => {
        acc[key] = patternData[key]
        return acc
      },
      {} as Record<string, any>,
    )

    const dataString = JSON.stringify(normalizedData)

    // Simple hash function (in production, consider using crypto.createHash)
    let hash = 0
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16)
  }

  async getSeedUsageStats(
    seedId: string,
    days = 7,
  ): Promise<{
    totalUsage: number
    recentUsage: number
    averageQuality: number
  }> {
    console.log("[v0] Getting usage stats for seed:", seedId)

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const result = await query<{ used_at: string }>(
        `
          SELECT used_at
          FROM seed_usage
          WHERE seed_id = $1
        `,
        [seedId]
      )

      const totalUsage = result.rows.length
      const recentUsage = result.rows.filter((usage) => usage.used_at >= cutoffDate).length

      console.log("[v0] Seed usage stats - Total:", totalUsage, "Recent:", recentUsage)

      return {
        totalUsage,
        recentUsage,
        averageQuality: 0, // Could be calculated based on feedback if implemented
      }
    } catch (error) {
      console.error("[v0] Failed to get seed usage stats:", error)
      return { totalUsage: 0, recentUsage: 0, averageQuality: 0 }
    }
  }
}
