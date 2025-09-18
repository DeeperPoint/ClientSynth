import { UsageTracker } from "../seeding/usage-tracker"

export interface DataPattern {
  fieldName: string
  dataType: string
  value: any
  frequency: number
  context: Record<string, any>
}

export interface SimilarityResult {
  isSimilar: boolean
  similarityScore: number
  matchingFields: string[]
  recommendations: string[]
}

export class PatternDetector {
  private usageTracker: UsageTracker

  constructor() {
    this.usageTracker = new UsageTracker()
  }

  async detectPatterns(generatedData: Record<string, any>[], jobId: string): Promise<DataPattern[]> {
    console.log("[v0] Detecting patterns in generated data, records:", generatedData.length)

    const patterns: DataPattern[] = []
    const fieldFrequencies: Record<string, Record<string, number>> = {}

    // Analyze frequency of values for each field
    generatedData.forEach((record, index) => {
      Object.entries(record).forEach(([fieldName, value]) => {
        if (!fieldFrequencies[fieldName]) {
          fieldFrequencies[fieldName] = {}
        }

        const normalizedValue = this.normalizeValue(value)
        fieldFrequencies[fieldName][normalizedValue] = (fieldFrequencies[fieldName][normalizedValue] || 0) + 1
      })
    })

    // Convert frequencies to patterns
    Object.entries(fieldFrequencies).forEach(([fieldName, frequencies]) => {
      Object.entries(frequencies).forEach(([value, frequency]) => {
        const pattern: DataPattern = {
          fieldName,
          dataType: this.inferDataType(value),
          value,
          frequency,
          context: {
            totalRecords: generatedData.length,
            frequencyPercentage: (frequency / generatedData.length) * 100,
          },
        }
        patterns.push(pattern)
      })
    })

    // Record patterns for future comparison
    await this.usageTracker.recordGenerationPattern(jobId, {
      patterns: patterns.map((p) => ({
        field: p.fieldName,
        type: p.dataType,
        frequency: p.frequency,
      })),
      totalRecords: generatedData.length,
      timestamp: new Date().toISOString(),
    })

    console.log("[v0] Detected patterns:", patterns.length)
    return patterns
  }

