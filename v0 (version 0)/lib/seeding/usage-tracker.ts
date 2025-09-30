import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export interface GenerationPattern {
  id: string
  job_id: string
  pattern_hash: string
  pattern_data: Record<string, any>
  created_at: string
}

export class UsageTracker {
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

  async recordGenerationPattern(jobId: string, patternData: Record<string, any>): Promise<void> {
    console.log("[v0] Recording generation pattern for job:", jobId)

    // Create a hash of the pattern data for quick comparison
    const patternHash = this.createPatternHash(patternData)

    try {
      const { error } = await this.supabase.from("generation_patterns").insert({
        job_id: jobId,
        pattern_hash: patternHash,
        pattern_data: patternData,
      })

      if (error) {
        console.error("[v0] Error recording generation pattern:", error)
        throw error
      }

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
      const { data: exactMatches, error } = await this.supabase
        .from("generation_patterns")
        .select("*")
        .eq("pattern_hash", patternHash)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

      if (error) {
        console.error("[v0] Error checking pattern similarity:", error)
        return false
      }

      if (exactMatches && exactMatches.length > 0) {
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
      let query = this.supabase
        .from("generation_patterns")
        .select("*")
        .gte("created_at", new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })

      if (jobId) {
        query = query.eq("job_id", jobId)
      }

      const { data, error } = await query

      if (error) {
        console.error("[v0] Error fetching recent patterns:", error)
        throw error
      }

      console.log("[v0] Found recent patterns:", data?.length || 0)
      return data || []
    } catch (error) {
      console.error("[v0] Failed to get recent patterns:", error)
      return []
    }
  }

  async cleanupOldPatterns(daysToKeep = 30): Promise<void> {
    console.log("[v0] Cleaning up patterns older than", daysToKeep, "days")

    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()

      const { error } = await this.supabase.from("generation_patterns").delete().lt("created_at", cutoffDate)

      if (error) {
        console.error("[v0] Error cleaning up old patterns:", error)
        throw error
      }

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

      const { data, error } = await this.supabase.from("seed_usage").select("*").eq("seed_id", seedId)

      if (error) {
        console.error("[v0] Error fetching seed usage stats:", error)
        throw error
      }

      const totalUsage = data?.length || 0
      const recentUsage = data?.filter((usage) => usage.used_at >= cutoffDate).length || 0

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
