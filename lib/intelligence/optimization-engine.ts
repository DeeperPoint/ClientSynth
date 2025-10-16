import { createServerClient } from "@/lib/supabase/server"
import { PatternDetector } from "../variation/pattern-detector"
import { DistributionManager } from "../variation/distribution-manager"

export interface OptimizationSuggestion {
  id: string
  type: "batch_size" | "seed_variety" | "cooldown_adjustment" | "parameter_tuning" | "quality_improvement"
  title: string
  description: string
  expectedImprovement: number
  priority: "low" | "medium" | "high" | "critical"
  actionData: Record<string, any>
  reasoning: string[]
}

export interface PerformanceMetrics {
  averageGenerationTime: number
  successRate: number
  diversityIndex: number
  qualityScore: number
  resourceUtilization: number
}

export class OptimizationEngine {
  private supabase
  private patternDetector: PatternDetector
  private distributionManager: DistributionManager

  constructor() {
    this.supabase = createServerClient()
    this.patternDetector = new PatternDetector()
    this.distributionManager = new DistributionManager()
  }

  async analyzePerformance(tenantId: string, jobId?: string): Promise<PerformanceMetrics> {
    console.log("[v0] Analyzing performance for tenant:", tenantId, "job:", jobId)

    try {
      // Get recent jobs for analysis
      let jobQuery = this.supabase
        .from("jobs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (jobId) {
        jobQuery = jobQuery.eq("id", jobId)
      }

      const { data: jobs, error: jobsError } = await jobQuery

      if (jobsError) {
        console.error("[v0] Error fetching jobs for analysis:", jobsError)
        throw jobsError
      }

      if (!jobs || jobs.length === 0) {
        console.log("[v0] No jobs found for performance analysis")
        return {
          averageGenerationTime: 0,
          successRate: 0,
          diversityIndex: 0,
          qualityScore: 0,
          resourceUtilization: 0,
        }
      }

      // Calculate metrics
      const completedJobs = jobs.filter((job) => job.status === "completed")
      const failedJobs = jobs.filter((job) => job.status === "failed")

      const successRate = jobs.length > 0 ? (completedJobs.length / jobs.length) * 100 : 0

      // Calculate average generation time
      const generationTimes = completedJobs
        .filter((job) => job.started_at && job.completed_at)
        .map((job) => {
          const start = new Date(job.started_at).getTime()
          const end = new Date(job.completed_at).getTime()
          return (end - start) / 1000 // Convert to seconds
        })

      const averageGenerationTime =
        generationTimes.length > 0 ? generationTimes.reduce((sum, time) => sum + time, 0) / generationTimes.length : 0

      // Calculate diversity and quality metrics
      const diversityIndex = await this.calculateDiversityIndex(completedJobs)
      const qualityScore = await this.calculateQualityScore(completedJobs)
      const resourceUtilization = this.calculateResourceUtilization(jobs)

      console.log("[v0] Performance analysis complete")

      return {
        averageGenerationTime,
        successRate,
        diversityIndex,
        qualityScore,
        resourceUtilization,
      }
    } catch (error) {
      console.error("[v0] Error analyzing performance:", error)
      throw error
    }
  }

