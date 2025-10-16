import { createServerClient } from "@/lib/supabase/server"
import { SeedDatabase, type Seed } from "../seeding/seed-database"

export interface QualityPrediction {
  seedId: string
  predictedQuality: number
  confidence: number
  factors: {
    historicalPerformance: number
    contentAnalysis: number
    usagePatterns: number
    contextRelevance: number
  }
  recommendations: string[]
}

export interface QualityFeedback {
  seedId: string
  jobId: string
  rating: number
  feedbackType: "manual" | "automatic" | "user_rating"
  feedbackData: Record<string, any>
}

export class SeedQualityPredictor {
  private supabase
  private seedDb: SeedDatabase

  constructor() {
    this.supabase = createServerClient()
    this.seedDb = new SeedDatabase()
  }

  async predictSeedQuality(seedId: string, context: Record<string, any> = {}): Promise<QualityPrediction> {
    console.log("[v0] Predicting quality for seed:", seedId)

    try {
      // Get seed information
      const { data: seedData, error: seedError } = await this.supabase
        .from("seeds")
        .select("*")
        .eq("id", seedId)
        .single()

      if (seedError || !seedData) {
        console.error("[v0] Seed not found:", seedError)
        throw new Error("Seed not found")
      }

      // Get historical feedback
      const historicalFeedback = await this.getHistoricalFeedback(seedId)

      // Get usage statistics
      const usageStats = await this.getUsageStatistics(seedId)

      // Analyze content quality
      const contentAnalysis = await this.analyzeContentQuality(seedData)

      // Calculate prediction factors
      const factors = {
        historicalPerformance: this.calculateHistoricalPerformance(historicalFeedback),
        contentAnalysis: contentAnalysis.score,
        usagePatterns: this.analyzeUsagePatterns(usageStats),
        contextRelevance: this.calculateContextRelevance(seedData, context),
      }

      // Calculate weighted prediction
      const weights = {
        historicalPerformance: 0.4,
        contentAnalysis: 0.3,
        usagePatterns: 0.2,
        contextRelevance: 0.1,
      }

      const predictedQuality = Object.entries(factors).reduce((sum, [factor, score]) => {
        return sum + score * weights[factor as keyof typeof weights]
      }, 0)

      // Calculate confidence based on data availability
      const confidence = this.calculateConfidence(historicalFeedback.length, usageStats.totalUsage)

      // Generate recommendations
      const recommendations = this.generateQualityRecommendations(factors, seedData)

      console.log(
        "[v0] Quality prediction complete - Score:",
        predictedQuality.toFixed(3),
        "Confidence:",
        confidence.toFixed(3),
      )

      return {
        seedId,
        predictedQuality: Math.max(0, Math.min(100, predictedQuality)),
        confidence,
        factors,
        recommendations,
      }
    } catch (error) {
      console.error("[v0] Error predicting seed quality:", error)
      throw error
    }
  }

  async recordQualityFeedback(feedback: QualityFeedback, tenantId: string, userId?: string): Promise<void> {
    console.log("[v0] Recording quality feedback for seed:", feedback.seedId)

    try {
      const { error } = await this.supabase.from("seed_quality_feedback").insert({
        seed_id: feedback.seedId,
        job_id: feedback.jobId,
        tenant_id: tenantId,
        quality_rating: feedback.rating,
        feedback_type: feedback.feedbackType,
        feedback_data: feedback.feedbackData,
        created_by: userId,
      })

      if (error) {
        console.error("[v0] Error recording quality feedback:", error)
        throw error
      }

      // Update seed quality score based on feedback
      await this.updateSeedQualityScore(feedback.seedId)

      console.log("[v0] Quality feedback recorded successfully")
    } catch (error) {
      console.error("[v0] Failed to record quality feedback:", error)
      throw error
    }
  }

  private async getHistoricalFeedback(seedId: string): Promise<any[]> {
    console.log("[v0] Getting historical feedback for seed:", seedId)

    const { data, error } = await this.supabase
      .from("seed_quality_feedback")
      .select("*")
      .eq("seed_id", seedId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching historical feedback:", error)
      return []
    }

    console.log("[v0] Found historical feedback entries:", data?.length || 0)
    return data || []
  }

