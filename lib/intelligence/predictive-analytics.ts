import { createServerClient } from "@/lib/supabase/server"

export interface GenerationPrediction {
  estimatedDuration: number
  successProbability: number
  resourceRequirements: {
    cpu: number
    memory: number
    storage: number
  }
  qualityForecast: number
  recommendations: string[]
}

export interface TrendAnalysis {
  period: string
  metrics: {
    generationVolume: number[]
    successRates: number[]
    averageQuality: number[]
    resourceUsage: number[]
  }
  trends: {
    volumeTrend: "increasing" | "decreasing" | "stable"
    qualityTrend: "improving" | "declining" | "stable"
    efficiencyTrend: "improving" | "declining" | "stable"
  }
  predictions: {
    nextPeriodVolume: number
    nextPeriodQuality: number
    nextPeriodEfficiency: number
  }
}

export class PredictiveAnalytics {
  private supabase

  constructor() {
    this.supabase = createServerClient()
  }

  async predictGenerationOutcome(tenantId: string, jobConfig: Record<string, any>): Promise<GenerationPrediction> {
    console.log("[v0] Predicting generation outcome for tenant:", tenantId)

    try {
      // Get historical data for similar jobs
      const historicalData = await this.getHistoricalData(tenantId, jobConfig)

      // Predict duration based on record count and complexity
      const estimatedDuration = this.predictDuration(jobConfig, historicalData)

      // Calculate success probability
      const successProbability = this.calculateSuccessProbability(historicalData)

      // Estimate resource requirements
      const resourceRequirements = this.estimateResourceRequirements(jobConfig, historicalData)

      // Forecast quality
      const qualityForecast = this.forecastQuality(historicalData)

      // Generate recommendations
      const recommendations = this.generatePredictionRecommendations(
        estimatedDuration,
        successProbability,
        qualityForecast,
        jobConfig,
      )

      console.log("[v0] Generation prediction complete")

      return {
        estimatedDuration,
        successProbability,
        resourceRequirements,
        qualityForecast,
        recommendations,
      }
    } catch (error) {
      console.error("[v0] Error predicting generation outcome:", error)
      throw error
    }
  }