  async generateOptimizationSuggestions(
    tenantId: string,
    performanceMetrics: PerformanceMetrics,
    jobId?: string,
  ): Promise<OptimizationSuggestion[]> {
    console.log("[v0] Generating optimization suggestions for tenant:", tenantId)

    const suggestions: OptimizationSuggestion[] = []

    try {
      // Analyze different aspects and generate suggestions

      // 1. Success Rate Optimization
      if (performanceMetrics.successRate < 80) {
        suggestions.push({
          id: `success_rate_${Date.now()}`,
          type: "parameter_tuning",
          title: "Improve Success Rate",
          description: "Your job success rate is below optimal. Consider adjusting generation parameters.",
          expectedImprovement: 15,
          priority: "high",
          actionData: {
            recommendedBatchSize: 10,
            timeoutIncrease: 30,
            retryAttempts: 3,
          },
          reasoning: [
            `Current success rate: ${performanceMetrics.successRate.toFixed(1)}%`,
            "Recommended: Reduce batch size and increase timeout values",
            "This should improve stability and reduce failures",
          ],
        })
      }

      // 2. Generation Time Optimization
      if (performanceMetrics.averageGenerationTime > 300) {
        // 5 minutes
        suggestions.push({
          id: `generation_time_${Date.now()}`,
          type: "batch_size",
          title: "Optimize Generation Speed",
          description: "Generation times are longer than optimal. Consider batch size adjustments.",
          expectedImprovement: 25,
          priority: "medium",
          actionData: {
            recommendedBatchSize: Math.max(5, Math.floor(performanceMetrics.averageGenerationTime / 30)),
            parallelProcessing: true,
          },
          reasoning: [
            `Current average time: ${(performanceMetrics.averageGenerationTime / 60).toFixed(1)} minutes`,
            "Larger batch sizes can improve efficiency",
            "Consider parallel processing for better throughput",
          ],
        })
      }

      // 3. Diversity Optimization
      if (performanceMetrics.diversityIndex < 60) {
        suggestions.push({
          id: `diversity_${Date.now()}`,
          type: "seed_variety",
          title: "Increase Data Diversity",
          description: "Generated data shows low diversity. Expand seed variety and adjust cooldown periods.",
          expectedImprovement: 20,
          priority: "high",
          actionData: {
            increaseSeedPool: true,
            adjustCooldownPeriods: true,
            recommendedCooldown: 30 * 60 * 1000, // 30 minutes
          },
          reasoning: [
            `Current diversity index: ${performanceMetrics.diversityIndex.toFixed(1)}%`,
            "Low diversity may indicate repetitive patterns",
            "Expanding seed variety will improve uniqueness",
          ],
        })
      }

      // 4. Quality Improvement
      if (performanceMetrics.qualityScore < 70) {
        suggestions.push({
          id: `quality_${Date.now()}`,
          type: "quality_improvement",
          title: "Enhance Output Quality",
          description: "Generated content quality is below target. Review and improve seed quality.",
          expectedImprovement: 18,
          priority: "high",
          actionData: {
            reviewLowQualitySeeds: true,
            enableQualityFiltering: true,
            minimumQualityThreshold: 75,
          },
          reasoning: [
            `Current quality score: ${performanceMetrics.qualityScore.toFixed(1)}%`,
            "Low-quality seeds may be affecting output",
            "Implementing quality filtering will improve results",
          ],
        })
      }

      // 5. Resource Utilization
      if (performanceMetrics.resourceUtilization > 85) {
        suggestions.push({
          id: `resource_${Date.now()}`,
          type: "parameter_tuning",
          title: "Optimize Resource Usage",
          description: "High resource utilization detected. Consider load balancing and scheduling optimizations.",
          expectedImprovement: 12,
          priority: "medium",
          actionData: {
            enableLoadBalancing: true,
            scheduleOffPeakJobs: true,
            reduceParallelJobs: true,
          },
          reasoning: [
            `Current resource utilization: ${performanceMetrics.resourceUtilization.toFixed(1)}%`,
            "High utilization may cause performance degradation",
            "Load balancing will improve overall system performance",
          ],
        })
      }

      // Store suggestions in database
      await this.storeSuggestions(suggestions, tenantId, jobId)

      console.log("[v0] Generated optimization suggestions:", suggestions.length)
      return suggestions
    } catch (error) {
      console.error("[v0] Error generating optimization suggestions:", error)
      return []
    }
  }

  private async calculateDiversityIndex(jobs: any[]): Promise<number> {
    console.log("[v0] Calculating diversity index for", jobs.length, "jobs")

    if (jobs.length === 0) return 0

    try {
      // Get generated data for analysis
      const { data: generatedData, error } = await this.supabase
        .from("generated_data")
        .select("data")
        .in(
          "job_id",
          jobs.map((job) => job.id),
        )
        .limit(1000) // Sample for performance

      if (error || !generatedData) {
        console.log("[v0] No generated data found for diversity analysis")
        return 50 // Default neutral score
      }

      // Analyze patterns in the data
      const allRecords = generatedData.map((item) => item.data)
      const patterns = await this.patternDetector.detectPatterns(allRecords, jobs[0].id)

      // Calculate diversity based on pattern variety
      const uniquePatterns = new Set(patterns.map((p) => `${p.fieldName}_${p.value}`)).size
      const totalPatterns = patterns.length

      const diversityIndex = totalPatterns > 0 ? (uniquePatterns / totalPatterns) * 100 : 0

      console.log("[v0] Diversity index calculated:", diversityIndex.toFixed(2))
      return Math.min(100, diversityIndex)
    } catch (error) {
      console.error("[v0] Error calculating diversity index:", error)
      return 50
    }
  }

