import { query } from "@/lib/postgres/client"

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
  private defaultCooldowns = {
    seed: 60 * 60 * 1000, // 1 hour
    pattern: 30 * 60 * 1000, // 30 minutes
    value: 15 * 60 * 1000, // 15 minutes
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
        await query(
          `
            INSERT INTO seed_usage (seed_id, job_id, context, cooldown_until)
            VALUES ($1, $2, $3::jsonb, $4)
          `,
          [resourceId, jobId, JSON.stringify(metadata), cooldownUntil]
        )
      } else {
        // For patterns and values, we'll store in generation_patterns with special metadata
        await query(
          `
            INSERT INTO generation_patterns (job_id, pattern_hash, pattern_data)
            VALUES ($1, $2, $3::jsonb)
          `,
          [
            jobId,
            `${resourceType}_${resourceId}`,
            JSON.stringify({
              type: "cooldown",
              resource_type: resourceType,
              resource_id: resourceId,
              cooldown_until: cooldownUntil,
              metadata,
            }),
          ]
        )
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
        const result = await query(
          `
            SELECT 1
            FROM seed_usage
            WHERE seed_id = $1
              AND cooldown_until > $2
            ORDER BY cooldown_until DESC
            LIMIT 1
          `,
          [resourceId, now]
        )

        const inCooldown = result.rows.length > 0
        console.log("[v0] Seed cooldown status:", inCooldown)
        return inCooldown
      } else {
        const result = await query(
          `
            SELECT pattern_data
            FROM generation_patterns
            WHERE pattern_hash = $1
              AND pattern_data->>'type' = 'cooldown'
              AND (pattern_data->>'cooldown_until')::timestamptz > $2
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [`${resourceType}_${resourceId}`, now]
        )

        const inCooldown = result.rows.length > 0
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
        const result = await query(
          `
            SELECT cooldown_until, context
            FROM seed_usage
            WHERE seed_id = $1
              AND cooldown_until > $2
            ORDER BY cooldown_until DESC
            LIMIT 1
          `,
          [resourceId, now]
        )

        if (result.rows.length > 0) {
          const cooldownUntil = result.rows[0].cooldown_until
          const remainingTime = new Date(cooldownUntil).getTime() - Date.now()

          return {
            inCooldown: true,
            cooldownUntil,
            remainingTime,
            metadata: result.rows[0].context,
          }
        }
      } else {
        const result = await query(
          `
            SELECT pattern_data
            FROM generation_patterns
            WHERE pattern_hash = $1
              AND pattern_data->>'type' = 'cooldown'
              AND (pattern_data->>'cooldown_until')::timestamptz > $2
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [`${resourceType}_${resourceId}`, now]
        )

        if (result.rows.length > 0) {
          const patternData = result.rows[0].pattern_data as any
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
      const seedCountResult = await query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM seed_usage
          WHERE cooldown_until > $1
          ${jobId ? "AND job_id = $2" : ""}
        `,
        jobId ? [now, jobId] : [now]
      )
      const seedCount = parseInt(seedCountResult.rows[0]?.count || "0", 10)

      // Count pattern and value cooldowns
      const patternCountResult = await query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM generation_patterns
          WHERE pattern_data->>'type' = 'cooldown'
            AND (pattern_data->>'cooldown_until')::timestamptz > $1
            ${jobId ? "AND job_id = $2" : ""}
        `,
        jobId ? [now, jobId] : [now]
      )
      const patternCount = parseInt(patternCountResult.rows[0]?.count || "0", 10)

      const seeds = seedCount
      const patterns = patternCount
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
      await query(`DELETE FROM seed_usage WHERE cooldown_until < $1`, [now])

      // Clean up expired pattern cooldowns
      await query(
        `
          DELETE FROM generation_patterns
          WHERE pattern_data->>'type' = 'cooldown'
            AND (pattern_data->>'cooldown_until')::timestamptz < $1
        `,
        [now]
      )

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
