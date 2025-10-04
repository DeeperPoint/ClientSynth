// import { createServerClient } from "@supabase/ssr" // disabled in local backend mode

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
  // Supabase disabled in local backend mode
  // private supabase
  private defaultCooldowns = {
    seed: 60 * 60 * 1000, // 1 hour
    pattern: 30 * 60 * 1000, // 30 minutes
    value: 15 * 60 * 1000, // 15 minutes
  }

  constructor() {
    // Supabase disabled in local backend mode
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

    // Supabase disabled: no-op in local backend mode
    console.log("[v0] Cooldown add skipped in local mode; would set until:", cooldownUntil)
  }

  async isInCooldown(resourceType: "seed" | "pattern" | "value", resourceId: string): Promise<boolean> {
    console.log("[v0] Checking cooldown status for", resourceType, ":", resourceId)

    // Supabase disabled: always return false in local backend mode
    return false
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

    // Supabase disabled: return default not-in-cooldown info
    return { inCooldown: false }
  }

  async getActiveCooldowns(jobId?: string): Promise<{
    seeds: number
    patterns: number
    values: number
    total: number
  }> {
    console.log("[v0] Getting active cooldowns count")

    // Supabase disabled: return zeros in local backend mode
    return { seeds: 0, patterns: 0, values: 0, total: 0 }
  }

  async cleanupExpiredCooldowns(): Promise<void> {
    console.log("[v0] Cleaning up expired cooldowns")

    // Supabase disabled: no-op in local backend mode
    console.log("[v0] Cleanup expired cooldowns (no-op in local mode)")
  }

  setCooldownDuration(resourceType: "seed" | "pattern" | "value", duration: number): void {
    console.log("[v0] Setting cooldown duration for", resourceType, ":", duration, "ms")
    this.defaultCooldowns[resourceType] = duration
  }

  getCooldownDuration(resourceType: "seed" | "pattern" | "value"): number {
    return this.defaultCooldowns[resourceType]
  }
}