  private async calculateQualityScore(jobs: any[]): Promise<number> {
    console.log("[v0] Calculating quality score for", jobs.length, "jobs")

    if (jobs.length === 0) return 0

    try {
      // Get quality feedback for these jobs
      const { data: feedback, error } = await this.supabase
        .from("seed_quality_feedback")
        .select("quality_rating")
        .in(
          "job_id",
          jobs.map((job) => job.id),
        )

      if (error || !feedback || feedback.length === 0) {
        console.log("[v0] No quality feedback found, using default score")
        return 75 // Default score when no feedback available
      }

      const averageRating = feedback.reduce((sum, f) => sum + f.quality_rating, 0) / feedback.length
      const qualityScore = (averageRating / 5) * 100

      console.log("[v0] Quality score calculated:", qualityScore.toFixed(2))
      return qualityScore
    } catch (error) {
      console.error("[v0] Error calculating quality score:", error)
      return 75
    }
  }

  private calculateResourceUtilization(jobs: any[]): number {
    console.log("[v0] Calculating resource utilization for", jobs.length, "jobs")

    if (jobs.length === 0) return 0

    // Calculate based on job frequency and duration
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000

    const recentJobs = jobs.filter((job) => {
      const createdAt = new Date(job.created_at).getTime()
      return createdAt >= oneHourAgo
    })

    // Simple utilization calculation based on job frequency
    const utilizationScore = Math.min(100, (recentJobs.length / 10) * 100)

    console.log("[v0] Resource utilization calculated:", utilizationScore.toFixed(2))
    return utilizationScore
  }

  private async storeSuggestions(
    suggestions: OptimizationSuggestion[],
    tenantId: string,
    jobId?: string,
  ): Promise<void> {
    console.log("[v0] Storing optimization suggestions:", suggestions.length)

    try {
      const suggestionRecords = suggestions.map((suggestion) => ({
        tenant_id: tenantId,
        job_id: jobId,
        suggestion_type: suggestion.type,
        suggestion_data: {
          title: suggestion.title,
          description: suggestion.description,
          actionData: suggestion.actionData,
          reasoning: suggestion.reasoning,
        },
        expected_improvement: suggestion.expectedImprovement / 100,
        priority: suggestion.priority,
      }))

      const { error } = await this.supabase.from("optimization_suggestions").insert(suggestionRecords)

      if (error) {
        console.error("[v0] Error storing optimization suggestions:", error)
      } else {
        console.log("[v0] Optimization suggestions stored successfully")
      }
    } catch (error) {
      console.error("[v0] Failed to store optimization suggestions:", error)
    }
  }

  async getActiveSuggestions(tenantId: string, jobId?: string): Promise<OptimizationSuggestion[]> {
    console.log("[v0] Getting active optimization suggestions for tenant:", tenantId)

    try {
      let query = this.supabase
        .from("optimization_suggestions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("priority")
        .order("expected_improvement", { ascending: false })

      if (jobId) {
        query = query.eq("job_id", jobId)
      }

      const { data, error } = await query

      if (error) {
        console.error("[v0] Error fetching active suggestions:", error)
        return []
      }

      const suggestions = (data || []).map((record) => ({
        id: record.id,
        type: record.suggestion_type,
        title: record.suggestion_data.title,
        description: record.suggestion_data.description,
        expectedImprovement: record.expected_improvement * 100,
        priority: record.priority,
        actionData: record.suggestion_data.actionData,
        reasoning: record.suggestion_data.reasoning,
      }))

      console.log("[v0] Found active suggestions:", suggestions.length)
      return suggestions
    } catch (error) {
      console.error("[v0] Error getting active suggestions:", error)
      return []
    }
  }

  async applySuggestion(suggestionId: string, tenantId: string): Promise<void> {
    console.log("[v0] Applying optimization suggestion:", suggestionId)

    try {
      const { error } = await this.supabase
        .from("optimization_suggestions")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
        })
        .eq("id", suggestionId)
        .eq("tenant_id", tenantId)

      if (error) {
        console.error("[v0] Error applying suggestion:", error)
        throw error
      }

      console.log("[v0] Optimization suggestion applied successfully")
    } catch (error) {
      console.error("[v0] Failed to apply suggestion:", error)
      throw error
    }
  }

  async dismissSuggestion(suggestionId: string, tenantId: string): Promise<void> {
    console.log("[v0] Dismissing optimization suggestion:", suggestionId)

    try {
      const { error } = await this.supabase
        .from("optimization_suggestions")
        .update({
          status: "dismissed",
        })
        .eq("id", suggestionId)
        .eq("tenant_id", tenantId)

      if (error) {
        console.error("[v0] Error dismissing suggestion:", error)
        throw error
      }

      console.log("[v0] Optimization suggestion dismissed successfully")
    } catch (error) {
      console.error("[v0] Failed to dismiss suggestion:", error)
      throw error
    }
  }
}