  async analyzeTrends(tenantId: string, periodDays = 30): Promise<TrendAnalysis> {
    console.log("[v0] Analyzing trends for tenant:", tenantId, "period:", periodDays, "days")

    try {
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000)

      // Get jobs data for the period
      const { data: jobs, error: jobsError } = await this.supabase
        .from("jobs")
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at")

      if (jobsError) {
        console.error("[v0] Error fetching jobs for trend analysis:", jobsError)
        throw jobsError
      }

      if (!jobs || jobs.length === 0) {
        console.log("[v0] No jobs found for trend analysis")
        return this.getEmptyTrendAnalysis(periodDays)
      }

      // Group data by time periods (daily)
      const dailyMetrics = this.groupJobsByDay(jobs, startDate, endDate)

      // Calculate trends
      const trends = this.calculateTrends(dailyMetrics)

      // Make predictions
      const predictions = this.makePredictions(dailyMetrics, trends)

      console.log("[v0] Trend analysis complete")

      return {
        period: `${periodDays} days`,
        metrics: {
          generationVolume: dailyMetrics.map((d) => d.volume),
          successRates: dailyMetrics.map((d) => d.successRate),
          averageQuality: dailyMetrics.map((d) => d.quality),
          resourceUsage: dailyMetrics.map((d) => d.resourceUsage),
        },
        trends,
        predictions,
      }
    } catch (error) {
      console.error("[v0] Error analyzing trends:", error)
      throw error
    }
  }

  private async getHistoricalData(tenantId: string, jobConfig: Record<string, any>): Promise<any[]> {
    console.log("[v0] Getting historical data for prediction")

    const { data, error } = await this.supabase
      .from("jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[v0] Error fetching historical data:", error)
      return []
    }

    console.log("[v0] Found historical jobs:", data?.length || 0)
    return data || []
  }

  private predictDuration(jobConfig: Record<string, any>, historicalData: any[]): number {
    console.log("[v0] Predicting job duration")

    const recordCount = jobConfig.recordCount || 100
    const hasImages = jobConfig.includeImages || false

    if (historicalData.length === 0) {
      // Base estimates when no historical data
      const baseTime = recordCount * 2 // 2 seconds per record
      const imageMultiplier = hasImages ? 3 : 1
      return baseTime * imageMultiplier
    }

    // Calculate average duration from historical data
    const completedJobs = historicalData.filter((job) => job.started_at && job.completed_at)

    if (completedJobs.length === 0) {
      return recordCount * 2 // Fallback estimate
    }

    const durations = completedJobs.map((job) => {
      const start = new Date(job.started_at).getTime()
      const end = new Date(job.completed_at).getTime()
      return (end - start) / 1000 // Convert to seconds
    })

    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
    const avgRecords = completedJobs.reduce((sum, job) => sum + (job.record_count || 100), 0) / completedJobs.length

    // Scale based on record count
    const scaledDuration = (avgDuration / avgRecords) * recordCount

    // Apply image generation multiplier
    const finalDuration = hasImages ? scaledDuration * 2.5 : scaledDuration

    console.log("[v0] Predicted duration:", finalDuration, "seconds")
    return Math.max(30, finalDuration) // Minimum 30 seconds
  }

  private calculateSuccessProbability(historicalData: any[]): number {
    console.log("[v0] Calculating success probability")

    if (historicalData.length === 0) {
      return 0.85 // Default 85% success rate
    }

    const completedJobs = historicalData.filter((job) => job.status === "completed").length
    const totalJobs = historicalData.length

    const successRate = totalJobs > 0 ? completedJobs / totalJobs : 0.85

    console.log("[v0] Success probability:", successRate)
    return successRate
  }

  private estimateResourceRequirements(
    jobConfig: Record<string, any>,
    historicalData: any[],
  ): {
    cpu: number
    memory: number
    storage: number
  } {
    console.log("[v0] Estimating resource requirements")

    const recordCount = jobConfig.recordCount || 100
    const hasImages = jobConfig.includeImages || false

    // Base resource requirements
    const baseCpu = Math.min(100, recordCount * 0.5) // CPU percentage
    const baseMemory = Math.min(2048, recordCount * 10) // MB
    const baseStorage = recordCount * 1 // MB per record

    // Adjust for images
    const cpu = hasImages ? baseCpu * 1.5 : baseCpu
    const memory = hasImages ? baseMemory * 2 : baseMemory
    const storage = hasImages ? baseStorage * 5 : baseStorage

    console.log("[v0] Resource requirements - CPU:", cpu, "% Memory:", memory, "MB Storage:", storage, "MB")

    return {
      cpu: Math.round(cpu),
      memory: Math.round(memory),
      storage: Math.round(storage),
    }
  }

  private forecastQuality(historicalData: any[]): number {
    console.log("[v0] Forecasting quality")

    if (historicalData.length === 0) {
      return 75 // Default quality score
    }

    // This would ideally use actual quality metrics
    // For now, we'll use job success rate as a proxy
    const recentJobs = historicalData.slice(0, 10)
    const successRate = recentJobs.filter((job) => job.status === "completed").length / recentJobs.length

    const qualityForecast = successRate * 100

    console.log("[v0] Quality forecast:", qualityForecast)
    return qualityForecast
  }

  private generatePredictionRecommendations(
    duration: number,
    successProbability: number,
    quality: number,
    jobConfig: Record<string, any>,
  ): string[] {
    const recommendations: string[] = []

    if (duration > 1800) {
      // 30 minutes
      recommendations.push("Consider reducing batch size or record count for faster processing")
    }

    if (successProbability < 0.8) {
      recommendations.push("Success probability is low - review job configuration and system resources")
    }

    if (quality < 70) {
      recommendations.push("Quality forecast is below optimal - consider improving seed quality")
    }

    if (jobConfig.includeImages && duration > 900) {
      recommendations.push("Image generation significantly increases processing time - consider parallel processing")
    }

    if (recommendations.length === 0) {
      recommendations.push("Job configuration looks optimal for successful generation")
    }

    return recommendations
  }

  private groupJobsByDay(
    jobs: any[],
    startDate: Date,
    endDate: Date,
  ): Array<{
    date: string
    volume: number
    successRate: number
    quality: number
    resourceUsage: number
  }> {
    console.log("[v0] Grouping jobs by day")

    const dailyData: Record<string, any> = {}

    // Initialize all days in the period
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0]
      dailyData[dateKey] = {
        date: dateKey,
        jobs: [],
        volume: 0,
        successRate: 0,
        quality: 75,
        resourceUsage: 0,
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Group jobs by day
    jobs.forEach((job) => {
      const jobDate = new Date(job.created_at).toISOString().split("T")[0]
      if (dailyData[jobDate]) {
        dailyData[jobDate].jobs.push(job)
      }
    })

    // Calculate metrics for each day
    Object.values(dailyData).forEach((day: any) => {
      day.volume = day.jobs.length

      if (day.jobs.length > 0) {
        const completedJobs = day.jobs.filter((job: any) => job.status === "completed")
        day.successRate = (completedJobs.length / day.jobs.length) * 100

        // Simple resource usage calculation
        day.resourceUsage = Math.min(100, day.jobs.length * 10)
      }
    })

    return Object.values(dailyData)
  }

  private calculateTrends(dailyMetrics: any[]): {
    volumeTrend: "increasing" | "decreasing" | "stable"
    qualityTrend: "improving" | "declining" | "stable"
    efficiencyTrend: "improving" | "declining" | "stable"
  } {
    console.log("[v0] Calculating trends")

    if (dailyMetrics.length < 3) {
      return {
        volumeTrend: "stable",
        qualityTrend: "stable",
        efficiencyTrend: "stable",
      }
    }

    // Simple trend calculation using first and last values
    const firstHalf = dailyMetrics.slice(0, Math.floor(dailyMetrics.length / 2))
    const secondHalf = dailyMetrics.slice(Math.floor(dailyMetrics.length / 2))

    const firstHalfAvgVolume = firstHalf.reduce((sum, d) => sum + d.volume, 0) / firstHalf.length
    const secondHalfAvgVolume = secondHalf.reduce((sum, d) => sum + d.volume, 0) / secondHalf.length

    const firstHalfAvgQuality = firstHalf.reduce((sum, d) => sum + d.quality, 0) / firstHalf.length
    const secondHalfAvgQuality = secondHalf.reduce((sum, d) => sum + d.quality, 0) / secondHalf.length

    const firstHalfAvgSuccess = firstHalf.reduce((sum, d) => sum + d.successRate, 0) / firstHalf.length
    const secondHalfAvgSuccess = secondHalf.reduce((sum, d) => sum + d.successRate, 0) / secondHalf.length

    const volumeTrend =
      secondHalfAvgVolume > firstHalfAvgVolume * 1.1
        ? "increasing"
        : secondHalfAvgVolume < firstHalfAvgVolume * 0.9
          ? "decreasing"
          : "stable"

    const qualityTrend =
      secondHalfAvgQuality > firstHalfAvgQuality * 1.05
        ? "improving"
        : secondHalfAvgQuality < firstHalfAvgQuality * 0.95
          ? "declining"
          : "stable"

    const efficiencyTrend =
      secondHalfAvgSuccess > firstHalfAvgSuccess * 1.05
        ? "improving"
        : secondHalfAvgSuccess < firstHalfAvgSuccess * 0.95
          ? "declining"
          : "stable"

    console.log(
      "[v0] Trends calculated - Volume:",
      volumeTrend,
      "Quality:",
      qualityTrend,
      "Efficiency:",
      efficiencyTrend,
    )

    return {
      volumeTrend,
      qualityTrend,
      efficiencyTrend,
    }
  }

  private makePredictions(
    dailyMetrics: any[],
    trends: any,
  ): {
    nextPeriodVolume: number
    nextPeriodQuality: number
    nextPeriodEfficiency: number
  } {
    console.log("[v0] Making predictions based on trends")

    if (dailyMetrics.length === 0) {
      return {
        nextPeriodVolume: 0,
        nextPeriodQuality: 75,
        nextPeriodEfficiency: 85,
      }
    }

    const recentMetrics = dailyMetrics.slice(-7) // Last 7 days
    const avgVolume = recentMetrics.reduce((sum, d) => sum + d.volume, 0) / recentMetrics.length
    const avgQuality = recentMetrics.reduce((sum, d) => sum + d.quality, 0) / recentMetrics.length
    const avgEfficiency = recentMetrics.reduce((sum, d) => sum + d.successRate, 0) / recentMetrics.length

    // Apply trend adjustments
    const volumeMultiplier = trends.volumeTrend === "increasing" ? 1.1 : trends.volumeTrend === "decreasing" ? 0.9 : 1.0

    const qualityMultiplier =
      trends.qualityTrend === "improving" ? 1.05 : trends.qualityTrend === "declining" ? 0.95 : 1.0

    const efficiencyMultiplier =
      trends.efficiencyTrend === "improving" ? 1.05 : trends.efficiencyTrend === "declining" ? 0.95 : 1.0

    const predictions = {
      nextPeriodVolume: Math.round(avgVolume * volumeMultiplier),
      nextPeriodQuality: Math.round(avgQuality * qualityMultiplier),
      nextPeriodEfficiency: Math.round(avgEfficiency * efficiencyMultiplier),
    }

    console.log("[v0] Predictions made:", predictions)
    return predictions
  }

  private getEmptyTrendAnalysis(periodDays: number): TrendAnalysis {
    return {
      period: `${periodDays} days`,
      metrics: {
        generationVolume: [],
        successRates: [],
        averageQuality: [],
        resourceUsage: [],
      },
      trends: {
        volumeTrend: "stable",
        qualityTrend: "stable",
        efficiencyTrend: "stable",
      },
      predictions: {
        nextPeriodVolume: 0,
        nextPeriodQuality: 75,
        nextPeriodEfficiency: 85,
      },
    }
  }
}
