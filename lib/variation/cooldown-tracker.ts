import { createServerClient } from "@/lib/supabase/server"

export interface CooldownEntry {
  id: string
  resource_type: "seed" | "pattern" | "value"
  resource_id: string
  job_id: string
  cooldown_until: string
  metadata: Record<string, any>
  created_at: string
}

export class CooldownTracker {
  private supabase
  private defaultCooldowns = {
    seed: 60 * 60 * 1000, // 1 hour
    pattern: 30 * 60 * 1000, // 30 minutes
    value: 15 * 60 * 1000, // 15 minutes
  }

  constructor() {
    this.supabase = createServerClient()
  }

  async addCooldown(
    resourceType: "seed" | "pattern" | "value",
    resourceId: string,
    jobId: string,
    customDuration?: number,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    console.log("[v0] Adding cooldown for", resourceType, ":", resourceId)

    const duration = customDuration || this.defaultCooldowns[resourceType]
    const cooldownUntil = new Date(Date.now() + duration).toISOString()

    try {
      // Use seed_usage table for seed cooldowns, create new table for others if needed
      if (resourceType === "seed") {
        const { error } = await this.supabase.from("seed_usage").insert({
          seed_id: resourceId,
          job_id: jobId,
          context: metadata,
          cooldown_until: cooldownUntil,
        })

        if (error) {
          console.error("[v0] Error adding seed cooldown:", error)
          throw error
        }
      } else {
        // For patterns and values, we'll store in generation_patterns with special metadata
        const { error } = await this.supabase.from("generation_patterns").insert({
          job_id: jobId,
          pattern_hash: `${resourceType}_${resourceId}`,
          pattern_data: {
            type: "cooldown",
            resource_type: resourceType,
            resource_id: resourceId,
            cooldown_until: cooldownUntil,
            metadata,
          },
        })

        if (error) {
          console.error("[v0] Error adding cooldown:", error)
          throw error
        }
      }

      console.log("[v0] Cooldown added until:", cooldownUntil)
    } catch (error) {
      console.error("[v0] Failed to add cooldown:", error)
    }
  }

  async isInCooldown(resourceType: "seed" | "pattern" | "value", resourceId: string): Promise<boolean> {
    console.log("[v0] Checking cooldown status for", resourceType, ":", resourceId)

    try {
      const now = new Date().toISOString()

      if (resourceType === "seed") {
        const { data, error } = await this.supabase
          .from("seed_usage")
          .select("cooldown_until")
          .eq("seed_id", resourceId)
          .gt("cooldown_until", now)
          .order("cooldown_until", { ascending: false })
          .limit(1)

        if (error) {
          console.error("[v0] Error checking seed cooldown:", error)
          return false
        }

        const inCooldown = data && data.length > 0
        console.log("[v0] Seed cooldown status:", inCooldown)
        return inCooldown
      } else {
        const { data, error } = await this.supabase
          .from("generation_patterns")
          .select("pattern_data")
          .eq("pattern_hash", `${resourceType}_${resourceId}`)
          .gt("pattern_data->cooldown_until", now)
          .order("created_at", { ascending: false })
          .limit(1)

        if (error) {
          console.error("[v0] Error checking cooldown:", error)
          return false
        }

        const inCooldown = data && data.length > 0
        console.log("[v0] Cooldown status:", inCooldown)
        return inCooldown
      }
    } catch (error) {
      console.error("[v0] Failed to check cooldown:", error)
      return false
    }
  }