  private async getUsageStatistics(seedId: string): Promise<{
    totalUsage: number
    recentUsage: number
    successRate: number
  }> {
    console.log("[v0] Getting usage statistics for seed:", seedId)

    try {
      const { data, error } = await this.supabase.from("seed_usage").select("*").eq("seed_id", seedId)

      if (error) {
        console.error("[v0] Error fetching usage statistics:", error)
        return { totalUsage: 0, recentUsage: 0, successRate: 0 }
      }

      const totalUsage = data?.length || 0
      const recentUsage =
        data?.filter((usage) => {
          const usedAt = new Date(usage.used_at)
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          return usedAt >= weekAgo
        }).length || 0

      // Success rate would be calculated based on job completion rates
      // For now, we'll use a placeholder calculation
      const successRate = totalUsage > 0 ? 0.85 : 0

      console.log("[v0] Usage statistics - Total:", totalUsage, "Recent:", recentUsage, "Success rate:", successRate)

      return { totalUsage, recentUsage, successRate }
    } catch (error) {
      console.error("[v0] Error calculating usage statistics:", error)
      return { totalUsage: 0, recentUsage: 0, successRate: 0 }
    }
  }

  private async analyzeContentQuality(seed: Seed): Promise<{
    score: number
    factors: {
      length: number
      complexity: number
      specificity: number
      clarity: number
    }
  }> {
    console.log("[v0] Analyzing content quality for seed:", seed.id)

    const content = seed.content.toLowerCase()

    // Length analysis (optimal length varies by type)
    const lengthScore = this.scoreLengthQuality(content, seed.seed_type)

    // Complexity analysis (presence of descriptive words)
    const complexityScore = this.scoreComplexity(content)

    // Specificity analysis (specific vs generic terms)
    const specificityScore = this.scoreSpecificity(content)

    // Clarity analysis (readability and structure)
    const clarityScore = this.scoreClarity(content)

    const factors = {
      length: lengthScore,
      complexity: complexityScore,
      specificity: specificityScore,
      clarity: clarityScore,
    }

    // Weighted average
    const score = lengthScore * 0.2 + complexityScore * 0.3 + specificityScore * 0.3 + clarityScore * 0.2

    console.log("[v0] Content quality analysis complete - Score:", score.toFixed(3))

    return { score: score * 100, factors }
  }

  private scoreLengthQuality(content: string, seedType: string): number {
    const length = content.length

    // Optimal lengths by seed type
    const optimalRanges = {
      image_prompt: { min: 50, max: 200 },
      name_template: { min: 10, max: 50 },
      text_template: { min: 20, max: 150 },
    }

    const range = optimalRanges[seedType as keyof typeof optimalRanges] || { min: 20, max: 100 }

    if (length < range.min) {
      return Math.max(0.3, length / range.min)
    } else if (length > range.max) {
      return Math.max(0.3, range.max / length)
    } else {
      return 1.0
    }
  }

  private scoreComplexity(content: string): number {
    const descriptiveWords = [
      "professional",
      "modern",
      "elegant",
      "vibrant",
      "detailed",
      "high-quality",
      "beautiful",
      "stunning",
      "creative",
      "innovative",
      "sophisticated",
      "premium",
    ]

    const words = content.split(/\s+/)
    const descriptiveCount = words.filter((word) => descriptiveWords.some((desc) => word.includes(desc))).length

    // Score based on presence of descriptive words
    return Math.min(1.0, descriptiveCount / 3)
  }

  private scoreSpecificity(content: string): number {
    const specificTerms = [
      "headshot",
      "portrait",
      "landscape",
      "product",
      "corporate",
      "casual",
      "indoor",
      "outdoor",
      "studio",
      "natural",
      "artificial",
      "background",
    ]

    const genericTerms = ["nice", "good", "great", "awesome", "cool", "amazing"]

    const words = content.split(/\s+/)
    const specificCount = words.filter((word) => specificTerms.some((term) => word.includes(term))).length
    const genericCount = words.filter((word) => genericTerms.some((term) => word.includes(term))).length

    // Higher score for more specific, fewer generic terms
    const specificityRatio = specificCount / Math.max(1, specificCount + genericCount)
    return specificityRatio
  }

