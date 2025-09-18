export interface DistributionRule {
  fieldName: string
  targetDistribution: Record<string, number> // value -> percentage
  tolerance: number // Acceptable deviation percentage
  priority: "high" | "medium" | "low"
}

export interface DistributionResult {
  fieldName: string
  actualDistribution: Record<string, number>
  targetDistribution: Record<string, number>
  deviation: number
  withinTolerance: boolean
  recommendations: string[]
}

export class DistributionManager {
  private rules: DistributionRule[] = []

  constructor() {
    // Initialize with common realistic distributions
    this.initializeDefaultRules()
  }

  private initializeDefaultRules(): void {
    console.log("[v0] Initializing default distribution rules")

    // Age distribution (realistic population demographics)
    this.addRule({
      fieldName: "age",
      targetDistribution: {
        "18-25": 15,
        "26-35": 25,
        "36-45": 20,
        "46-55": 18,
        "56-65": 12,
        "65+": 10,
      },
      tolerance: 5,
      priority: "high",
    })

    // Gender distribution
    this.addRule({
      fieldName: "gender",
      targetDistribution: {
        male: 49,
        female: 49,
        other: 2,
      },
      tolerance: 3,
      priority: "high",
    })

    // Location distribution (US-based example)
    this.addRule({
      fieldName: "location",
      targetDistribution: {
        urban: 60,
        suburban: 30,
        rural: 10,
      },
      tolerance: 5,
      priority: "medium",
    })

    // Income brackets
    this.addRule({
      fieldName: "income",
      targetDistribution: {
        low: 25,
        middle: 50,
        high: 20,
        very_high: 5,
      },
      tolerance: 5,
      priority: "medium",
    })

    console.log("[v0] Default distribution rules initialized:", this.rules.length)
  }

  addRule(rule: DistributionRule): void {
    console.log("[v0] Adding distribution rule for field:", rule.fieldName)

    // Remove existing rule for the same field
    this.rules = this.rules.filter((r) => r.fieldName !== rule.fieldName)

    // Validate that percentages sum to 100
    const total = Object.values(rule.targetDistribution).reduce((sum, pct) => sum + pct, 0)
    if (Math.abs(total - 100) > 0.1) {
      console.warn("[v0] Distribution percentages do not sum to 100:", total)
      // Normalize the distribution
      Object.keys(rule.targetDistribution).forEach((key) => {
        rule.targetDistribution[key] = (rule.targetDistribution[key] / total) * 100
      })
    }

    this.rules.push(rule)
    console.log("[v0] Distribution rule added successfully")
  }

  analyzeDistribution(data: Record<string, any>[], fieldName: string): DistributionResult {
    console.log("[v0] Analyzing distribution for field:", fieldName, "records:", data.length)

    const rule = this.rules.find((r) => r.fieldName === fieldName)
    if (!rule) {
      console.log("[v0] No distribution rule found for field:", fieldName)
      return {
        fieldName,
        actualDistribution: {},
        targetDistribution: {},
        deviation: 0,
        withinTolerance: true,
        recommendations: ["No distribution rule defined for this field"],
      }
    }

    // Calculate actual distribution
    const valueCounts: Record<string, number> = {}
    data.forEach((record) => {
      const value = this.normalizeValue(record[fieldName])
      valueCounts[value] = (valueCounts[value] || 0) + 1
    })

    const actualDistribution: Record<string, number> = {}
    Object.entries(valueCounts).forEach(([value, count]) => {
      actualDistribution[value] = (count / data.length) * 100
    })

    // Calculate deviation from target
    const deviation = this.calculateDeviation(actualDistribution, rule.targetDistribution)
    const withinTolerance = deviation <= rule.tolerance

    const recommendations = this.generateDistributionRecommendations(
      actualDistribution,
      rule.targetDistribution,
      deviation,
      rule.tolerance,
    )

    console.log(
      "[v0] Distribution analysis complete - Deviation:",
      deviation.toFixed(2),
      "% Within tolerance:",
      withinTolerance,
    )

    return {
      fieldName,
      actualDistribution,
      targetDistribution: rule.targetDistribution,
      deviation,
      withinTolerance,
      recommendations,
    }
  }