  async getCooldownInfo(
    resourceType: "seed" | "pattern" | "value",
    resourceId: string,
  ): Promise<{
    inCooldown: boolean
    cooldownUntil?: string
    remainingTime?: number
    metadata?: Record<string, any>
  }> {
    console.log("[v0] Getting cooldown info for", resourceType, ":", resourceId)

    try {
      const now = new Date().toISOString()

      if (resourceType === "seed") {
        const { data, error } = await this.supabase
          .from("seed_usage")
          .select("cooldown_until, context")
          .eq("seed_id", resourceId)
          .gt("cooldown_until", now)
          .order("cooldown_until", { ascending: false })
          .limit(1)

        if (error) {
          console.error("[v0] Error getting seed cooldown info:", error)
          return { inCooldown: false }
        }

        if (data && data.length > 0) {
          const cooldownUntil = data[0].cooldown_until
          const remainingTime = new Date(cooldownUntil).getTime() - Date.now()

          return {
            inCooldown: true,
            cooldownUntil,
            remainingTime,
            metadata: data[0].context,
          }
        }
      } else {
        const { data, error } = await this.supabase
          .from("generation_patterns")
          .select("pattern_data")
          .eq("pattern_hash", `${resourceType}_${resourceId}`)
          .gt("pattern_data->cooldown_until", now)
          .order("created_at", { ascending: false })
          .limit(1)

        if (error) {
          console.error("[v0] Error getting cooldown info:", error)
          return { inCooldown: false }
        }

        if (data && data.length > 0) {
          const patternData = data[0].pattern_data
          const cooldownUntil = patternData.cooldown_until
          const remainingTime = new Date(cooldownUntil).getTime() - Date.now()

          return {
            inCooldown: true,
            cooldownUntil,
            remainingTime,
            metadata: patternData.metadata,
          }
        }
      }

      return { inCooldown: false }
    } catch (error) {
      console.error("[v0] Failed to get cooldown info:", error)
      return { inCooldown: false }
    }
  }

  async getActiveCooldowns(jobId?: string): Promise<{
    seeds: number
    patterns: number
    values: number
    total: number
  }> {
    console.log("[v0] Getting active cooldowns count")

    try {
      const now = new Date().toISOString()

      // Count seed cooldowns
      let seedQuery = this.supabase.from("seed_usage").select("id", { count: "exact" }).gt("cooldown_until", now)

      if (jobId) {
        seedQuery = seedQuery.eq("job_id", jobId)
      }

      const { count: seedCount, error: seedError } = await seedQuery

      if (seedError) {
        console.error("[v0] Error counting seed cooldowns:", seedError)
      }

      // Count pattern and value cooldowns
      let patternQuery = this.supabase
        .from("generation_patterns")
        .select("id", { count: "exact" })
        .gt("pattern_data->cooldown_until", now)
        .eq("pattern_data->type", "cooldown")

      if (jobId) {
        patternQuery = patternQuery.eq("job_id", jobId)
      }

      const { count: patternCount, error: patternError } = await patternQuery

      if (patternError) {
        console.error("[v0] Error counting pattern cooldowns:", patternError)
      }

      const seeds = seedCount || 0
      const patterns = patternCount || 0
      const values = 0 // Would need separate tracking for values
      const total = seeds + patterns + values

      console.log("[v0] Active cooldowns - Seeds:", seeds, "Patterns:", patterns, "Total:", total)

      return { seeds, patterns, values, total }
    } catch (error) {
      console.error("[v0] Failed to get active cooldowns:", error)
      return { seeds: 0, patterns: 0, values: 0, total: 0 }
    }
  }

  async cleanupExpiredCooldowns(): Promise<void> {
    console.log("[v0] Cleaning up expired cooldowns")

    try {
      const now = new Date().toISOString()

      // Clean up expired seed cooldowns
      const { error: seedError } = await this.supabase.from("seed_usage").delete().lt("cooldown_until", now)

      if (seedError) {
        console.error("[v0] Error cleaning up seed cooldowns:", seedError)
      }

      // Clean up expired pattern cooldowns
      const { error: patternError } = await this.supabase
        .from("generation_patterns")
        .delete()
        .lt("pattern_data->cooldown_until", now)
        .eq("pattern_data->type", "cooldown")

      if (patternError) {
        console.error("[v0] Error cleaning up pattern cooldowns:", patternError)
      }

      console.log("[v0] Expired cooldowns cleaned up successfully")
    } catch (error) {
      console.error("[v0] Failed to cleanup expired cooldowns:", error)
    }
  }

  setCooldownDuration(resourceType: "seed" | "pattern" | "value", duration: number): void {
    console.log("[v0] Setting cooldown duration for", resourceType, ":", duration, "ms")
    this.defaultCooldowns[resourceType] = duration
  }

  getCooldownDuration(resourceType: "seed" | "pattern" | "value"): number {
    return this.defaultCooldowns[resourceType]
  }
}