  async checkSimilarity(newData: Record<string, any>[], jobId: string, threshold = 0.7): Promise<SimilarityResult> {
    console.log("[v0] Checking similarity against recent patterns, threshold:", threshold)

    try {
      // Get recent patterns for comparison
      const recentPatterns = await this.usageTracker.getRecentPatterns(undefined, 24)

      if (recentPatterns.length === 0) {
        console.log("[v0] No recent patterns to compare against")
        return {
          isSimilar: false,
          similarityScore: 0,
          matchingFields: [],
          recommendations: ["No previous patterns found - generation looks unique"],
        }
      }

      // Detect patterns in new data
      const newPatterns = await this.detectPatterns(newData, jobId)

      let maxSimilarity = 0
      let bestMatch: any = null
      const matchingFields: string[] = []

      // Compare against each recent pattern
      for (const recentPattern of recentPatterns) {
        const similarity = this.calculatePatternSimilarity(newPatterns, recentPattern.pattern_data.patterns || [])

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity
          bestMatch = recentPattern
        }
      }

      // Identify matching fields
      if (bestMatch && maxSimilarity > threshold) {
        const recentPatternFields = new Set(bestMatch.pattern_data.patterns?.map((p: any) => p.field) || [])
        const newPatternFields = new Set(newPatterns.map((p) => p.fieldName))

        matchingFields.push(
          ...(Array.from(recentPatternFields).filter((field) => newPatternFields.has(field as string)) as string[]),
        )
      }

      const recommendations = this.generateRecommendations(maxSimilarity, threshold, matchingFields)

      console.log("[v0] Similarity check complete - Score:", maxSimilarity, "Similar:", maxSimilarity > threshold)

      return {
        isSimilar: maxSimilarity > threshold,
        similarityScore: maxSimilarity,
        matchingFields,
        recommendations,
      }
    } catch (error) {
      console.error("[v0] Error checking similarity:", error)
      return {
        isSimilar: false,
        similarityScore: 0,
        matchingFields: [],
        recommendations: ["Error checking similarity - proceeding with generation"],
      }
    }
  }

  private normalizeValue(value: any): string {
    if (value === null || value === undefined) return "null"
    if (typeof value === "string") return value.toLowerCase().trim()
    if (typeof value === "number") return value.toString()
    if (typeof value === "boolean") return value.toString()
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  private inferDataType(value: string): string {
    if (value === "null") return "null"
    if (value === "true" || value === "false") return "boolean"
    if (!isNaN(Number(value))) return "number"
    if (value.includes("@")) return "email"
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) return "date"
    if (value.match(/^https?:\/\//)) return "url"
    if (value.length > 100) return "text"
    return "string"
  }

  private calculatePatternSimilarity(patterns1: DataPattern[], patterns2: any[]): number {
    if (!patterns1.length || !patterns2.length) return 0

    const fields1 = new Set(patterns1.map((p) => p.fieldName))
    const fields2 = new Set(patterns2.map((p: any) => p.field))

    // Calculate field overlap
    const commonFields = Array.from(fields1).filter((field) => fields2.has(field))
    const fieldSimilarity = commonFields.length / Math.max(fields1.size, fields2.size)

    // Calculate frequency similarity for common fields
    let frequencySimilarity = 0
    if (commonFields.length > 0) {
      const frequencyDiffs = commonFields.map((field) => {
        const pattern1 = patterns1.find((p) => p.fieldName === field)
        const pattern2 = patterns2.find((p: any) => p.field === field)

        if (pattern1 && pattern2) {
          const freq1 = pattern1.frequency / (pattern1.context.totalRecords || 1)
          const freq2 = pattern2.frequency / (pattern2.totalRecords || 1)
          return Math.abs(freq1 - freq2)
        }
        return 1
      })

      frequencySimilarity = 1 - frequencyDiffs.reduce((sum, diff) => sum + diff, 0) / commonFields.length
    }

    // Weighted combination
    return fieldSimilarity * 0.6 + frequencySimilarity * 0.4
  }

  private generateRecommendations(similarity: number, threshold: number, matchingFields: string[]): string[] {
    const recommendations: string[] = []

    if (similarity > threshold) {
      recommendations.push(
        `High similarity detected (${(similarity * 100).toFixed(1)}%) - consider varying generation parameters`,
      )

      if (matchingFields.length > 0) {
        recommendations.push(`Similar patterns found in fields: ${matchingFields.join(", ")}`)
        recommendations.push("Suggestion: Use different seed categories or adjust field types")
      }
    } else if (similarity > threshold * 0.5) {
      recommendations.push("Moderate similarity detected - generation has some overlap with recent data")
      recommendations.push("Consider using different seed templates for better variation")
    } else {
      recommendations.push("Low similarity - generation appears unique and varied")
    }

    return recommendations
  }

  async getPatternInsights(jobId: string): Promise<{
    totalPatterns: number
    uniqueFields: number
    averageFrequency: number
    recommendations: string[]
  }> {
    console.log("[v0] Getting pattern insights for job:", jobId)

    try {
      const patterns = await this.usageTracker.getRecentPatterns(jobId, 168) // Last week

      if (patterns.length === 0) {
        return {
          totalPatterns: 0,
          uniqueFields: 0,
          averageFrequency: 0,
          recommendations: ["No pattern data available yet"],
        }
      }

      const allPatternData = patterns.flatMap((p) => p.pattern_data.patterns || [])
      const uniqueFields = new Set(allPatternData.map((p: any) => p.field)).size
      const averageFrequency =
        allPatternData.reduce((sum: number, p: any) => sum + (p.frequency || 0), 0) / allPatternData.length

      const recommendations = [
        `Analyzed ${patterns.length} generation sessions`,
        `Found patterns across ${uniqueFields} unique fields`,
        averageFrequency > 10
          ? "High repetition detected - consider more seed variety"
          : "Good variation in generated data",
      ]

      console.log("[v0] Pattern insights generated")

      return {
        totalPatterns: allPatternData.length,
        uniqueFields,
        averageFrequency,
        recommendations,
      }
    } catch (error) {
      console.error("[v0] Error getting pattern insights:", error)
      return {
        totalPatterns: 0,
        uniqueFields: 0,
        averageFrequency: 0,
        recommendations: ["Error analyzing patterns"],
      }
    }
  }
}