  generateBalancedValues(fieldName: string, count: number): string[] {
    console.log("[v0] Generating balanced values for field:", fieldName, "count:", count)

    const rule = this.rules.find((r) => r.fieldName === fieldName)
    if (!rule) {
      console.log("[v0] No rule found, generating random values")
      return Array(count).fill("unknown")
    }

    const values: string[] = []
    const targetCounts: Record<string, number> = {}

    // Calculate target counts for each value
    Object.entries(rule.targetDistribution).forEach(([value, percentage]) => {
      targetCounts[value] = Math.round((percentage / 100) * count)
    })

    // Adjust for rounding errors
    const totalTargetCount = Object.values(targetCounts).reduce((sum, count) => sum + count, 0)
    if (totalTargetCount !== count) {
      const diff = count - totalTargetCount
      const firstKey = Object.keys(targetCounts)[0]
      targetCounts[firstKey] += diff
    }

    // Generate values according to target distribution
    Object.entries(targetCounts).forEach(([value, targetCount]) => {
      for (let i = 0; i < targetCount; i++) {
        values.push(value)
      }
    })

    // Shuffle to avoid patterns
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[values[i], values[j]] = [values[j], values[i]]
    }

    console.log("[v0] Generated balanced values:", values.length)
    return values
  }

  private normalizeValue(value: any): string {
    if (value === null || value === undefined) return "null"
    return String(value).toLowerCase().trim()
  }

  private calculateDeviation(actual: Record<string, number>, target: Record<string, number>): number {
    const allKeys = new Set([...Object.keys(actual), ...Object.keys(target)])
    let totalDeviation = 0

    allKeys.forEach((key) => {
      const actualPct = actual[key] || 0
      const targetPct = target[key] || 0
      totalDeviation += Math.abs(actualPct - targetPct)
    })

    return totalDeviation / 2 // Divide by 2 since deviations are counted twice
  }

  private generateDistributionRecommendations(
    actual: Record<string, number>,
    target: Record<string, number>,
    deviation: number,
    tolerance: number,
  ): string[] {
    const recommendations: string[] = []

    if (deviation <= tolerance) {
      recommendations.push("Distribution is within acceptable tolerance")
    } else {
      recommendations.push(`Distribution deviation (${deviation.toFixed(1)}%) exceeds tolerance (${tolerance}%)`)

      // Identify specific values that are over/under represented
      Object.entries(target).forEach(([value, targetPct]) => {
        const actualPct = actual[value] || 0
        const diff = actualPct - targetPct

        if (Math.abs(diff) > tolerance) {
          if (diff > 0) {
            recommendations.push(`"${value}" is over-represented by ${diff.toFixed(1)}%`)
          } else {
            recommendations.push(`"${value}" is under-represented by ${Math.abs(diff).toFixed(1)}%`)
          }
        }
      })

      recommendations.push("Consider adjusting seed selection or generation parameters")
    }

    return recommendations
  }

  getDistributionRules(): DistributionRule[] {
    return [...this.rules]
  }

  removeRule(fieldName: string): boolean {
    const initialLength = this.rules.length
    this.rules = this.rules.filter((r) => r.fieldName !== fieldName)
    const removed = this.rules.length < initialLength

    if (removed) {
      console.log("[v0] Removed distribution rule for field:", fieldName)
    }

    return removed
  }

  analyzeAllFields(data: Record<string, any>[]): DistributionResult[] {
    console.log("[v0] Analyzing distribution for all fields with rules")

    const results: DistributionResult[] = []

    this.rules.forEach((rule) => {
      const result = this.analyzeDistribution(data, rule.fieldName)
      results.push(result)
    })

    console.log("[v0] Distribution analysis complete for", results.length, "fields")
    return results
  }
}