  private scoreClarity(content: string): number {
    // Simple clarity metrics
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    const avgSentenceLength = content.length / Math.max(1, sentences.length)

    // Optimal sentence length for clarity
    const clarityScore = avgSentenceLength > 100 ? 0.5 : 1.0

    // Check for proper structure (commas, conjunctions)
    const hasStructure = /[,;:]/.test(content) ? 1.0 : 0.7

    return (clarityScore + hasStructure) / 2
  }

  private calculateHistoricalPerformance(feedback: any[]): number {
    if (feedback.length === 0) return 50 // Neutral score for no data

    const avgRating = feedback.reduce((sum, f) => sum + f.quality_rating, 0) / feedback.length
    return (avgRating / 5) * 100 // Convert 1-5 scale to 0-100
  }

  private analyzeUsagePatterns(stats: { totalUsage: number; recentUsage: number; successRate: number }): number {
    // Higher usage generally indicates better quality
    const usageScore = Math.min(100, stats.totalUsage * 2)

    // Recent usage indicates current relevance
    const recencyScore = Math.min(100, stats.recentUsage * 10)

    // Success rate is important
    const successScore = stats.successRate * 100

    // Weighted combination
    return usageScore * 0.3 + recencyScore * 0.3 + successScore * 0.4
  }

  private calculateContextRelevance(seed: Seed, context: Record<string, any>): number {
    // Simple context relevance based on field type matching
    if (!context.fieldType) return 50 // Neutral if no context

    const seedCategories = seed.metadata?.categories || []
    const fieldType = context.fieldType.toLowerCase()

    // Check if seed categories match the field type
    const relevanceScore = seedCategories.some(
      (cat: string) => cat.toLowerCase().includes(fieldType) || fieldType.includes(cat.toLowerCase()),
    )
      ? 100
      : 30

    return relevanceScore
  }

  private calculateConfidence(feedbackCount: number, usageCount: number): number {
    // Confidence increases with more data points
    const feedbackConfidence = Math.min(1.0, feedbackCount / 10)
    const usageConfidence = Math.min(1.0, usageCount / 20)

    return (feedbackConfidence + usageConfidence) / 2
  }

  private generateQualityRecommendations(factors: any, seed: Seed): string[] {
    const recommendations: string[] = []

    if (factors.contentAnalysis < 60) {
      recommendations.push("Consider adding more descriptive and specific terms to the seed content")
    }

    if (factors.historicalPerformance < 50) {
      recommendations.push("This seed has received low ratings - consider revising or replacing")
    }

    if (factors.usagePatterns < 40) {
      recommendations.push("Low usage patterns suggest this seed may not be well-suited for common use cases")
    }

    if (seed.quality_score < 70) {
      recommendations.push("Overall quality score is below optimal - review and improve seed content")
    }

    if (recommendations.length === 0) {
      recommendations.push("Seed quality appears good - continue monitoring performance")
    }

    return recommendations
  }

  private async updateSeedQualityScore(seedId: string): Promise<void> {
    console.log("[v0] Updating seed quality score based on feedback:", seedId)

    try {
      const prediction = await this.predictSeedQuality(seedId)

      await this.seedDb.updateSeedQuality(seedId, Math.round(prediction.predictedQuality))

      console.log("[v0] Seed quality score updated to:", prediction.predictedQuality)
    } catch (error) {
      console.error("[v0] Error updating seed quality score:", error)
    }
  }

  async getBestSeedsForContext(context: Record<string, any>, limit = 10): Promise<QualityPrediction[]> {
    console.log("[v0] Getting best seeds for context:", context)

    try {
      // Get all relevant seeds
      const seeds = await this.seedDb.getSeedsByFieldType(
        context.fieldType || "image",
        context.seedType || "image_prompt",
      )

      // Predict quality for each seed
      const predictions = await Promise.all(seeds.map((seed) => this.predictSeedQuality(seed.id, context)))

      // Sort by predicted quality and confidence
      const sortedPredictions = predictions.sort((a, b) => {
        const scoreA = a.predictedQuality * a.confidence
        const scoreB = b.predictedQuality * b.confidence
        return scoreB - scoreA
      })

      console.log("[v0] Best seeds identified:", sortedPredictions.slice(0, limit).length)
      return sortedPredictions.slice(0, limit)
    } catch (error) {
      console.error("[v0] Error getting best seeds for context:", error)
      return []
    }
  }
}
